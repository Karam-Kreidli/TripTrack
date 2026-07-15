import { fmtDate, fmtNum } from "@/lib/format";
import type { TankWindow } from "@/types/db";

// A drift beyond this (either direction) is flagged: the integrated per-trip
// estimate is diverging meaningfully from the tank-to-tank truth.
const DRIFT_FLAG_PCT = 7;

function DriftBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[var(--tt-muted)]">—</span>;
  const big = Math.abs(pct) >= DRIFT_FLAG_PCT;
  const sign = pct > 0 ? "+" : "";
  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${
        big ? "font-semibold text-[#f87171]" : "text-[var(--tt-muted)]"
      }`}
    >
      {big && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-[#f87171]"
        />
      )}
      {sign}
      {fmtNum(pct, 1)}%
    </span>
  );
}

export default function TankToTankCheck({
  windows,
}: {
  windows: TankWindow[];
}) {
  const valid = windows.filter((w) => w.valid);
  const invalid = windows.filter((w) => !w.valid);

  return (
    <section className="space-y-3 rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Tank-to-tank cross-check</h2>
        {invalid.length > 0 && (
          <span className="rounded-md bg-[#f87171]/10 px-2 py-1 text-xs font-medium text-[#f87171]">
            {invalid.length} interval{invalid.length === 1 ? "" : "s"} excluded —
            suspected unlogged refuel
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--tt-muted)]">
        Real litres pumped vs. the MAF-derived estimate over the same distance.
        This is the only independent check on the estimate — intervals where a
        refuel was likely missed are excluded, never averaged in.
      </p>

      {windows.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--tt-muted)]">
          Need at least two full-tank refuels with trips between them to compare.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--tt-border)] text-left text-xs text-[var(--tt-muted)]">
                <th className="px-3 py-2 font-medium">Window</th>
                <th className="px-3 py-2 text-right font-medium">Distance</th>
                <th className="px-3 py-2 text-right font-medium">Tank L/100km</th>
                <th className="px-3 py-2 text-right font-medium">Est. L/100km</th>
                <th className="px-3 py-2 text-right font-medium">Drift</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {valid.map((w, i) => (
                <tr key={`v${i}`} className="border-b border-white/5">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtDate(w.fromAt)} → {fmtDate(w.toAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {fmtNum(w.distanceKm, 1)} km
                    {w.distanceSource === "odometer" && (
                      <span className="ml-1 text-xs text-[var(--tt-muted)]">odo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-[var(--tt-accent)]">
                    {fmtNum(w.tankLper100, 2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {fmtNum(w.integratedLper100, 2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DriftBadge pct={w.driftPct} />
                  </td>
                </tr>
              ))}
              {/* Excluded intervals: shown, dimmed, with the reason — legible, not hidden. */}
              {invalid.map((w, i) => (
                <tr key={`x${i}`} className="border-b border-white/5 last:border-0 opacity-60">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtDate(w.fromAt)} → {fmtDate(w.toAt)}
                  </td>
                  <td
                    className="px-3 py-2 text-xs text-[#f5a524]"
                    colSpan={4}
                  >
                    excluded — {w.invalidReason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
