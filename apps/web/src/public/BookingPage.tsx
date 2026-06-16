import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Slot } from "../lib/api";
import { api } from "../lib/api";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Select,
  Spinner,
} from "../components/ui";
import { DatePicker } from "../components/DatePicker";
import { fmtDateTime, fmtPrice, fmtTime, todayISODate } from "../lib/time";

// When mounted inside the embeddable widget's iframe (/book/:slug?embed=1),
// report content height to the parent so the widget can auto-resize.
const EMBEDDED =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("embed") === "1";

function useEmbedAutoResize() {
  useEffect(() => {
    if (!EMBEDDED || window.parent === window) return;
    // Measure the body, not documentElement: the latter is floored to the
    // iframe viewport height, so it never reports a shrink.
    const post = () =>
      window.parent.postMessage(
        { type: "sesh:resize", height: document.body.scrollHeight },
        "*",
      );
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);
}

export function BookingPage() {
  const { slug } = useParams();
  const tenantSlug = slug!;
  useEmbedAutoResize();

  const calendars = useQuery({
    queryKey: ["pub-calendars", tenantSlug],
    queryFn: () => api.publicCalendars(tenantSlug),
  });
  const seshTypes = useQuery({
    queryKey: ["pub-sesh-types", tenantSlug],
    queryFn: () => api.publicSeshTypes(tenantSlug),
  });

  const [calendarId, setCalendarId] = useState("");
  const [seshTypeId, setSeshTypeId] = useState("");
  const [date, setDate] = useState(todayISODate());
  const [slot, setSlot] = useState<Slot | null>(null);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });

  // Default the selectors once data arrives.
  const calendar = calendars.data?.find((c) => c.id === calendarId);
  const effectiveCalendarId = calendarId || calendars.data?.[0]?.id || "";
  const effectiveSeshTypeId = seshTypeId || seshTypes.data?.[0]?.id || "";
  const tz =
    calendar?.timezone ??
    calendars.data?.find((c) => c.id === effectiveCalendarId)?.timezone;

  const availability = useQuery({
    queryKey: ["availability", tenantSlug, effectiveCalendarId, effectiveSeshTypeId, date],
    queryFn: () =>
      api.availability(tenantSlug, {
        calendarId: effectiveCalendarId,
        seshTypeId: effectiveSeshTypeId,
        from: date,
        to: date,
      }),
    enabled: Boolean(effectiveCalendarId && effectiveSeshTypeId && date),
  });

  const book = useMutation({
    mutationFn: () =>
      api.book(tenantSlug, {
        calendarId: effectiveCalendarId,
        seshTypeId: effectiveSeshTypeId,
        startsAt: slot!.startsAt,
        customer: {
          email: customer.email,
          ...(customer.name ? { name: customer.name } : {}),
          ...(customer.phone ? { phone: customer.phone } : {}),
        },
      }),
  });

  const selectedType = seshTypes.data?.find(
    (t) => t.id === effectiveSeshTypeId,
  );

  if (calendars.isLoading || seshTypes.isLoading) {
    return (
      <CenteredShell>
        <Spinner />
      </CenteredShell>
    );
  }

  if (calendars.error || seshTypes.error) {
    return (
      <CenteredShell>
        <ErrorNote error={calendars.error ?? seshTypes.error} />
      </CenteredShell>
    );
  }

  // Success confirmation.
  if (book.isSuccess) {
    return (
      <CenteredShell>
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-600">
            ✓
          </div>
          <h2 className="text-lg font-semibold text-slate-900">You're booked!</h2>
          <p className="mt-2 text-sm text-slate-600">
            {selectedType?.name} on {fmtDateTime(book.data.startsAt, tz)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            A confirmation will be sent to {customer.email}.
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => {
              book.reset();
              setSlot(null);
            }}
          >
            Book another
          </Button>
        </Card>
      </CenteredShell>
    );
  }

  return (
    <CenteredShell>
      <div className="mb-6">
        <span className="text-lg font-bold tracking-tight text-indigo-600">
          sesh
        </span>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Book a sesh
        </h1>
      </div>

      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service">
            <Select
              value={effectiveSeshTypeId}
              onChange={(e) => {
                setSeshTypeId(e.target.value);
                setSlot(null);
              }}
            >
              {seshTypes.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.durationMin} min · {fmtPrice(t.priceCents)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="With">
            <Select
              value={effectiveCalendarId}
              onChange={(e) => {
                setCalendarId(e.target.value);
                setSlot(null);
              }}
            >
              {calendars.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Date">
            <DatePicker
              value={date}
              onChange={(d) => {
                setDate(d);
                setSlot(null);
              }}
              min={todayISODate()}
            />
          </Field>
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-slate-700">
            Available times{tz && <span className="text-slate-400"> · {tz}</span>}
          </h3>
          {availability.isLoading ? (
            <Spinner label="Finding open slots…" />
          ) : availability.error ? (
            <ErrorNote error={availability.error} />
          ) : availability.data && availability.data.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {availability.data.map((s) => {
                const active = slot?.startsAt === s.startsAt;
                return (
                  <button
                    key={s.startsAt}
                    onClick={() => setSlot(s)}
                    className={`rounded-full border px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                      active
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                    }`}
                  >
                    {fmtTime(s.startsAt, tz)}
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState>No open times on this date. Try another day.</EmptyState>
          )}
        </div>

        {slot && (
          <form
            className="mt-6 border-t border-slate-100 pt-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (customer.email) book.mutate();
            }}
          >
            <p className="mb-4 text-sm text-slate-600">
              Booking <strong>{selectedType?.name}</strong> at{" "}
              <strong>{fmtTime(slot.startsAt, tz)}</strong> on{" "}
              {fmtDateTime(slot.startsAt, tz)}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={customer.name}
                  onChange={(e) =>
                    setCustomer({ ...customer, name: e.target.value })
                  }
                  placeholder="Your name"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  required
                  value={customer.email}
                  onChange={(e) =>
                    setCustomer({ ...customer, email: e.target.value })
                  }
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Phone (optional)">
                <Input
                  type="tel"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({ ...customer, phone: e.target.value })
                  }
                  placeholder="+1 (555) 000-0000"
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button type="submit" disabled={book.isPending}>
                {book.isPending ? "Booking…" : "Confirm booking"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSlot(null)}
              >
                Cancel
              </Button>
            </div>
            {book.error && (
              <div className="mt-3">
                <ErrorNote error={book.error} />
              </div>
            )}
          </form>
        )}
      </Card>
    </CenteredShell>
  );
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  // In embed mode, don't force 100vh — the iframe sizes to content instead.
  return (
    <div className={`bg-slate-50 px-4 py-12 ${EMBEDDED ? "" : "min-h-screen"}`}>
      <div className="mx-auto max-w-xl">{children}</div>
    </div>
  );
}
