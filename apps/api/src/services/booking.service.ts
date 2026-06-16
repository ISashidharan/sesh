import type { Prisma } from "@prisma/client";
import type {
  CreateBookingInput,
  ListSeshesQuery,
  RescheduleSeshInput,
} from "@sesh/shared";
import { DateTime } from "luxon";
import type { EventDetails } from "../lib/calendar-provider.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { getProviderForCalendar } from "./calendar-connection.service.js";
import { assertWithinWorkingHours } from "./availability.service.js";
import { getCalendar } from "./calendar.service.js";
import { getSeshType } from "./sesh-type.service.js";

interface BookingOptions {
  /** End-user bookings must be in the future; admins may backfill. */
  enforceFuture?: boolean;
  /** Admin-created bookings are auto-verified; public bookings require email confirmation. */
  emailVerified?: boolean;
}

/** The occupied window for a sesh = appointment expanded by its buffers. */
function blockWindow(
  start: DateTime,
  end: DateTime,
  bufferBeforeMin: number,
  bufferAfterMin: number,
) {
  return {
    blockStart: start.minus({ minutes: bufferBeforeMin }),
    blockEnd: end.plus({ minutes: bufferAfterMin }),
  };
}

/** Throw 409 if any booked sesh's blocked window overlaps this one. */
async function ensureNoClash(
  tx: Prisma.TransactionClient,
  args: {
    calendarId: string;
    blockStart: DateTime;
    blockEnd: DateTime;
    excludeSeshId?: string;
  },
): Promise<void> {
  const clash = await tx.sesh.findFirst({
    where: {
      calendarId: args.calendarId,
      status: "booked",
      ...(args.excludeSeshId ? { id: { not: args.excludeSeshId } } : {}),
      blockStartsAt: { lt: args.blockEnd.toJSDate() },
      blockEndsAt: { gt: args.blockStart.toJSDate() },
    },
    select: { id: true },
  });
  if (clash) throw conflict("That time is no longer available");
}

export async function createSesh(
  tenantId: string,
  input: CreateBookingInput,
  { enforceFuture = true, emailVerified = false }: BookingOptions = {},
) {
  const calendar = await getCalendar(tenantId, input.calendarId);
  const seshType = await getSeshType(tenantId, input.seshTypeId);
  if (!seshType.active) throw badRequest("Sesh type is not active");

  const start = DateTime.fromISO(input.startsAt, { zone: "utc" });
  if (!start.isValid) throw badRequest("Invalid startsAt");
  const end = start.plus({ minutes: seshType.durationMin });
  if (enforceFuture && start <= DateTime.utc()) {
    throw badRequest("Cannot book a time in the past");
  }

  await assertWithinWorkingHours(calendar, start, end);

  const { blockStart, blockEnd } = blockWindow(
    start,
    end,
    seshType.bufferBeforeMin,
    seshType.bufferAfterMin,
  );

  // Serializable so two racing bookings for the last slot can't both succeed.
  const sesh = await prisma.$transaction(
    async (tx) => {
      await ensureNoClash(tx, {
        calendarId: input.calendarId,
        blockStart,
        blockEnd,
      });

      const customer = await tx.customer.upsert({
        where: { tenantId_email: { tenantId, email: input.customer.email } },
        create: {
          tenantId,
          email: input.customer.email,
          name: input.customer.name ?? null,
          phone: input.customer.phone ?? null,
        },
        update: {
          name: input.customer.name ?? undefined,
          phone: input.customer.phone ?? undefined,
        },
      });

      return tx.sesh.create({
        data: {
          tenantId,
          calendarId: input.calendarId,
          seshTypeId: input.seshTypeId,
          customerId: customer.id,
          startsAt: start.toJSDate(),
          endsAt: end.toJSDate(),
          blockStartsAt: blockStart.toJSDate(),
          blockEndsAt: blockEnd.toJSDate(),
          notes: input.notes ?? null,
          emailVerified,
        },
        include: { customer: true, seshType: true, calendar: { select: { id: true, name: true } } },
      });
    },
    { isolationLevel: "Serializable" },
  );

  // Push to Google Calendar. Non-fatal: a sync failure must not roll back the booking.
  void pushCreateEvent(sesh, calendar, seshType).catch((err) =>
    console.error("[booking] Google Calendar create failed:", err),
  );

  return sesh;
}

