import { useState } from "react";

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  min?: string; // YYYY-MM-DD
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseLocalDate(iso: string): Date {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function DatePicker({ value, onChange, min }: DatePickerProps) {
  const initial = value ? parseLocalDate(value) : todayLocal();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth()); // 0-indexed

  const minDate = min ? parseLocalDate(min) : null;
  const selectedISO = value ?? "";
  const todayISO = toISODate(todayLocal());

  // First day of the displayed month
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startDow = firstOfMonth.getDay(); // 0=Sun
  // Total days in month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Navigate months
  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // Build grid cells: leading blanks + day numbers
  const cells: (number | null)[] = [
    ...Array<null>(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
          aria-label="Previous month"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <span className="text-sm font-semibold text-slate-800">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>

        <button
          type="button"
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
          aria-label="Next month"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Day labels */}
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-xs font-medium text-slate-400"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`blank-${i}`} />;
          }

          const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = iso === selectedISO;
          const isToday = iso === todayISO;
          const isDisabled = minDate !== null && parseLocalDate(iso) < minDate;

          let cellClass =
            "relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition select-none";

          if (isDisabled) {
            cellClass += " text-slate-300 cursor-not-allowed";
          } else if (isSelected) {
            cellClass += " bg-indigo-600 text-white font-semibold cursor-pointer";
          } else if (isToday) {
            cellClass +=
              " text-indigo-600 font-semibold cursor-pointer hover:bg-indigo-50 ring-1 ring-indigo-400";
          } else {
            cellClass +=
              " text-slate-700 cursor-pointer hover:bg-slate-100 hover:text-slate-900";
          }

          return (
            <div key={iso} className="flex justify-center py-0.5">
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && onChange(iso)}
                className={cellClass}
                aria-label={iso}
                aria-pressed={isSelected}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
