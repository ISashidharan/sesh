import { env } from "../lib/env.js";
import { badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import type { CalendarProvider } from "../lib/calendar-provider.js";
import {
  GoogleCalendarProvider,
  buildOAuth2Client,
  exchangeCode,
  getAuthUrl,
  listGoogleCalendars,
} from "../lib/google-calendar.js";

export function googleSyncEnabled(): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function requireGoogleSync() {
  if (!googleSyncEnabled()) {
    throw badRequest(
      "Google Calendar sync is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
    );
  }
}

/** State token stored in the OAuth redirect. Identifies which calendar to link. */
interface OAuthState {
  tenantId: string;
  calendarId: string;
}

function encodeState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

function decodeState(raw: string): OAuthState {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as OAuthState;
  } catch {
    throw badRequest("Invalid OAuth state parameter");
  }
}

/** Begin OAuth: return the Google consent URL for the given calendar. */
export function initiateGoogleOAuth(
  tenantId: string,
  calendarId: string,
): string {
  requireGoogleSync();
  const state = encodeState({ tenantId, calendarId });
  return getAuthUrl(state);
}

/** Handle the OAuth callback: exchange code, persist tokens, return connection. */
export async function completeGoogleOAuth(
  code: string,
  rawState: string,
  externalCalendarId = "primary",
) {
  requireGoogleSync();
  const { tenantId, calendarId } = decodeState(rawState);

  const tokens = await exchangeCode(code);

  return prisma.calendarConnection.upsert({
    where: { calendarId },
    create: {
      tenantId,
      calendarId,
      provider: "google",
      externalCalendarId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
    },
    update: {
      externalCalendarId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      syncEnabled: true,
    },
  });
}

export function listConnections(tenantId: string) {
  return prisma.calendarConnection.findMany({
    where: { tenantId },
    select: {
      id: true,
      calendarId: true,
      provider: true,
      externalCalendarId: true,
      syncEnabled: true,
      createdAt: true,
      calendar: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getConnection(tenantId: string, id: string) {
  const conn = await prisma.calendarConnection.findFirst({
    where: { id, tenantId },
  });
  if (!conn) throw notFound("Calendar connection not found");
  return conn;
}

export async function deleteConnection(tenantId: string, id: string) {
  await getConnection(tenantId, id);
  await prisma.calendarConnection.delete({ where: { id } });
}

export async function toggleSync(
  tenantId: string,
  id: string,
  syncEnabled: boolean,
) {
  await getConnection(tenantId, id);
  return prisma.calendarConnection.update({
    where: { id },
    data: { syncEnabled },
  });
}

/**
 * Return a CalendarProvider for the given calendar if a sync-enabled
 * connection exists, or null if the calendar has no integration.
 */
export async function getProviderForCalendar(
  calendarId: string,
): Promise<CalendarProvider | null> {
  if (!googleSyncEnabled()) return null;

  const conn = await prisma.calendarConnection.findUnique({
    where: { calendarId },
  });
  if (!conn || !conn.syncEnabled) return null;

  const auth = buildOAuth2Client(
    {
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      expiresAt: conn.tokenExpiresAt,
    },
    async (updated) => {
      await prisma.calendarConnection.update({
        where: { id: conn.id },
        data: {
          accessToken: updated.accessToken,
          tokenExpiresAt: updated.expiresAt,
        },
      });
    },
  );

  return new GoogleCalendarProvider(auth);
}

/** List Google Calendars on the connected account (for the picker in the UI). */
export async function listExternalCalendars(tenantId: string, calendarId: string) {
  requireGoogleSync();
  const conn = await prisma.calendarConnection.findFirst({
    where: { calendarId, tenantId },
  });
  if (!conn) throw notFound("No Google Calendar connection for this calendar");

  const auth = buildOAuth2Client({
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    expiresAt: conn.tokenExpiresAt,
  });

  return listGoogleCalendars(auth);
}
