"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtAED, fmtDuration, fmtNum, fmtTime } from "@/lib/format";
import type { TripLeg, TripStop } from "@/types/db";
import { mergeStop } from "@/app/actions/trips";

// Per-leg + per-stop breakdown of one ignition session (A->B->C...). Legs are
// the moving segments; stops are the dwells with their idle-fuel waste. Shown
// interleaved in time order so it reads as A → [stop] → B → [stop] → C.
//
// Edit mode lets you remove a falsely-flagged stop (e.g. a long light that
// tripped the dwell threshold): the two legs it split are merged and its idle
// fuel folds into the drive, so the trip total is unchanged.
export default function LegBreakdown({
  tripId,
  legs,
  stops,
}: {
  tripId: string;
  legs: TripLeg[];
  stops: TripStop[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busySeq, setBusySeq] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (legs.length === 0) return null;

  const drivingFuel = legs.reduce((s, l) => s + Number(l.fuel_used_liters), 0);
  const drivingCost = legs.reduce((s, l) => s + Number(l.cost_aed ?? 0), 0);
  const idleFuel = stops.reduce((s, st) => s + Number(st.idle_fuel_liters ?? 0), 0);
  const idleCost = stops.reduce((s, st) => s + Number(st.idle_cost_aed ?? 0), 0);
  const totalFuel = drivingFuel + idleFuel;
  const idlePct = totalFuel > 0 ? (idleFuel / totalFuel) * 100 : 0;

  async function onRemoveStop(seq: number) {
    setBusySeq(seq);
    setError(null);
    const result = await mergeStop(tripId, seq);
    setBusySeq(null);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  // Interleave: leg 1, stop 1, leg 2, stop 2, ...
  const rows: Array<
    { kind: "leg"; data: TripLeg } | { kind: "stop"; data: TripStop }
  > = [];
  legs.forEach((leg, i) => {
    rows.push({ kind: "leg", data: leg });
    const stop = stops[i];
    if (stop) rows.push({ kind: "stop", data: stop });
  });

  return (
    <section className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Legs &amp; stops
          <span className="ml-2 font-normal text-[var(--tt-muted)]">
            {legs.length} legs · {stops.length} stops
          </span>
        </h2>
        {stops.length > 0 && (
          <button
            onClick={() => {
              setEditing((e) => !e);
              setError(null);
            }}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--tt-muted)] transition-colors hover:bg-white/5 hover:text-foreground"
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {editing && (
        <p className="mb-3 rounded-md bg-white/5 px-3 py-2 text-xs text-[var(--tt-muted)]">
          Remove a stop that wasn&apos;t really one — its two legs merge into a
          single drive and its idle fuel folds in, leaving the trip total
          unchanged.
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-md bg-[#f87171]/10 px-3 py-2 text-xs text-[#f87171]">
          {error}
        </p>
      )}

      <ol className="space-y-2">
        {rows.map((row) =>
          row.kind === "leg" ? (
            <li
              key={`leg-${row.data.id}`}
              className="flex items-center gap-3 rounded-lg border border-[var(--tt-border)] px-3 py-2"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--tt-accent)] text-xs font-semibold text-[var(--tt-accent-ink)]">
                {row.data.seq}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  Leg {row.data.seq}
                  <span className="ml-2 text-xs font-normal text-[var(--tt-muted)]">
                    {fmtTime(row.data.started_at)} – {fmtTime(row.data.ended_at)}
                  </span>
                </div>
                <div className="text-xs text-[var(--tt-muted)] tabular-nums">
                  {fmtNum(row.data.distance_km, 1)} km ·{" "}
                  {fmtNum(row.data.fuel_used_liters, 3)} L ·{" "}
                  {fmtNum(row.data.l_per_100km, 2)} L/100km ·{" "}
                  {fmtNum(row.data.avg_speed_kmh, 0)} km/h
                </div>
              </div>
              <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                {fmtAED(row.data.cost_aed)}
              </div>
            </li>
          ) : (
            <li
              key={`stop-${row.data.id}`}
              className="ml-9 flex items-center gap-3 rounded-lg border border-dashed border-[var(--tt-border)] px-3 py-1.5"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: "#2a78d6" }}
                aria-hidden
              />
              <div className="min-w-0 flex-1 text-xs text-[var(--tt-muted)]">
                Stopped {fmtDuration(row.data.dwell_seconds)} · idle{" "}
                {fmtNum(row.data.idle_fuel_liters, 3)} L wasted
              </div>
              {editing ? (
                <button
                  onClick={() => onRemoveStop(row.data.seq)}
                  disabled={busySeq != null}
                  className="shrink-0 rounded-md border border-[#f87171]/40 px-2 py-1 text-xs font-medium text-[#f87171] transition-colors hover:bg-[#f87171]/10 disabled:opacity-50"
                >
                  {busySeq === row.data.seq ? "Merging…" : "Remove & merge"}
                </button>
              ) : (
                <div className="shrink-0 text-right text-xs font-medium tabular-nums text-[#f87171]">
                  {fmtAED(row.data.idle_cost_aed)}
                </div>
              )}
            </li>
          )
        )}
      </ol>

      {/* Driving vs idle split — the accounting identity, made visible */}
      <div className="mt-4 border-t border-[var(--tt-border)] pt-3">
        <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="bg-[var(--tt-accent)]"
            style={{ width: `${100 - idlePct}%` }}
          />
          <div style={{ width: `${idlePct}%`, background: "#f87171" }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs tabular-nums">
          <span className="text-[var(--tt-muted)]">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tt-accent)] align-middle" />
            Driving {fmtNum(drivingFuel, 3)} L · {fmtAED(drivingCost)}
          </span>
          <span className="text-[var(--tt-muted)]">
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#f87171" }} />
            Idle {fmtNum(idleFuel, 3)} L · {fmtAED(idleCost)} ({fmtNum(idlePct, 0)}% of fuel)
          </span>
        </div>
      </div>
    </section>
  );
}
