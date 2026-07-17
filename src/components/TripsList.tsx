"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Trip } from "@/types/db";
import { DEFAULT_RANGE, RANGE_LABELS, type RangeKey } from "@/lib/periods";
import {
  dubaiDateKey,
  fmtDate,
  fmtDuration,
  fmtNum,
  fmtTime,
} from "@/lib/format";
import RangeCalendar from "./RangeCalendar";

type SortKey = "day" | "cost_aed" | "distance_km" | "l_per_100km";

const DEFAULT_SORT: SortKey = "day";

function resolveSort(value: string | null): SortKey {
  return value === "cost_aed" || value === "distance_km" || value === "l_per_100km"
    ? value
    : DEFAULT_SORT;
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: "day", label: "By day" },
  { key: "cost_aed", label: "Most expensive" },
  { key: "distance_km", label: "Longest" },
  { key: "l_per_100km", label: "Least efficient" },
];

interface DayGroup {
  key: string; // YYYY-MM-DD (Dubai)
  label: string;
  trips: Trip[];
  distance: number;
  cost: number;
}

function LegBadge({ legs }: { legs: number }) {
  if (legs <= 1) return null;
  return (
    <span className="rounded-full bg-[var(--tt-accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--tt-accent)]">
      {legs} legs
    </span>
  );
}

function TripRow({ t, href, legs }: { t: Trip; href: string; legs: number }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] px-4 py-3 transition-colors hover:border-white/20 hover:bg-white/[.04]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium tabular-nums">
          {fmtTime(t.started_at)}
          <LegBadge legs={legs} />
        </div>
        <div className="mt-0.5 text-xs text-[var(--tt-muted)] tabular-nums">
          {fmtDuration(t.duration_seconds)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-5 text-right tabular-nums">
        <div className="hidden sm:block">
          <div className="text-sm">{fmtNum(t.distance_km, 1)} km</div>
          <div className="text-xs text-[var(--tt-muted)]">distance</div>
        </div>
        <div className="hidden sm:block">
          <div className="text-sm">{fmtNum(t.l_per_100km, 1)}</div>
          <div className="text-xs text-[var(--tt-muted)]">L/100km</div>
        </div>
        <div className="min-w-[72px]">
          <div className="font-semibold text-[var(--tt-accent)]">
            {fmtNum(t.cost_aed, 2)}
          </div>
          <div className="text-xs text-[var(--tt-muted)]">AED</div>
        </div>
      </div>
    </Link>
  );
}

// Flat row that also shows its date (used by the ranked, non-grouped sorts).
function FlatTripRow({ t, href, legs }: { t: Trip; href: string; legs: number }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] px-4 py-3 transition-colors hover:border-white/20 hover:bg-white/[.04]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium">
          {fmtDate(t.started_at)}
          <LegBadge legs={legs} />
        </div>
        <div className="mt-0.5 text-xs text-[var(--tt-muted)] tabular-nums">
          {fmtTime(t.started_at)} · {fmtDuration(t.duration_seconds)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-5 text-right tabular-nums">
        <div className="hidden sm:block">
          <div className="text-sm">{fmtNum(t.distance_km, 1)} km</div>
          <div className="text-xs text-[var(--tt-muted)]">distance</div>
        </div>
        <div className="hidden sm:block">
          <div className="text-sm">{fmtNum(t.l_per_100km, 1)}</div>
          <div className="text-xs text-[var(--tt-muted)]">L/100km</div>
        </div>
        <div className="min-w-[72px]">
          <div className="font-semibold text-[var(--tt-accent)]">
            {fmtNum(t.cost_aed, 2)}
          </div>
          <div className="text-xs text-[var(--tt-muted)]">AED</div>
        </div>
      </div>
    </Link>
  );
}

