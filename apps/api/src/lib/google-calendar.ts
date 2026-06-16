import { google } from "googleapis";
import { DateTime } from "luxon";
import { env } from "./env.js";
import type {
  BusyInterval,
  CalendarProvider,
  EventDetails,
} from "./calendar-provider.js";

// Derive the OAuth2Client type from googleapis so there's a single declaration.
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Build an OAuth2Client pre-loaded with credentials so it can auto-refresh.
 * `onTokenRefresh` is called after a successful refresh so callers can persist
 * the new access token back to the database.
 */
export function buildOAuth2Client(
  tokens: GoogleTokens,
  onTokenRefresh?: (updated: GoogleTokens) => Promise<void>,
): OAuth2Client {
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt.getTime(),
  });
  if (onTokenRefresh) {
    client.on("tokens", (refreshed) => {
      void onTokenRefresh({
        accessToken: refreshed.access_token ?? tokens.accessToken,
        refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
        expiresAt: refreshed.expiry_date
          ? new Date(refreshed.expiry_date)
          : tokens.expiresAt,
      });
    });
  }
  return client;
}

/** Generate the Google OAuth consent-screen URL for a given state payload. */
export function getAuthUrl(state: string): string {
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // always return refresh_token
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    state,
  });
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Google did not return expected tokens");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000),
  };
}

/** List available calendars on the connected Google account. */
export async function listGoogleCalendars(
  auth: OAuth2Client,
): Promise<{ id: string; summary: string; primary: boolean }[]> {
  const cal = google.calendar({ version: "v3", auth });
  const res = await cal.calendarList.list({ minAccessRole: "writer" });
  return (res.data.items ?? []).map((item) => ({
    id: item.id ?? "",
    summary: item.summary ?? "",
    primary: item.primary ?? false,
  }));
}

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly auth: OAuth2Client) {}

  async listBusy(
    externalCalendarId: string,
    from: DateTime,
    to: DateTime,
  ): Promise<BusyInterval[]> {
    const cal = google.calendar({ version: "v3", auth: this.auth });
    const res = await cal.freebusy.query({
      requestBody: {
        timeMin: from.toUTC().toISO()!,
        timeMax: to.toUTC().toISO()!,
        items: [{ id: externalCalendarId }],
      },
    });
    const busy = res.data.calendars?.[externalCalendarId]?.busy ?? [];
    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({
        start: DateTime.fromISO(b.start!, { zone: "utc" }),
        end: DateTime.fromISO(b.end!, { zone: "utc" }),
      }));
  }

  async createEvent(
    externalCalendarId: string,
    event: EventDetails,
  ): Promise<string> {
    const cal = google.calendar({ version: "v3", auth: this.auth });
    const res = await cal.events.insert({
      calendarId: externalCalendarId,
      requestBody: buildEventBody(event),
    });
    if (!res.data.id) throw new Error("Google Calendar did not return event id");
    return res.data.id;
  }

  async updateEvent(
    externalCalendarId: string,
    externalEventId: string,
    event: EventDetails,
  ): Promise<void> {
    const cal = google.calendar({ version: "v3", auth: this.auth });
    await cal.events.update({
      calendarId: externalCalendarId,
      eventId: externalEventId,
      requestBody: buildEventBody(event),
    });
  }

  async deleteEvent(
    externalCalendarId: string,
    externalEventId: string,
  ): Promise<void> {
    const cal = google.calendar({ version: "v3", auth: this.auth });
    await cal.events.delete({
      calendarId: externalCalendarId,
      eventId: externalEventId,
    });
  }
}

function buildEventBody(event: EventDetails) {
  return {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startISO, timeZone: event.timezone },
    end: { dateTime: event.endISO, timeZone: event.timezone },
    attendees: event.attendeeEmail
      ? [{ email: event.attendeeEmail, displayName: event.attendeeName }]
      : undefined,
  };
}
