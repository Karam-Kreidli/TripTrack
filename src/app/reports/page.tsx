import Link from "next/link";
import {
  fmtAED,
  fmtDate,
  fmtMonth,
  fmtNum,
} from "@/lib/format";
import { getMonthlySummaries, getTrips } from "@/lib/queries";
import type { Trip } from "@/types/db";

export const dynamic = "force-dynamic";

// Trips shorter than this are excluded from efficiency rankings: cold starts
// and parking maneuvers dominate consumption on very short hops.
const MIN_RANKED_DISTANCE_KM = 2;

type Tone = "good" | "bad" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-[#4ade80]",
  bad: "text-[#f87171]",
  neutral: "text-[var(--tt-accent)]",
};

// A small "top 3" ranking of trips by some metric. `metric` renders the
// highlighted figure on the right; the date + distance stay on the left.
function TripRankList({
  title,
  trips,
  tone,
  metric,
}: {
  title: string;
  trips: Trip[];
  tone: Tone;
  metric: (t: Trip) => string;
}) {
  return (
    <section className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {trips.length === 0 ? (
        <p className="text-sm text-[var(--tt-muted)]">Not enough data yet.</p>
      ) : (
        <ol className="space-y-1.5 text-sm">
          {trips.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-3">
              <Link href={`/trips/${t.id}`} className="truncate hover:underline">
                {fmtDate(t.started_at)}
                <span className="ml-2 text-xs text-[var(--tt-muted)]">
                  {fmtNum(t.distance_km, 1)} km
                </span>
              </Link>
              <span
                className={`shrink-0 font-medium tabular-nums ${TONE_CLASS[tone]}`}
              >
                {metric(t)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function ReportsPage() {
  const [months, trips] = await Promise.all([
    getMonthlySummaries(),
    getTrips(),
  ]);

  const ranked = trips.filter(
    (t) => t.l_per_100km != null && Number(t.distance_km) >= MIN_RANKED_DISTANCE_KM
  );
  const byEfficiency = [...ranked].sort(
    (a, b) => Number(a.l_per_100km) - Number(b.l_per_100km)
  );
  const mostEfficient = byEfficiency.slice(0, 3);
  const leastEfficient = byEfficiency.slice(-3).reverse();

  // Cost ranking (descending): only priced trips.
  const byCost = trips
    .filter((t) => t.cost_aed != null)
    .sort((a, b) => Number(b.cost_aed) - Number(a.cost_aed));
  const mostExpensive = byCost.slice(0, 3);
  const cheapest = byCost.slice(-3).reverse();

  // Distance ranking (descending).
  const byDistance = [...trips].sort(
    (a, b) => Number(b.distance_km) - Number(a.distance_km)
  );
  const farthest = byDistance.slice(0, 3);
  const closest = byDistance.slice(-3).reverse();

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-[var(--tt-muted)]">
        Monthly summary
      </h2>

      <section className="overflow-x-auto rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--tt-border)] text-left text-xs text-[var(--tt-muted)]">
              <th className="px-3 py-2.5 font-medium">Month</th>
              <th className="px-3 py-2.5 text-right font-medium">Trips</th>
              <th className="px-3 py-2.5 text-right font-medium">Distance (km)</th>
              <th className="px-3 py-2.5 text-right font-medium">Fuel (L)</th>
              <th className="px-3 py-2.5 text-right font-medium">Cost (AED)</th>
              <th className="px-3 py-2.5 text-right font-medium">Avg L/100km</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {months.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--tt-muted)]">
                  No months to report yet.
                </td>
              </tr>
            ) : (
              months.map((m) => (
                <tr
                  key={`${m.car_id}-${m.month}`}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="px-3 py-2 font-medium">{fmtMonth(m.month)}</td>
                  <td className="px-3 py-2 text-right">{m.trip_count}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(m.total_distance_km, 1)}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(m.total_fuel_liters, 2)}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(m.total_cost_aed, 2)}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(m.avg_l_per_100km, 2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <TripRankList
          title="Most expensive trips"
          trips={mostExpensive}
          tone="bad"
          metric={(t) => fmtAED(t.cost_aed)}
        />
        <TripRankList
          title="Least expensive trips"
          trips={cheapest}
          tone="good"
          metric={(t) => fmtAED(t.cost_aed)}
        />

        <TripRankList
          title="Farthest trips"
          trips={farthest}
          tone="neutral"
          metric={(t) => `${fmtNum(t.distance_km, 1)} km`}
        />
        <TripRankList
          title="Shortest trips"
          trips={closest}
          tone="neutral"
          metric={(t) => `${fmtNum(t.distance_km, 1)} km`}
        />

        <TripRankList
          title="Least efficient trips"
          trips={leastEfficient}
          tone="bad"
          metric={(t) => `${fmtNum(t.l_per_100km, 2)} L/100km`}
        />
        <TripRankList
          title="Most efficient trips"
          trips={mostEfficient}
          tone="good"
          metric={(t) => `${fmtNum(t.l_per_100km, 2)} L/100km`}
        />
      </div>
    </div>
  );
}
