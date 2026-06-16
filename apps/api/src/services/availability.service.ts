import type {
  AvailabilityException,
  Calendar,
  WorkingHours,
} from "@prisma/client";
import type { AvailabilityQuery, Slot } from "@sesh/shared";
import { DateTime } from "luxon";
import { badRequest } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { getCalendar } from "./calendar.service.js";
import { getSeshType } from "./sesh-type.service.js";

const MAX_RANGE_DAYS = 92;

interface DayInterval {
  startMin: number;
  endMin: number;
}

/** luxon weekday is 1=Mon..7=Sun; convert to our 0=Sun..6=Sat. */
function toWeekday(dt: DateTime): number {
  return dt.weekday % 7;
}

function dateKey(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function isoOrThrow(dt: DateTime): string {
  const s = dt.toUTC().toISO();
  if (!s) throw badRequest("Invalid date/time");
  return s;
}

/**
 * The bookable intervals (minutes-from-midnight) for a single calendar date:
 * an exception overrides the recurring weekly hours (closed → none,
 * custom → its own window); otherwise the weekday's working hours apply.
 */
function resolveDayIntervals(
  isoDate: string,
  weekday: number,
  workingHours: Pick<WorkingHours, "weekday" | "startMin" | "endMin">[],
  exceptions: Pick<
    AvailabilityException,
    "date" | "type" | "startMin" | "endMin"
  >[],
): DayInterval[] {
  const ex = exceptions.find(
    (e) => DateTime.fromJSDate(e.date, { zone: "utc" }).toISODate() === isoDate,
  );
  if (ex) {
    if (ex.type === "closed") return [];
    if (ex.startMin != null && ex.endMin != null) {
      return [{ startMin: ex.startMin, endMin: ex.endMin }];
    }
    return [];
  }
  return workingHours
    .filter((w) => w.weekday === weekday)
    .map((w) => ({ startMin: w.startMin, endMin: w.endMin }));
}

/**
 * Compute bookable slots for a calendar + sesh type over a date range.
 *
 *   working hours − exceptions − existing seshes (± buffers) → open slots
 *
 * Slots are stepped by the sesh type's duration and returned as UTC ISO times.
 */
export async function computeAvailability(
  tenantId: string,
  query: AvailabilityQuery,
): Promise<Slot[]> {
  const calendar = await getCalendar(tenantId, query.calendarId);
  const seshType = await getSeshType(tenantId, query.seshTypeId);
  if (!seshType.active) throw badRequest("Sesh type is not active");

  const tz = calendar.timezone;
  const from = DateTime.fromISO(query.from, { zone: tz }).startOf("day");
  const to = DateTime.fromISO(query.to, { zone: tz }).startOf("day");
  if (!from.isValid || !to.isValid) throw badRequest("Invalid date range");
  if (to < from) throw badRequest("`to` must be on or after `from`");
  if (to.diff(from, "days").days > MAX_RANGE_DAYS) {
    throw badRequest(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }

  const [workingHours, exceptions, seshes] = await Promise.all([
    prisma.workingHours.findMany({ where: { calendarId: calendar.id } }),
    prisma.availabilityException.findMany({
      where: {
        calendarId: calendar.id,
        date: { gte: dateKey(from.toISODate()!), lte: dateKey(to.toISODate()!) },
      },
    }),
    prisma.sesh.findMany({
      where: {
        calendarId: calendar.id,
        status: "booked",
        blockStartsAt: { lt: to.plus({ days: 1 }).toUTC().toJSDate() },
        blockEndsAt: { gt: from.toUTC().toJSDate() },
      },
      select: { blockStartsAt: true, blockEndsAt: true },
    }),
  ]);

  const now = DateTime.utc();
  const duration = seshType.durationMin;
  const slots: Slot[] = [];

  for (let day = from; day <= to; day = day.plus({ days: 1 })) {
    const isoDate = day.toISODate()!;
    const intervals = resolveDayIntervals(
      isoDate,
      toWeekday(day),
      workingHours,
      exceptions,
    );

    for (const interval of intervals) {
      for (
        let startMin = interval.startMin;
        startMin + duration <= interval.endMin;
        startMin += duration
      ) {
        const slotStart = day.plus({ minutes: startMin });
        const slotEnd = slotStart.plus({ minutes: duration });
        if (slotStart <= now) continue; // no booking in the past

        // Compare blocked windows (both sides expanded by their buffers).
        const candStart = slotStart.minus({ minutes: seshType.bufferBeforeMin });
        const candEnd = slotEnd.plus({ minutes: seshType.bufferAfterMin });
        const clash = seshes.some((s) => {
          const bStart = DateTime.fromJSDate(s.blockStartsAt);
          const bEnd = DateTime.fromJSDate(s.blockEndsAt);
          return bStart < candEnd && bEnd > candStart;
        });
        if (clash) continue;

        slots.push({
          startsAt: isoOrThrow(slotStart),
          endsAt: isoOrThrow(slotEnd),
        });
      }
    }
  }

  return slots;
}

/**
 * Assert that a [start, end) sesh falls entirely within the calendar's bookable
 * hours for that day. Throws 400 otherwise. Used by the booking service so a
 * direct POST can't bypass the slot grid.
 */
export async function assertWithinWorkingHours(
  calendar: Pick<Calendar, "id" | "timezone">,
  start: DateTime,
  end: DateTime,
): Promise<void> {
  const tz = calendar.timezone;
  const localStart = start.setZone(tz);
  const localEnd = end.setZone(tz);
  if (!localEnd.hasSame(localStart, "day")) {
    throw badRequest("A sesh must fall within a single day");
  }

  const dayStart = localStart.startOf("day");
  const startMin = Math.round(localStart.diff(dayStart, "minutes").minutes);
  const endMin = Math.round(localEnd.diff(dayStart, "minutes").minutes);
  const isoDate = localStart.toISODate()!;
  const weekday = toWeekday(localStart);

  const [workingHours, exceptions] = await Promise.all([
    prisma.workingHours.findMany({ where: { calendarId: calendar.id, weekday } }),
    prisma.availabilityException.findMany({
      where: { calendarId: calendar.id, date: dateKey(isoDate) },
    }),
  ]);

  const intervals = resolveDayIntervals(
    isoDate,
    weekday,
    workingHours,
    exceptions,
  );
  const fits = intervals.some(
    (iv) => startMin >= iv.startMin && endMin <= iv.endMin,
  );
  if (!fits) throw badRequest("Requested time is outside working hours");
}
