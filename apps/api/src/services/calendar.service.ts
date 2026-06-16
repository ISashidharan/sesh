import type {
  CreateCalendarInput,
  UpdateCalendarInput,
} from "@sesh/shared";
import { badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assertTimezone } from "../lib/time.js";

/** All calendar reads/writes are scoped by tenantId so cross-tenant access is
 *  impossible even with a guessed id. */

export function listCalendars(tenantId: string) {
  return prisma.calendar.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
}

/** Public-facing: only active calendars, minimal fields. */
export function listActiveCalendars(tenantId: string) {
  return prisma.calendar.findMany({
    where: { tenantId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, timezone: true },
  });
}

export async function getCalendar(tenantId: string, id: string) {
  const calendar = await prisma.calendar.findFirst({
    where: { id, tenantId },
  });
  if (!calendar) throw notFound("Calendar not found");
  return calendar;
}

export function createCalendar(tenantId: string, input: CreateCalendarInput) {
  assertTimezone(input.timezone, badRequest);
  return prisma.calendar.create({
    data: { tenantId, name: input.name, timezone: input.timezone },
  });
}

export async function updateCalendar(
  tenantId: string,
  id: string,
  input: UpdateCalendarInput,
) {
  if (input.timezone) assertTimezone(input.timezone, badRequest);
  await getCalendar(tenantId, id); // ensures it exists & belongs to tenant
  return prisma.calendar.update({
    where: { id },
    data: {
      name: input.name,
      timezone: input.timezone,
      active: input.active,
    },
  });
}

export async function deleteCalendar(tenantId: string, id: string) {
  await getCalendar(tenantId, id);
  await prisma.calendar.delete({ where: { id } });
}