export function listSeshes(tenantId: string, q: ListSeshesQuery) {
  const startsAt =
    q.from || q.to
      ? {
          ...(q.from ? { gte: new Date(q.from) } : {}),
          ...(q.to ? { lt: new Date(q.to) } : {}),
        }
      : undefined;

  return prisma.sesh.findMany({
    where: {
      tenantId,
      ...(q.calendarId ? { calendarId: q.calendarId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(startsAt ? { startsAt } : {}),
    },
    orderBy: { startsAt: "asc" },
    include: {
      customer: true,
      seshType: true,
      calendar: { select: { id: true, name: true } },
    },
  });
}

export async function getSesh(tenantId: string, id: string) {
  const sesh = await prisma.sesh.findFirst({
    where: { id, tenantId },
    include: { customer: true, seshType: true, calendar: { select: { id: true, name: true } } },
  });
  if (!sesh) throw notFound("Sesh not found");
  return sesh;
}

export async function cancelSesh(tenantId: string, id: string) {
  const sesh = await prisma.sesh.findFirst({
    where: { id, tenantId },
    include: { customer: true, seshType: true, calendar: { select: { id: true, name: true } } },
  });
  if (!sesh) throw notFound("Sesh not found");

  const updated = await prisma.sesh.update({
    where: { id },
    data: { status: "cancelled" },
    include: { customer: true, seshType: true, calendar: { select: { id: true, name: true } } },
  });

  if (sesh.externalEventId) {
    void pushDeleteEvent(sesh.calendarId, sesh.externalEventId).catch((err) =>
      console.error("[booking] Google Calendar delete failed:", err),
    );
  }

  return updated;
}

export async function rescheduleSesh(
  tenantId: string,
  id: string,
  input: RescheduleSeshInput,
  { enforceFuture = true }: BookingOptions = {},
) {
  const sesh = await prisma.sesh.findFirst({
    where: { id, tenantId },
    include: { seshType: true, calendar: true },
  });
  if (!sesh) throw notFound("Sesh not found");
  if (sesh.status !== "booked") {
    throw badRequest("Only booked seshes can be rescheduled");
  }

  const start = DateTime.fromISO(input.startsAt, { zone: "utc" });
  if (!start.isValid) throw badRequest("Invalid startsAt");
  const end = start.plus({ minutes: sesh.seshType.durationMin });
  if (enforceFuture && start <= DateTime.utc()) {
    throw badRequest("Cannot reschedule to the past");
  }

  await assertWithinWorkingHours(sesh.calendar, start, end);

  const { blockStart, blockEnd } = blockWindow(
    start,
    end,
    sesh.seshType.bufferBeforeMin,
    sesh.seshType.bufferAfterMin,
  );

  const rescheduled = await prisma.$transaction(
    async (tx) => {
      await ensureNoClash(tx, {
        calendarId: sesh.calendarId,
        blockStart,
        blockEnd,
        excludeSeshId: id,
      });
      return tx.sesh.update({
        where: { id },
        data: {
          startsAt: start.toJSDate(),
          endsAt: end.toJSDate(),
          blockStartsAt: blockStart.toJSDate(),
          blockEndsAt: blockEnd.toJSDate(),
        },
        include: { customer: true, seshType: true, calendar: { select: { id: true, name: true } } },
      });
    },
    { isolationLevel: "Serializable" },
  );

  if (sesh.externalEventId) {
    const eventDetails = buildEventDetails(rescheduled, sesh.calendar);
    void pushUpdateEvent(
      sesh.calendarId,
      sesh.externalEventId,
      eventDetails,
    ).catch((err) =>
      console.error("[booking] Google Calendar update failed:", err),
    );
  }

  return rescheduled;
}

export async function verifySesh(tenantId: string, id: string) {
  await getSesh(tenantId, id);
  return prisma.sesh.update({
    where: { id },
    data: { emailVerified: true },
    include: { customer: true, seshType: true, calendar: { select: { id: true, name: true } } },
  });
}

// ---- Google Calendar push helpers ------------------------------------------

type SeshWithIncludes = {
  id: string;
  calendarId: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  customer: { email: string; name: string | null };
  seshType: { name: string };
};

function buildEventDetails(
  sesh: SeshWithIncludes,
  calendar: { timezone: string },
): EventDetails {
  return {
    summary: sesh.seshType.name,
    description: sesh.notes ?? undefined,
    startISO: sesh.startsAt.toISOString(),
    endISO: sesh.endsAt.toISOString(),
    timezone: calendar.timezone,
    attendeeEmail: sesh.customer.email,
    attendeeName: sesh.customer.name ?? undefined,
  };
}

async function pushCreateEvent(
  sesh: SeshWithIncludes,
  calendar: { id: string; timezone: string },
  _seshType: { name: string },
) {
  const provider = await getProviderForCalendar(calendar.id);
  if (!provider) return;

  const conn = await import("../lib/prisma.js").then(({ prisma: p }) =>
    p.calendarConnection.findUnique({
      where: { calendarId: calendar.id },
      select: { externalCalendarId: true },
    }),
  );
  if (!conn) return;

  const externalEventId = await provider.createEvent(
    conn.externalCalendarId,
    buildEventDetails(sesh, calendar),
  );

  await import("../lib/prisma.js").then(({ prisma: p }) =>
    p.sesh.update({ where: { id: sesh.id }, data: { externalEventId } }),
  );
}

async function pushUpdateEvent(
  calendarId: string,
  externalEventId: string,
  eventDetails: EventDetails,
) {
  const provider = await getProviderForCalendar(calendarId);
  if (!provider) return;

  const { prisma: p } = await import("../lib/prisma.js");
  const conn = await p.calendarConnection.findUnique({
    where: { calendarId },
    select: { externalCalendarId: true },
  });
  if (!conn) return;

  await provider.updateEvent(conn.externalCalendarId, externalEventId, eventDetails);
}

async function pushDeleteEvent(calendarId: string, externalEventId: string) {
  const provider = await getProviderForCalendar(calendarId);
  if (!provider) return;

  const { prisma: p } = await import("../lib/prisma.js");
  const conn = await p.calendarConnection.findUnique({
    where: { calendarId },
    select: { externalCalendarId: true },
  });
  if (!conn) return;

  await provider.deleteEvent(conn.externalCalendarId, externalEventId);
}
