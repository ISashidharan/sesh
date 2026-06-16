import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type CalendarConnection } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from "../components/ui";

const COMMON_TZ = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
];

function GoogleCalendarButton({ calendarId }: { calendarId: string }) {
  const qc = useQueryClient();

  const connections = useQuery({
    queryKey: ["calendarConnections"],
    queryFn: api.listCalendarConnections,
  });

  const existing = connections.data?.find((c) => c.calendarId === calendarId);

  const connect = useMutation({
    mutationFn: async () => {
      const { url } = await api.getGoogleAuthUrl(calendarId);
      window.location.href = url;
    },
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.deleteCalendarConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendarConnections"] }),
  });

  const toggleSync = useMutation({
    mutationFn: (conn: CalendarConnection) =>
      api.toggleCalendarSync(conn.id, !conn.syncEnabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendarConnections"] }),
  });

  if (connections.isLoading) return null;

  if (existing) {
    return (
      <div className="flex items-center gap-2">
        <Badge tone={existing.syncEnabled ? "green" : "slate"}>
          {existing.syncEnabled ? "Google synced" : "sync paused"}
        </Badge>
        <Button
          variant="ghost"
          className="text-xs"
          onClick={() => toggleSync.mutate(existing)}
          disabled={toggleSync.isPending}
        >
          {existing.syncEnabled ? "Pause" : "Resume"}
        </Button>
        <Button
          variant="danger"
          className="text-xs"
          onClick={() => {
            if (confirm("Disconnect Google Calendar?"))
              disconnect.mutate(existing.id);
          }}
          disabled={disconnect.isPending}
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      className="text-xs"
      onClick={() => connect.mutate()}
      disabled={connect.isPending}
    >
      {connect.isPending ? "Redirecting…" : "Connect Google Calendar"}
    </Button>
  );
}

export function CalendarsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  // Handle Google OAuth redirect back to this page.
  useEffect(() => {
    const connected = searchParams.get("gcal_connected");
    const error = searchParams.get("gcal_error");
    if (connected) {
      setToast({ kind: "success", text: "Google Calendar connected." });
      void qc.invalidateQueries({ queryKey: ["calendarConnections"] });
      setSearchParams({}, { replace: true });
    } else if (error) {
      setToast({ kind: "error", text: `Google connect failed: ${error}` });
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const calendars = useQuery({
    queryKey: ["calendars"],
    queryFn: api.listCalendars,
  });

  const create = useMutation({
    mutationFn: () => api.createCalendar({ name, timezone }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["calendars"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendars"] }),
  });

  return (
    <div>
      <PageHeader
        title="Calendars"
        description="Bookable resources — a person or a room. Each has its own working hours."
      />

      {toast && (
        <div
          className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${
            toast.kind === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {toast.text}
        </div>
      )}

      <Card className="mb-6 p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="min-w-48 flex-1">
            <Field label="Calendar name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Treatment Room 1"
                required
              />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Timezone">
              <Select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {COMMON_TZ.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add calendar"}
          </Button>
        </form>
        {create.error && (
          <div className="mt-3">
            <ErrorNote error={create.error} />
          </div>
        )}
      </Card>

      {calendars.isLoading ? (
        <Spinner />
      ) : calendars.error ? (
        <ErrorNote error={calendars.error} />
      ) : calendars.data && calendars.data.length > 0 ? (
        <div className="space-y-3">
          {calendars.data.map((cal) => (
            <Card key={cal.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">
                      {cal.name}
                    </span>
                    {cal.active ? (
                      <Badge tone="green">active</Badge>
                    ) : (
                      <Badge>inactive</Badge>
                    )}
                  </div>
                  <span className="text-sm text-slate-500">{cal.timezone}</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <GoogleCalendarButton calendarId={cal.id} />
                  <Link to={`/calendars/${cal.id}/hours`}>
                    <Button variant="secondary">Working hours</Button>
                  </Link>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (confirm(`Delete "${cal.name}"?`)) remove.mutate(cal.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>No calendars yet. Add one above to get started.</EmptyState>
      )}

      <p className="mt-8 text-sm text-slate-500">
        Public booking page:{" "}
        <a
          href="/book/acme"
          className="font-medium text-indigo-600 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          /book/acme ↗
        </a>
      </p>
    </div>
  );
}
