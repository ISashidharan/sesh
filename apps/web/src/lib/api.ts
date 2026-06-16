import type {
  AvailabilityQuery,
  CreateBookingInput,
  CreateCalendarInput,
  CreateExceptionInput,
  CreateSeshTypeInput,
  SetWorkingHoursInput,
} from "@sesh/shared";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

// Dev auth: the API runs with DEV_AUTH=true and trusts this header. When Clerk
// is wired up, replace this with an Authorization: Bearer <token> header.
const DEV_CLERK_USER = "dev_owner";

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
  customer: { email: string; name: string | null; phone: string | null };
  seshType: { name: string; durationMin: number };
  calendar?: { id: string; name: string };
}

export interface Slot {
  startsAt: string;
  endsAt: string;
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
  if (opts.auth) headers["x-dev-clerk-user"] = DEV_CLERK_USER;

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
