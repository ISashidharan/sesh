import type { Prisma } from "@prisma/client";
import type {
  CreateBookingInput,
  ListSeshesQuery,
  RescheduleSeshInput,
} from "@sesh/shared";
import { DateTime } from "luxon";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assertWithinWorkingHours } from "./availability.service.js";
import { getCalendar } from "./calendar.service.js";
import { getSeshType } from "./sesh-type.service.js";

interface BookingOptions {
  /** End-user bookings must be in the future; admins may backfill. */
  enforceFuture?: boolean;
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
  { enforceFuture = true }: BookingOptions = {},
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
  return prisma.$transaction(
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
        },
        include: { customer: true, seshType: true },
      });
    },
    { isolationLevel: "Serializable" },
  );
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
    include: { customer: true, seshType: true },
  });
  if (!sesh) throw notFound("Sesh not found");
  return sesh;
}

export async function cancelSesh(tenantId: string, id: string) {
  await getSesh(tenantId, id);
  return prisma.sesh.update({
    where: { id },
    data: { status: "cancelled" },
    include: { customer: true, seshType: true },
  });
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

  return prisma.$transaction(
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
        include: { customer: true, seshType: true },
      });
    },
    { isolationLevel: "Serializable" },
  );
}
