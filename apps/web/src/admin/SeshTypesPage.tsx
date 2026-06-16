import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { fmtPrice } from "../lib/time";

export function SeshTypesPage() {
  const qc = useQueryClient();
  const seshTypes = useQuery({
    queryKey: ["sesh-types"],
    queryFn: api.listSeshTypes,
  });

  const [name, setName] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [bufferAfterMin, setBufferAfterMin] = useState(0);
  const [price, setPrice] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createSeshType({
        name,
        durationMin,
        bufferBeforeMin: 0,
        bufferAfterMin,
        ...(price ? { priceCents: Math.round(Number(price) * 100) } : {}),
      }),
    onSuccess: () => {
      setName("");
      setPrice("");
      qc.invalidateQueries({ queryKey: ["sesh-types"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSeshType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sesh-types"] }),
  });

  return (
    <div>
      <PageHeader
        title="Sesh Types"
        description="The appointment types customers can book — duration, buffer, and price."
      />

      <Card className="mb-6 p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="min-w-44 flex-1">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Consultation"
                required
              />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Duration">
              <Select
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
              >
                {[30, 45, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-32">
            <Field label="Buffer after">
              <Select
                value={bufferAfterMin}
                onChange={(e) => setBufferAfterMin(Number(e.target.value))}
              >
                {[0, 5, 10, 15, 30].map((b) => (
                  <option key={b} value={b}>
                    {b} min
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-28">
            <Field label="Price ($)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="—"
              />
            </Field>
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add type"}
          </Button>
        </form>
        {create.error && (
          <div className="mt-3">
            <ErrorNote error={create.error} />
          </div>
        )}
      </Card>

      {seshTypes.isLoading ? (
        <Spinner />
      ) : seshTypes.error ? (
        <ErrorNote error={seshTypes.error} />
      ) : seshTypes.data && seshTypes.data.length > 0 ? (
        <div className="space-y-3">
          {seshTypes.data.map((t) => (
            <Card key={t.id} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{t.name}</span>
                  {!t.active && <Badge>inactive</Badge>}
                </div>
                <span className="text-sm text-slate-500">
                  {t.durationMin} min
                  {t.bufferAfterMin > 0 && ` · ${t.bufferAfterMin} min buffer`}
                  {" · "}
                  {fmtPrice(t.priceCents)}
                </span>
              </div>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm(`Delete "${t.name}"?`)) remove.mutate(t.id);
                }}
              >
                Delete
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>No sesh types yet. Add one above.</EmptyState>
      )}
    </div>
  );
}
