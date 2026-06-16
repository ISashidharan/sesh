import { DateTime } from "luxon";

/** True if `tz` is a valid IANA timezone in this runtime's tz database. */
export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

/** Assert a valid timezone or throw the given error factory. */
export function assertTimezone(tz: string, makeError: (m: string) => Error): void {
  if (!isValidTimezone(tz)) throw makeError(`Invalid timezone: ${tz}`);
}
