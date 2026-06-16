import type {
  AvailabilityQuery,
  CreateBookingInput,
  CreateCalendarInput,
  CreateExceptionInput,
  CreateSeshTypeInput,
  SetWorkingHoursInput,
} from "@sesh/shared";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

// Dev auth fallback: when Clerk isn't configured (no token getter registered),
// the API runs with DEV_AUTH=true and trusts this header instead.
const DEV_CLERK_USER = "dev_owner";

// Bridge from React (Clerk's useAuth) into this plain module. When Clerk is
// enabled, the app registers a getter here that returns the current session
// token; authenticated requests then send `Authorization: Bearer <token>`.
let getSessionToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(
  getter: (() => Promise<string | null>) | null,
): void {
  getSessionToken = getter;
}

// ---- Response shapes (mirror the API) -------------------------------------

export interface Calendar {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
}

export interface SeshType {
  id: string;
  name: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  priceCents: number | null;
  active: boolean;
}

export interface WorkingHours {
  id: string;
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface AvailabilityException {
  id: string;
  date: string;
  type: "closed" | "custom";
  startMin: number | null;
  endMin: number | null;
}

export interface Sesh {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "booked" | "cancelled" | "completed";
  notes: string | null;
  emailVerified: boolean;
  customer: { email: string; name: string | null; phone: string | null };
  seshType: { name: string; durationMin: number };
  calendar?: { id: string; name: string };
}

export interface Slot {
  startsAt: string;
  endsAt: string;
}

export interface CalendarConnection {
  id: string;
  calendarId: string;
  provider: "google";
  externalCalendarId: string;
  syncEnabled: boolean;
  createdAt: string;
  calendar: { name: string };
}

export interface ExternalCalendar {
  id: string;
  summary: string;
  primary: boolean;
}

// ---- Core fetch -----------------------------------------------------------

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth) {
    const token = getSessionToken ? await getSessionToken() : null;
    if (token) {
      headers["authorization"] = `Bearer ${token}`;
    } else if (!getSessionToken) {
      // No Clerk configured — fall back to the dev-auth header.
      headers["x-dev-clerk-user"] = DEV_CLERK_USER;
    }
    // (Clerk configured but signed out → no auth header; API returns 401 and
    // the UI redirects to sign-in.)
  }

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.message ?? data.error ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const qs = (params: Record<string, string>) =>
  new URLSearchParams(params).toString();

// ---- API surface ----------------------------------------------------------

export const api = {
  // Admin — calendars
  listCalendars: () => request<Calendar[]>("/calendars", { auth: true }),
  createCalendar: (body: CreateCalendarInput) =>
    request<Calendar>("/calendars", { method: "POST", body, auth: true }),
  deleteCalendar: (id: string) =>
    request<void>(`/calendars/${id}`, { method: "DELETE", auth: true }),

  // Admin — working hours & exceptions
  getWorkingHours: (calendarId: string) =>
    request<WorkingHours[]>(`/calendars/${calendarId}/working-hours`, {
      auth: true,
    }),
  setWorkingHours: (calendarId: string, body: SetWorkingHoursInput) =>
    request<WorkingHours[]>(`/calendars/${calendarId}/working-hours`, {
      method: "PUT",
      body,
      auth: true,
    }),
  listExceptions: (calendarId: string) =>
    request<AvailabilityException[]>(`/calendars/${calendarId}/exceptions`, {
      auth: true,
    }),
  addException: (calendarId: string, body: CreateExceptionInput) =>
    request<AvailabilityException>(`/calendars/${calendarId}/exceptions`, {
      method: "POST",
      body,
      auth: true,
    }),
  deleteException: (calendarId: string, exceptionId: string) =>
    request<void>(`/calendars/${calendarId}/exceptions/${exceptionId}`, {
      method: "DELETE",
      auth: true,
    }),

  // Admin — sesh types
  listSeshTypes: () => request<SeshType[]>("/sesh-types", { auth: true }),
  createSeshType: (body: CreateSeshTypeInput) =>
    request<SeshType>("/sesh-types", { method: "POST", body, auth: true }),
  deleteSeshType: (id: string) =>
    request<void>(`/sesh-types/${id}`, { method: "DELETE", auth: true }),

  // Admin — seshes
  listSeshes: (params: Record<string, string> = {}) =>
    request<Sesh[]>(`/seshes?${qs(params)}`, { auth: true }),
  cancelSesh: (id: string) =>
    request<Sesh>(`/seshes/${id}/cancel`, { method: "POST", auth: true }),
  rescheduleSesh: (id: string, body: { startsAt: string }) =>
    request<Sesh>(`/seshes/${id}/reschedule`, { method: "PATCH", body, auth: true }),
  verifySesh: (id: string) =>
    request<Sesh>(`/seshes/${id}/verify`, { method: "POST", auth: true }),

  // Admin — Google Calendar connections
  listCalendarConnections: () =>
    request<CalendarConnection[]>("/calendar-connections", { auth: true }),
  getGoogleAuthUrl: (calendarId: string) =>
    request<{ url: string }>(
      `/calendar-connections/google/auth?calendarId=${calendarId}`,
      { auth: true },
    ),
  listExternalCalendars: (calendarId: string) =>
    request<{ calendars: ExternalCalendar[] }>(
      `/calendar-connections/google/calendars?calendarId=${calendarId}`,
      { auth: true },
    ),
  deleteCalendarConnection: (id: string) =>
    request<void>(`/calendar-connections/${id}`, {
      method: "DELETE",
      auth: true,
    }),
  toggleCalendarSync: (id: string, syncEnabled: boolean) =>
    request<CalendarConnection>(`/calendar-connections/${id}`, {
      method: "PATCH",
      body: { syncEnabled },
      auth: true,
    }),

  // Public (no auth) — by tenant slug
  publicCalendars: (slug: string) =>
    request<Calendar[]>(`/t/${slug}/calendars`),
  publicSeshTypes: (slug: string) =>
    request<SeshType[]>(`/t/${slug}/sesh-types`),
  availability: (slug: string, query: AvailabilityQuery) =>
    request<Slot[]>(`/t/${slug}/availability?${qs(query)}`),
  book: (slug: string, body: CreateBookingInput) =>
    request<Sesh>(`/t/${slug}/seshes`, { method: "POST", body }),
};
