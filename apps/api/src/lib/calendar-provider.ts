import type { DateTime } from "luxon";

export interface BusyInterval {
  start: DateTime;
  end: DateTime;
}

export interface EventDetails {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  timezone: string;
  attendeeEmail?: string;
  attendeeName?: string;
}

export interface CalendarProvider {
  listBusy(
    externalCalendarId: string,
    from: DateTime,
    to: DateTime,
  ): Promise<BusyInterval[]>;

  createEvent(
    externalCalendarId: string,
    event: EventDetails,
  ): Promise<string>; // returns external event id

  updateEvent(
    externalCalendarId: string,
    externalEventId: string,
    event: EventDetails,
  ): Promise<void>;

  deleteEvent(
    externalCalendarId: string,
    externalEventId: string,
  ): Promise<void>;
}