export default function TripsList({
  trips,
  legCounts,
  rangeKey,
  fromDay,
  toDay,
}: {
  trips: Trip[];
  legCounts: Record<string, number>;
  rangeKey: RangeKey;
  fromDay?: string;
  toDay?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  // Sort lives in the URL so it survives navigating into a trip and back.
  const sortKey = resolveSort(params.get("sort"));
  // Collapsed day keys (default: all expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Build a /trips URL, carrying the current sort forward unless overridden.
  function tripsUrl(next: {
    range?: RangeKey;
    from?: string;
    to?: string;
    sort?: SortKey;
  }) {
    const q = new URLSearchParams();
    if (next.range && next.range !== DEFAULT_RANGE) q.set("range", next.range);
    if (next.from) q.set("from", next.from);
    if (next.to) q.set("to", next.to);
    const sort = next.sort ?? sortKey;
    if (sort !== DEFAULT_SORT) q.set("sort", sort);
    const qs = q.toString();
    return qs ? `/trips?${qs}` : "/trips";
  }

  function setSortKey(key: SortKey) {
    // Preserve the active range/custom window; only change the sort.
    const range = isCustom ? undefined : rangeKey;
    router.push(
      tripsUrl({
        range,
        from: isCustom ? fromDay : undefined,
        to: isCustom ? toDay : undefined,
        sort: key,
      })
    );
  }
  function goPreset(key: RangeKey) {
    router.push(tripsUrl({ range: key }));
  }
  function goCustom(f: string, t: string) {
    router.push(tripsUrl({ from: f, to: t }));
    setCalendarOpen(false);
  }

  const isCustom = rangeKey === "custom";
  const customLabel =
    isCustom && fromDay && toDay ? `${fromDay} → ${toDay}` : "Custom";

  // Carry the current filter/sort into each trip link as `back`, so the detail
  // page's "All trips" link returns to this exact view rather than bare /trips.
  const currentQs = params.toString();
  const tripHref = (id: string) =>
    currentQs
      ? `/trips/${id}?back=${encodeURIComponent(currentQs)}`
      : `/trips/${id}`;

  // Grouped-by-day view (newest day first, trips within a day newest first).
  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, Trip[]>();
    for (const t of trips) {
      const key = dubaiDateKey(t.started_at);
      (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(t);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, dayTrips]) => {
        const sorted = [...dayTrips].sort(
          (a, b) =>
            new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        );
        return {
          key,
          label: fmtDate(sorted[0].started_at),
          trips: sorted,
          distance: sorted.reduce((s, t) => s + Number(t.distance_km), 0),
          cost: sorted.reduce((s, t) => s + Number(t.cost_aed ?? 0), 0),
        };
      });
  }, [trips]);

  // Flat ranked view for the non-day sorts.
  const flat = useMemo(() => {
    if (sortKey === "day") return [];
    const value = (t: Trip): number | null =>
      t[sortKey] == null ? null : Number(t[sortKey]);
    return [...trips].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
  }, [trips, sortKey]);

  function toggleDay(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const pill = "rounded-md px-3 py-1.5 text-sm transition-colors";

  return (
    <div className="space-y-3">
      {/* Toolbar: date-range filter and sort on the same level */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              onClick={() => setCalendarOpen((o) => !o)}
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

            {calendarOpen && (
              <RangeCalendar
                fromDay={isCustom ? fromDay : undefined}
                toDay={isCustom ? toDay : undefined}
                onApply={goCustom}
                onClear={() => {
                  goPreset(DEFAULT_RANGE);
                  setCalendarOpen(false);
                }}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-[var(--tt-muted)]">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-[var(--tt-border)] bg-[var(--tt-surface)] px-2.5 py-1.5 text-sm [color-scheme:dark] focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {trips.length === 0 ? (
        <p className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-8 text-center text-sm text-[var(--tt-muted)]">
          No trips match this filter.
        </p>
      ) : (
        <div className="tt-scroll max-h-[calc(100vh-13rem)] space-y-4 overflow-y-auto pr-1">
          {sortKey === "day" ? (
            groups.map((g) => {
              const open = !collapsed.has(g.key);
              return (
                <div key={g.key} className="space-y-2">
                  <button
                    onClick={() => toggleDay(g.key)}
                    className="flex w-full items-center justify-between gap-3 py-1 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <svg
                        viewBox="0 0 12 12"
                        aria-hidden="true"
                        className={`h-3 w-3 text-[var(--tt-muted)] transition-transform ${
                          open ? "" : "-rotate-90"
                        }`}
                      >
                        <path
                          d="M3 4.5 L6 8 L9 4.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-sm font-semibold">{g.label}</span>
                    </span>
                    <span className="text-xs text-[var(--tt-muted)] tabular-nums">
                      {g.trips.length} {g.trips.length === 1 ? "trip" : "trips"} ·{" "}
                      {fmtNum(g.distance, 1)} km · AED {fmtNum(g.cost, 2)}
                    </span>
                  </button>
                  {open && (
                    <ul className="space-y-2">
                      {g.trips.map((t) => (
                        <li key={t.id}>
                          <TripRow t={t} href={tripHref(t.id)} legs={legCounts[t.id] ?? 0} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          ) : (
            <ul className="space-y-2">
              {flat.map((t) => (
                <li key={t.id}>
                  <FlatTripRow t={t} href={tripHref(t.id)} legs={legCounts[t.id] ?? 0} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
