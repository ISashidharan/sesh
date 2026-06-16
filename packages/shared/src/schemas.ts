import { z } from "zod";
import { ExceptionType, MINUTES_IN_DAY, Role, SeshStatus } from "./enums.js";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Minutes from midnight, 0..1440 (1440 = end of day). */
export const minuteOfDay = z.number().int().min(0).max(MINUTES_IN_DAY);

/** 0 = Sunday … 6 = Saturday. */
export const weekday = z.number().int().min(0).max(6);

/** IANA timezone string, e.g. "America/New_York". Loosely validated here; the
 *  API verifies it against the runtime tz database. */
export const timezone = z.string().min(1).max(64);

// ---------------------------------------------------------------------------
// Tenant / onboarding
// ---------------------------------------------------------------------------

export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: "slug must be lowercase letters, numbers, and hyphens",
  });

export const onboardTenantSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(120),
  timezone: timezone.default("UTC"),
  ownerEmail: z.string().email(),
  // Dev-auth bootstrap: the Clerk user id to attach as owner.
  // In production this is derived from the verified session, not the body.
  ownerClerkUserId: z.string().min(1).optional(),
});
export type OnboardTenantInput = z.infer<typeof onboardTenantSchema>;

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export const createCalendarSchema = z.object({
  name: z.string().min(1).max(120),
  timezone: timezone.default("UTC"),
});
export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;

export const updateCalendarSchema = createCalendarSchema
  .extend({ active: z.boolean() })
  .partial();
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;

// ---------------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------------

export const workingHoursEntrySchema = z
  .object({ weekday, startMin: minuteOfDay, endMin: minuteOfDay })
  .refine((v) => v.startMin < v.endMin, {
    message: "startMin must be before endMin",
    path: ["endMin"],
  });
export type WorkingHoursEntry = z.infer<typeof workingHoursEntrySchema>;

/** Replace the full weekly schedule for a calendar in one call. */
export const setWorkingHoursSchema = z.object({
  entries: z.array(workingHoursEntrySchema).max(100),
});
export type SetWorkingHoursInput = z.infer<typeof setWorkingHoursSchema>;

export const createExceptionSchema = z
  .object({
    date: z.string().date(), // YYYY-MM-DD
    type: z.nativeEnum(ExceptionType),
    startMin: minuteOfDay.optional(),
    endMin: minuteOfDay.optional(),
  })
  .refine(
    (v) =>
      v.type === ExceptionType.closed ||
      (v.startMin !== undefined &&
        v.endMin !== undefined &&
        v.startMin < v.endMin),
    {
      message: "custom exceptions require startMin < endMin",
      path: ["endMin"],
    },
  );
export type CreateExceptionInput = z.infer<typeof createExceptionSchema>;

// ---------------------------------------------------------------------------
// Sesh types
// ---------------------------------------------------------------------------

export const createSeshTypeSchema = z.object({
  name: z.string().min(1).max(120),
  durationMin: z.number().int().min(5).max(MINUTES_IN_DAY),
  bufferBeforeMin: z.number().int().min(0).max(240).default(0),
  bufferAfterMin: z.number().int().min(0).max(240).default(0),
  priceCents: z.number().int().min(0).optional(),
});
export type CreateSeshTypeInput = z.infer<typeof createSeshTypeSchema>;

export const updateSeshTypeSchema = createSeshTypeSchema
  .extend({ active: z.boolean() })
  .partial();
export type UpdateSeshTypeInput = z.infer<typeof updateSeshTypeSchema>;

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const availabilityQuerySchema = z.object({
  calendarId: z.string().min(1),
  seshTypeId: z.string().min(1),
  from: z.string().date(), // inclusive YYYY-MM-DD
  to: z.string().date(), // inclusive YYYY-MM-DD
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const slotSchema = z.object({
  startsAt: z.string().datetime(), // ISO 8601 UTC
  endsAt: z.string().datetime(),
});
export type Slot = z.infer<typeof slotSchema>;

// ---------------------------------------------------------------------------
// Seshes (bookings)
// ---------------------------------------------------------------------------

export const customerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

/** Public booking: end-user picks a slot. endsAt is derived server-side from
 *  the sesh type duration, so only startsAt is required. */
export const createBookingSchema = z.object({
  calendarId: z.string().min(1),
  seshTypeId: z.string().min(1),
  startsAt: z.string().datetime(),
  customer: customerSchema,
  notes: z.string().max(2000).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const listSeshesQuerySchema = z.object({
  calendarId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.nativeEnum(SeshStatus).optional(),
});
export type ListSeshesQuery = z.infer<typeof listSeshesQuerySchema>;

export const rescheduleSeshSchema = z.object({
  startsAt: z.string().datetime(),
});
export type RescheduleSeshInput = z.infer<typeof rescheduleSeshSchema>;

// Re-export enums for convenience so consumers import everything from @sesh/shared.
export { ExceptionType, Role, SeshStatus };
