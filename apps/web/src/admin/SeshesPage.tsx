import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Sesh } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  useToast,
} from "../components/ui";
import { fmtDateTime, fmtTime, todayISODate } from "../lib/time";

// ---- Status helpers ---------------------------------------------------------

type DisplayStatus = "pending" | "confirmed" | "cancelled" | "completed";

function getDisplayStatus(s: Sesh): DisplayStatus {
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "completed") return "completed";
  if (s.status === "booked" && !s.emailVerified) return "pending";
  return "confirmed";
}

const STATUS_TONE: Record<DisplayStatus, "amber" | "green" | "red" | "slate"> =
  {
    pending: "amber",
    confirmed: "green",
    cancelled: "red",
    completed: "slate",
  };

const STATUS_PILL_BG: Record<DisplayStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-slate-100 text-slate-700",
};

// ---- View types ------------------------------------------------------------

type ViewMode = "list" | "calendar" | "week";

type FilterStatus = "all" | DisplayStatus;

// ---- Reschedule modal -------------------------------------------------------

function RescheduleModal({
  sesh,
  onClose,
}: {
  sesh: Sesh;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [datetimeLocal, setDatetimeLocal] = useState("");

  const reschedule = useMutation({
    mutationFn: (startsAt: string) => api.rescheduleSesh(sesh.id, { startsAt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seshes"] });
      addToast("Booking rescheduled successfully", "success");
      onClose();
    },
    onError: (err: unknown) => {
      addToast(err instanceof Error ? err.message : "Reschedule failed", "error");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!datetimeLocal) return;
    const isoUtc = new Date(datetimeLocal).toISOString();
    reschedule.mutate(isoUtc);
  }

  // Convert datetime-local minimum to today
  const minDatetime = `${todayISODate()}T00:00`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
      <Card className="max-w-md w-full p-6 mx-4">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          Reschedule Booking
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Current:{" "}
          <span className="font-medium text-slate-700">
            {fmtDateTime(sesh.startsAt)}
          </span>
          {" · "}
          {sesh.customer.name ?? sesh.customer.email}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              New date &amp; time
            </label>
            <input
              type="datetime-local"
              min={minDatetime}
              value={datetimeLocal}
              onChange={(e) => setDatetimeLocal(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {reschedule.error != null && (
            <ErrorNote error={reschedule.error} />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!datetimeLocal || reschedule.isPending}
            >
              {reschedule.isPending ? "Saving…" : "Confirm reschedule"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ---- List view ---------------------------------------------------------------

function ListView({
  seshes,
  filter,
  onReschedule,
}: {
  seshes: Sesh[];
  filter: FilterStatus;
  onReschedule: (s: Sesh) => void;
}) {
  const qc = useQueryClient();
  const { addToast } = useToast();

  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelSesh(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seshes"] });
      addToast("Booking cancelled", "success");
    },
    onError: (err: unknown) => {
      addToast(err instanceof Error ? err.message : "Cancel failed", "error");
    },
  });

  const verify = useMutation({
    mutationFn: (id: string) => api.verifySesh(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seshes"] });
      addToast("Email verified", "success");
    },
    onError: (err: unknown) => {
      addToast(err instanceof Error ? err.message : "Verify failed", "error");
    },
  });

  const filtered =
    filter === "all"
      ? seshes
      : seshes.filter((s) => getDisplayStatus(s) === filter);

  if (filtered.length === 0) {
    return (
      <EmptyState>
        No bookings match the selected filter.
      </EmptyState>
    );
  }

  return (
    <Card className="divide-y divide-slate-100">
      {filtered.map((s) => {
        const ds = getDisplayStatus(s);
        return (
          <div key={s.id} className="flex items-center justify-between p-4 gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900">
                  {fmtDateTime(s.startsAt)}
                </span>
                <Badge tone={STATUS_TONE[ds]}>{ds}</Badge>
              </div>
              <span className="text-sm text-slate-500">
                {s.seshType.name} · {s.customer.name ?? s.customer.email}
                {s.calendar && ` · ${s.calendar.name}`}
              </span>
            </div>
            {s.status === "booked" && (
              <div className="flex items-center gap-2 shrink-0">
                {!s.emailVerified && (
                  <Button
                    variant="secondary"
                    disabled={verify.isPending}
                    onClick={() => verify.mutate(s.id)}
                  >
                    Verify
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => onReschedule(s)}
                >
                  Reschedule
                </Button>
                <Button
                  variant="danger"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (confirm("Cancel this booking?")) cancel.mutate(s.id);
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// ---- Calendar helpers -------------------------------------------------------

function localDateKey(iso: string): string {
  // Returns "YYYY-MM-DD" in local timezone
  const d = new Date(iso);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function groupByDate(seshes: Sesh[]): Map<string, Sesh[]> {
  const map = new Map<string, Sesh[]>();
  for (const s of seshes) {
    const key = localDateKey(s.startsAt);
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  return map;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CalendarViewProps {
  seshes: Sesh[];
  onReschedule: (s: Sesh) => void;
  viewMode: "calendar" | "week";
}

function SeshPill({ sesh, onClick }: { sesh: Sesh; onClick: () => void }) {
  const ds = getDisplayStatus(sesh);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-xs rounded px-1 py-0.5 truncate ${STATUS_PILL_BG[ds]} hover:opacity-80 transition`}
      title={`${sesh.customer.name ?? sesh.customer.email} — ${fmtDateTime(sesh.startsAt)}`}
    >
      {fmtTime(sesh.startsAt)} {sesh.customer.name ?? sesh.customer.email}
    </button>
  );
}

function CalendarView({ seshes, onReschedule, viewMode }: CalendarViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedSesh, setSelectedSesh] = useState<Sesh | null>(null);

  const todayKey = localDateKey(today.toISOString());
  const grouped = groupByDate(seshes);

  // ---- Month calendar ----
  if (viewMode === "calendar") {
    // First day of month
    const firstDay = new Date(year, month, 1);
    // Last day of month
    const lastDay = new Date(year, month + 1, 0);
    // Start grid on Sunday
    const startOffset = firstDay.getDay();
    // Total cells: startOffset + daysInMonth, rounded up to 7 multiple
    const daysInMonth = lastDay.getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const monthLabel = firstDay.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    function prevMonth() {
      if (month === 0) { setMonth(11); setYear((y) => y - 1); }
      else setMonth((m) => m - 1);
    }
    function nextMonth() {
      if (month === 11) { setMonth(0); setYear((y) => y + 1); }
      else setMonth((m) => m + 1);
    }

    return (
      <div>
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="font-semibold text-slate-800">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-slate-500 py-1"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 border-l border-t border-slate-200">
          {Array.from({ length: totalCells }, (_, i) => {
            const dayOffset = i - startOffset + 1;
            const inMonth = dayOffset >= 1 && dayOffset <= daysInMonth;
            const cellDate = new Date(year, month, dayOffset);
            const dateKey =
              cellDate.getFullYear() +
              "-" +
              String(cellDate.getMonth() + 1).padStart(2, "0") +
              "-" +
              String(cellDate.getDate()).padStart(2, "0");
            const cellSeshes = grouped.get(dateKey) ?? [];
            const isToday = dateKey === todayKey;

            return (
              <div
                key={i}
                className={`border-r border-b border-slate-200 min-h-[80px] p-1 ${
                  inMonth ? "bg-white" : "bg-slate-50"
                }`}
              >
                <div
                  className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday
                      ? "bg-indigo-600 text-white font-semibold"
                      : inMonth
                      ? "text-slate-700"
                      : "text-slate-300"
                  }`}
                >
                  {inMonth ? dayOffset : ""}
                </div>
                <div className="flex flex-col gap-0.5">
                  {cellSeshes.slice(0, 3).map((s) => (
                    <SeshPill
                      key={s.id}
                      sesh={s}
                      onClick={() => setSelectedSesh(selectedSesh?.id === s.id ? null : s)}
                    />
                  ))}
                  {cellSeshes.length > 3 && (
                    <span className="text-xs text-slate-400 px-1">
                      +{cellSeshes.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected sesh detail */}
        {selectedSesh && (
          <SeshDetailCard
            sesh={selectedSesh}
            onClose={() => setSelectedSesh(null)}
            onReschedule={() => { setSelectedSesh(null); onReschedule(selectedSesh); }}
          />
        )}
      </div>
    );
  }

  // ---- Week view ----
  // Get current week's Sunday
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + weekOffset * 7);
  weekStart.setHours(0, 0, 0, 0);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const weekLabel =
    (weekDays[0] ?? new Date()).toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " – " +
    (weekDays[6] ?? new Date()).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      {/* Week nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          aria-label="Previous week"
        >
          ‹
        </button>
        <span className="font-semibold text-slate-800">{weekLabel}</span>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          aria-label="Next week"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 border-l border-t border-slate-200">
        {weekDays.map((day, i) => {
          const dateKey =
            day.getFullYear() +
            "-" +
            String(day.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(day.getDate()).padStart(2, "0");
          const daySeshes = grouped.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;

          return (
            <div
              key={i}
              className="border-r border-b border-slate-200 min-h-[120px] bg-white"
            >
              {/* Day header */}
              <div
                className={`text-center py-2 border-b border-slate-100 text-xs ${
                  isToday ? "bg-indigo-50" : ""
                }`}
              >
                <div className="text-slate-500">{DAY_LABELS[i]}</div>
                <div
                  className={`mx-auto mt-0.5 w-6 h-6 flex items-center justify-center rounded-full text-sm font-medium ${
                    isToday
                      ? "bg-indigo-600 text-white"
                      : "text-slate-800"
                  }`}
                >
                  {day.getDate()}
                </div>
              </div>
              {/* Seshes */}
              <div className="p-1 flex flex-col gap-0.5">
                {daySeshes.map((s) => (
                  <SeshPill
                    key={s.id}
                    sesh={s}
                    onClick={() => setSelectedSesh(selectedSesh?.id === s.id ? null : s)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected sesh detail */}
      {selectedSesh && (
        <SeshDetailCard
          sesh={selectedSesh}
          onClose={() => setSelectedSesh(null)}
          onReschedule={() => { setSelectedSesh(null); onReschedule(selectedSesh); }}
        />
      )}
    </div>
  );
}

// ---- Sesh detail card (calendar pop-up) -------------------------------------

function SeshDetailCard({
  sesh,
  onClose,
  onReschedule,
}: {
  sesh: Sesh;
  onClose: () => void;
  onReschedule: () => void;
}) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const ds = getDisplayStatus(sesh);

  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelSesh(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seshes"] });
      addToast("Booking cancelled", "success");
      onClose();
    },
  });

  const verify = useMutation({
    mutationFn: (id: string) => api.verifySesh(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seshes"] });
      addToast("Email verified", "success");
      onClose();
    },
  });

  return (
    <Card className="mt-4 p-4 max-w-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-slate-900 text-sm">
              {sesh.customer.name ?? sesh.customer.email}
            </span>
            <Badge tone={STATUS_TONE[ds]}>{ds}</Badge>
          </div>
          <div className="text-xs text-slate-500">
            {fmtDateTime(sesh.startsAt)} · {sesh.seshType.name}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none ml-2"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      {sesh.status === "booked" && (
        <div className="flex gap-2 mt-3">
          {!sesh.emailVerified && (
            <Button
              variant="secondary"
              className="text-xs py-1"
              disabled={verify.isPending}
              onClick={() => verify.mutate(sesh.id)}
            >
              Verify
            </Button>
          )}
          <Button
            variant="secondary"
            className="text-xs py-1"
            onClick={onReschedule}
          >
            Reschedule
          </Button>
          <Button
            variant="danger"
            className="text-xs py-1"
            disabled={cancel.isPending}
            onClick={() => {
              if (confirm("Cancel this booking?")) cancel.mutate(sesh.id);
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---- Main page --------------------------------------------------------------

const FILTER_OPTIONS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Completed", value: "completed" },
];

export function SeshesPage() {
  const [view, setView] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [rescheduleTarget, setRescheduleTarget] = useState<Sesh | null>(null);

  // For calendar view we fetch the visible month; for list/week we fetch all
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const listParams: Record<string, string> = {};
  if (view === "calendar") {
    const from = new Date(calYear, calMonth, 1).toISOString();
    const to = new Date(calYear, calMonth + 1, 0, 23, 59, 59).toISOString();
    listParams["from"] = from;
    listParams["to"] = to;
  }

  const seshes = useQuery({
    queryKey: ["seshes", view === "calendar" ? `${calYear}-${calMonth}` : "all"],
    queryFn: () => api.listSeshes(view === "calendar" ? listParams : {}),
  });

  const viewButtons: { label: string; value: ViewMode }[] = [
    { label: "List", value: "list" },
    { label: "Calendar", value: "calendar" },
    { label: "Week", value: "week" },
  ];

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Every sesh across your calendars. Times shown in your local timezone."
        action={
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
            {viewButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setView(btn.value)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  view === btn.value
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Filter bar — only for list view */}
      {view === "list" && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition border ${
                filter === opt.value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {seshes.isLoading ? (
        <Spinner />
      ) : seshes.error ? (
        <ErrorNote error={seshes.error} />
      ) : (view === "list") ? (
        seshes.data && seshes.data.length > 0 ? (
          <ListView
            seshes={seshes.data}
            filter={filter}
            onReschedule={setRescheduleTarget}
          />
        ) : (
          <EmptyState>
            No bookings yet. Share your{" "}
            <a
              href="/book/acme"
              className="font-medium text-indigo-600 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              booking page
            </a>{" "}
            to get started.
          </EmptyState>
        )
      ) : (
        <CalendarView
          seshes={seshes.data ?? []}
          onReschedule={setRescheduleTarget}
          viewMode={view as "calendar" | "week"}
        />
      )}

      {rescheduleTarget && (
        <RescheduleModal
          sesh={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
        />
      )}
    </div>
  );
}
