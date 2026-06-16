import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
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

export function CalendarsPage() {
  const qc = useQueryClient();
  const calendars = useQuery({
    queryKey: ["calendars"],
    queryFn: api.listCalendars,
  });

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");

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
            <Card
              key={cal.id}
              className="flex items-center justify-between p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{cal.name}</span>
                  {cal.active ? (
                    <Badge tone="green">active</Badge>
                  ) : (
                    <Badge>inactive</Badge>
                  )}
                </div>
                <span className="text-sm text-slate-500">{cal.timezone}</span>
              </div>
              <div className="flex items-center gap-2">
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
