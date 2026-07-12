import { fmtDateTime, fmtNum } from "@/lib/format";
import type { Refuel } from "@/types/db";

function levelArrow(before: number | null, after: number | null): string {
  if (before == null || after == null) return "—";
  return `${fmtNum(before, 0)}% → ${fmtNum(after, 0)}%`;
}

export default function RefuelLog({ refuels }: { refuels: Refuel[] }) {
  if (refuels.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-8 text-center text-sm text-[var(--tt-muted)]">
        No refuels detected in this period.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--tt-border)] text-left text-xs text-[var(--tt-muted)]">
            <th className="px-3 py-2.5 font-medium">Date</th>
            <th className="px-3 py-2.5 font-medium">Tank level</th>
            <th className="px-3 py-2.5 text-right font-medium">Litres added (est)</th>
            <th className="px-3 py-2.5 text-right font-medium">Cost (AED)</th>
            <th className="px-3 py-2.5 font-medium">Location</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {refuels.map((r) => (
            <tr
              key={r.id}
              className="border-b border-white/5 last:border-0 hover:bg-white/5"
            >
              <td className="px-3 py-2 whitespace-nowrap">
                {fmtDateTime(r.detected_at)}
              </td>
              <td className="px-3 py-2 text-[var(--tt-muted)]">
                {levelArrow(r.level_before_pct, r.level_after_pct)}
              </td>
              <td className="px-3 py-2 text-right">
                {fmtNum(r.liters_added_est, 2)} L
              </td>
              <td className="px-3 py-2 text-right font-medium text-[var(--tt-accent)]">
                {fmtNum(r.cost_est_aed, 2)}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--tt-muted)]">
                {r.lat != null && r.lon != null ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=15/${r.lat}/${r.lon}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[var(--tt-accent)] hover:underline"
                  >
                    {fmtNum(r.lat, 4)}, {fmtNum(r.lon, 4)}
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
