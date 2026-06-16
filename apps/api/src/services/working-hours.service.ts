import type {
  CreateExceptionInput,
  SetWorkingHoursInput,
} from "@sesh/shared";
import { badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { getCalendar } from "./calendar.service.js";

/** Weekly recurring schedule for a calendar. */
export async function getWorkingHours(tenantId: string, calendarId: string) {
  await getCalendar(tenantId, calendarId); // tenant ownership check
  return prisma.workingHours.findMany({
    where: { calendarId },
    orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
  });
}

/** Replace the entire weekly schedule in one transaction. */
export async function setWorkingHours(
  tenantId: string,
  calendarId: string,
  input: SetWorkingHoursInput,
) {
  await getCalendar(tenantId, calendarId);

  // Reject overlapping intervals on the same weekday.
  const byDay = new Map<number, { startMin: number; endMin: number }[]>();
  for (const e of input.entries) {
    const list = byDay.get(e.weekday) ?? [];
    list.push(e);
    byDay.set(e.weekday, list);
  }
  for (const [weekday, list] of byDay) {
    list.sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < list.length; i++) {
      if (list[i]!.startMin < list[i - 1]!.endMin) {
        throw badRequest(`Overlapping working hours on weekday ${weekday}`);
      }
    }
  }

  await prisma.$transaction([
    prisma.workingHours.deleteMany({ where: { calendarId } }),
    prisma.workingHours.createMany({
      data: input.entries.map((e) => ({ calendarId, ...e })),
    }),
  ]);

  return getWorkingHours(tenantId, calendarId);
}

export async function listExceptions(tenantId: string, calendarId: string) {
  await getCalendar(tenantId, calendarId);
  return prisma.availabilityException.findMany({
    where: { calendarId },
    orderBy: { date: "asc" },
  });
}

export async function upsertException(
  tenantId: string,
  calendarId: string,
  input: CreateExceptionInput,
) {
  await getCalendar(tenantId, calendarId);
  const date = new Date(`${input.date}T00:00:00.000Z`);
  return prisma.availabilityException.upsert({
    where: { calendarId_date: { calendarId, date } },
    create: {
      calendarId,
      date,
      type: input.type,
      startMin: input.startMin ?? null,
      endMin: input.endMin ?? null,
    },
    update: {
      type: input.type,
      startMin: input.startMin ?? null,
      endMin: input.endMin ?? null,
    },
  });
}

export async function deleteException(
  tenantId: string,
  calendarId: string,
  exceptionId: string,
) {
  await getCalendar(tenantId, calendarId);
  const ex = await prisma.availabilityException.findFirst({
    where: { id: exceptionId, calendarId },
  });
  if (!ex) throw notFound("Exception not found");
  await prisma.availabilityException.delete({ where: { id: exceptionId } });
}
