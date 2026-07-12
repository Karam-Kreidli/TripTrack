"use client";

import { useEffect, useRef, useState } from "react";

// A single month grid where you click a start day then an end day to pick a
// range. No dependency — plain date math on YYYY-MM-DD strings (Dubai-local
// calendar; the caller converts these to instants). Returns the two days via
// onApply once both ends are chosen.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function toKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Days in a month, and the weekday (Mon=0) the 1st falls on.
function monthGrid(y: number, m: number): (number | null)[] {
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Mon-first
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function RangeCalendar({
  fromDay,
  toDay,
  onApply,
  onClear,
  onClose,
}: {
  fromDay?: string;
  toDay?: string;
  onApply: (from: string, to: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  // View month: start from the current selection, else today.
  const seed = fromDay ?? new Date().toISOString().slice(0, 10);
  const [sy, sm] = seed.split("-").map(Number);
  const [view, setView] = useState({ y: sy, m: sm - 1 });

  // Pending selection. When one end is chosen we wait for the second click.
  const [start, setStart] = useState<string | undefined>(fromDay);
  const [end, setEnd] = useState<string | undefined>(toDay);
  const [hover, setHover] = useState<string | undefined>();

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  function pick(day: string) {
    // First click, or restarting after a full range was set: set start only.
    if (!start || (start && end)) {
      setStart(day);
      setEnd(undefined);
      return;
    }
    // Second click: order the two ends and finish.
    const [a, b] = day < start ? [day, start] : [start, day];
    setStart(a);
    setEnd(b);
  }

  const cells = monthGrid(view.y, view.m);
  // The end to shade against while hovering the second click.
  const previewEnd = end ?? hover;
  const lo = start && previewEnd ? (start < previewEnd ? start : previewEnd) : start;
  const hi = start && previewEnd ? (start < previewEnd ? previewEnd : start) : start;

  function step(delta: number) {
    const d = new Date(Date.UTC(view.y, view.m + delta, 1));
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }

  const navBtn =
    "grid h-7 w-7 place-items-center rounded-md text-[var(--tt-muted)] hover:bg-[var(--tt-border)] hover:text-foreground";

  return (
    <div
      ref={ref}
      // Anchor to the left edge of the trigger (the Custom button sits on the
      // left of the toolbar) and cap width to the viewport so the popover never
      // spills off-screen on a phone. On >=sm the fixed 17rem width applies.
      className="absolute left-0 top-full z-20 mt-2 w-[min(17rem,calc(100vw-2rem))] rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} className={navBtn} aria-label="Previous month">
          ‹
        </button>
        <div className="text-sm font-medium">
          {MONTHS[view.m]} {view.y}
        </div>
        <button type="button" onClick={() => step(1)} className={navBtn} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-[var(--tt-muted)]">
        {DOW.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const key = toKey(view.y, view.m, d);
          const isStart = key === start;
          const isEnd = key === end;
          const inRange = lo && hi && key >= lo && key <= hi;
          const isEdge = isStart || isEnd || (start && !end && key === start);
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(key)}
              onMouseEnter={() => setHover(key)}
              className={`mx-auto grid h-8 w-8 place-items-center rounded-md transition-colors ${
                isEdge
                  ? "bg-[var(--tt-accent)] font-medium text-[var(--tt-accent-ink)]"
                  : inRange
                  ? "bg-[var(--tt-accent)]/20 text-foreground"
                  : "text-foreground hover:bg-[var(--tt-border)]"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--tt-border)] pt-3 text-sm">
        <button
          type="button"
          onClick={onClear}
          className="text-[var(--tt-muted)] hover:text-foreground"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!start || !end}
          onClick={() => start && end && onApply(start, end)}
          className="rounded-md bg-[var(--tt-accent)] px-3 py-1.5 font-medium text-[var(--tt-accent-ink)] transition-opacity disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
