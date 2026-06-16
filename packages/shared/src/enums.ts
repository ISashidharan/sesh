// Domain enums shared between API and web.
// Values mirror the Prisma enums in apps/api/prisma/schema.prisma.

export const Role = {
  owner: "owner",
  admin: "admin",
  staff: "staff",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const SeshStatus = {
  booked: "booked",
  cancelled: "cancelled",
  completed: "completed",
} as const;
export type SeshStatus = (typeof SeshStatus)[keyof typeof SeshStatus];

export const ExceptionType = {
  /** Calendar is fully closed on this date. */
  closed: "closed",
  /** Calendar has custom hours on this date (startMin/endMin apply). */
  custom: "custom",
} as const;
export type ExceptionType = (typeof ExceptionType)[keyof typeof ExceptionType];

/** 0 = Sunday … 6 = Saturday (matches JS Date.getDay()). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const MINUTES_IN_DAY = 24 * 60;
