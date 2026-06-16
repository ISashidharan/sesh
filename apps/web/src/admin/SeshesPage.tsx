import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
} from "../components/ui";
import { fmtDateTime } from "../lib/time";

const STATUS_TONE = {
  booked: "green",
  cancelled: "red",
  completed: "slate",
} as const;

export function SeshesPage() {
  const qc = useQueryClient();
  const seshes = useQuery({
    queryKey: ["seshes"],
    queryFn: () => api.listSeshes(),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelSesh(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seshes"] }),
  });

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Every sesh across your calendars. Times shown in your local timezone."
      />

      {seshes.isLoading ? (
        <Spinner />
      ) : seshes.error ? (
        <ErrorNote error={seshes.error} />
      ) : seshes.data && seshes.data.length > 0 ? (
        <Card className="divide-y divide-slate-100">
          {seshes.data.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {fmtDateTime(s.startsAt)}
                  </span>
                  <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                </div>
                <span className="text-sm text-slate-500">
                  {s.seshType.name} · {s.customer.name ?? s.customer.email}
                  {s.calendar && ` · ${s.calendar.name}`}
                </span>
              </div>
              {s.status === "booked" && (
                <Button
                  variant="danger"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (confirm("Cancel this booking?")) cancel.mutate(s.id);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          ))}
        </Card>
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
      )}
      {cancel.error && (
        <div className="mt-3">
          <ErrorNote error={cancel.error} />
        </div>
      )}
    </div>
  );
}
