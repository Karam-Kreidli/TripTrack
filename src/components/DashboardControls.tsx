"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_RANGE, RANGE_LABELS, type RangeKey } from "@/lib/periods";
import RangeCalendar from "./RangeCalendar";

// Top control row: preset rolling windows + a single "Custom" button that opens
// one calendar to pick both ends of a range. The Day/Week/Month bucket lives on
// the chart panel itself, so this stays one light row.
export default function DashboardControls({
  rangeKey,
  fromDay,
  toDay,
  basePath = "/",
}: {
  rangeKey: RangeKey;
  fromDay?: string;
  toDay?: string;
  // Which page the controls drive. The dashboard ("/") also carries its chart
  // bucket param across range changes; other pages have none to preserve.
  basePath?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  function push(mut: (q: URLSearchParams) => void) {
    // Preserve bucket (dashboard only); replace the range/custom part.
    const q = new URLSearchParams();
    const bucket = params.get("bucket");
    if (bucket) q.set("bucket", bucket);
    mut(q);
    const qs = q.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function goPreset(key: RangeKey) {
    push((q) => {
      if (key !== DEFAULT_RANGE) q.set("range", key);
    });
  }

  function goCustom(from: string, to: string) {
    push((q) => {
      q.set("from", from);
      q.set("to", to);
    });
    setOpen(false);
  }

  const isCustom = rangeKey === "custom";
  const customLabel =
    isCustom && fromDay && toDay ? `${fromDay} → ${toDay}` : "Custom";

  const pill = "rounded-md px-3 py-1.5 text-sm transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-[var(--tt-border)] bg-[var(--tt-surface)] p-0.5">
        {(Object.entries(RANGE_LABELS) as [RangeKey, string][]).map(
          ([key, label]) => (
            <button
              key={key}
              onClick={() => goPreset(key)}
              aria-current={rangeKey === key ? "page" : undefined}
              className={`${pill} ${
                rangeKey === key
                  ? "bg-[var(--tt-accent)] text-[var(--tt-accent-ink)] font-medium"
                  : "text-[var(--tt-muted)] hover:text-foreground"
              }`}
            >
              {label}
            </button>
          )
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-current={isCustom ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            isCustom
              ? "border-[var(--tt-accent)] bg-[var(--tt-accent)] font-medium text-[var(--tt-accent-ink)]"
              : "border-[var(--tt-border)] bg-[var(--tt-surface)] text-[var(--tt-muted)] hover:text-foreground"
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {customLabel}
        </button>

        {open && (
          <RangeCalendar
            fromDay={isCustom ? fromDay : undefined}
            toDay={isCustom ? toDay : undefined}
            onApply={goCustom}
            onClear={() => {
              goPreset(DEFAULT_RANGE);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
