import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { WorkingHours } from "../lib/api";
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
import { WEEKDAY_LABELS, minToTime, timeToMin } from "../lib/time";

interface DayState {
  enabled: boolean;
  start: string;
  end: string;
}

function emptyWeek(): DayState[] {
  return WEEKDAY_LABELS.map(() => ({
    enabled: false,
    start: "09:00",
    end: "17:00",
  }));
}

function weekFromEntries(entries: WorkingHours[]): DayState[] {
  const week = emptyWeek();
  for (const e of entries) {
    const day = week[e.weekday];
    if (day) {
      day.enabled = true;
      day.start = minToTime(e.startMin);
      day.end = minToTime(e.endMin);
    }
  }
  return week;
}

export function WorkingHoursPage() {
  const { id } = useParams();
  const calendarId = id!;
  const qc = useQueryClient();

  const calendars = useQuery({
    queryKey: ["calendars"],
    queryFn: api.listCalendars,
  });
  const calendar = calendars.data?.find((c) => c.id === calendarId);

  const hoursQuery = useQuery({
    queryKey: ["working-hours", calendarId],
    queryFn: () => api.getWorkingHours(calendarId),
  });

  const [week, setWeek] = useState<DayState[]>(emptyWeek);
  useEffect(() => {
    if (hoursQuery.data) setWeek(weekFromEntries(hoursQuery.data));
  }, [hoursQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      api.setWorkingHours(calendarId, {
        entries: week
          .map((d, weekday) => ({ d, weekday }))
          .filter(({ d }) => d.enabled)
          .map(({ d, weekday }) => ({
            weekday,
            startMin: timeToMin(d.start),
            endMin: timeToMin(d.end),
          })),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["working-hours", calendarId] }),
  });

  const updateDay = (i: number, patch: Partial<DayState>) =>
    setWeek((w) => w.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  return (
    <div>
      <PageHeader
        title={
          calendar ? `Working hours · ${calendar.name}` : "Working hours"
        }
        description={
          calendar
            ? `Times are in ${calendar.timezone}.`
            : "Set the recurring weekly schedule."
        }
        action={
          <Link to="/calendars">
            <Button variant="ghost">← Calendars</Button>
          </Link>
        }
      />

      {hoursQuery.isLoading ? (
        <Spinner />
      ) : (
        <Card className="p-5">
          <div className="space-y-2">
            {week.map((day, i) => (
              <div key={i} className="flex items-center gap-4">
                <label className="flex w-36 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={day.enabled}
                    onChange={(e) => updateDay(i, { enabled: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-slate-700">
                    {WEEKDAY_LABELS[i]}
                  </span>
                </label>
                {day.enabled ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={day.start}
                      onChange={(e) => updateDay(i, { start: e.target.value })}
                    />
                    <span className="text-slate-400">–</span>
                    <Input
                      type="time"
                      value={day.end}
                      onChange={(e) => updateDay(i, { end: e.target.value })}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">Closed</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save hours"}
            </Button>
            {save.isSuccess && (
              <span className="text-sm text-green-600">Saved ✓</span>
            )}
          </div>
          {save.error && (
            <div className="mt-3">
              <ErrorNote error={save.error} />
            </div>
          )}
        </Card>
      )}

      <ExceptionsSection calendarId={calendarId} />
    </div>
  );
}

function ExceptionsSection({ calendarId }: { calendarId: string }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["exceptions", calendarId],
    queryFn: () => api.listExceptions(calendarId),
  });

  const [date, setDate] = useState("");
  const [type, setType] = useState<"closed" | "custom">("closed");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("14:00");

  const add = useMutation({
    mutationFn: () =>
      api.addException(calendarId, {
        date,
        type,
        ...(type === "custom"
          ? { startMin: timeToMin(start), endMin: timeToMin(end) }
          : {}),
      }),
    onSuccess: () => {
      setDate("");
      qc.invalidateQueries({ queryKey: ["exceptions", calendarId] });
    },
  });

  const remove = useMutation({
    mutationFn: (exId: string) => api.deleteException(calendarId, exId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["exceptions", calendarId] }),
  });

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">
        Date exceptions
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Override the weekly schedule for specific dates — close for a holiday or
        set custom hours.
      </p>

      <Card className="mb-4 p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (date) add.mutate();
          }}
        >
          <div className="w-44">
            <Field label="Date">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="w-36">
            <Field label="Type">
              <Select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "closed" | "custom")
                }
              >
                <option value="closed">Closed</option>
                <option value="custom">Custom hours</option>
              </Select>
            </Field>
          </div>
          {type === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <span className="text-slate-400">–</span>
              <Input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          )}
          <Button type="submit" disabled={add.isPending}>
            Add exception
          </Button>
        </form>
        {add.error && (
          <div className="mt-3">
            <ErrorNote error={add.error} />
          </div>
        )}
      </Card>

      {list.isLoading ? (
        <Spinner />
      ) : list.data && list.data.length > 0 ? (
        <Card className="divide-y divide-slate-100">
          {list.data.map((ex) => (
            <div key={ex.id} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-800">
                  {ex.date.slice(0, 10)}
                </span>
                {ex.type === "closed" ? (
                  <Badge tone="red">Closed</Badge>
                ) : (
                  <Badge tone="amber">
                    {minToTime(ex.startMin ?? 0)}–{minToTime(ex.endMin ?? 0)}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" onClick={() => remove.mutate(ex.id)}>
                Remove
              </Button>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState>No exceptions. The weekly schedule applies.</EmptyState>
      )}
    </div>
  );
}
