import { fmtNum } from "@/lib/format";
import type { Trip } from "@/types/db";

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4">
      <div className="text-2xl font-semibold tracking-tight">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-[var(--tt-muted)]">{unit}</span>
        )}
      </div>
      <div className="mt-1 text-xs text-[var(--tt-muted)]">{label}</div>
    </div>
  );
}

export default function SummaryCards({ trips }: { trips: Trip[] }) {
  const totalDistance = trips.reduce((s, t) => s + Number(t.distance_km), 0);
  const totalFuel = trips.reduce((s, t) => s + Number(t.fuel_used_liters), 0);
  const costed = trips.filter((t) => t.cost_aed != null);
  const totalCost = costed.reduce((s, t) => s + Number(t.cost_aed), 0);
  // Distance-weighted average, not a mean of per-trip figures.
  const avgConsumption =
    totalDistance > 0 ? (totalFuel / totalDistance) * 100 : null;
  // Fuel wasted sitting parked (already excluded from the driving totals above).
  const parkedFuel = trips.reduce(
    (s, t) => s + Number(t.parked_idle_fuel_liters ?? 0),
    0
  );
  const parkedCost = trips.reduce(
    (s, t) => s + Number(t.parked_idle_cost_aed ?? 0),
    0
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label="Trips" value={String(trips.length)} />
      <StatTile label="Total distance" value={fmtNum(totalDistance, 1)} unit="km" />
      <StatTile label="Total fuel" value={fmtNum(totalFuel, 2)} unit="L" />
      <StatTile
        label={
          costed.length < trips.length
            ? `Total cost (${trips.length - costed.length} unpriced)`
            : "Total cost"
        }
        value={fmtNum(totalCost, 2)}
        unit="AED"
      />
      <StatTile
        label="Avg consumption"
        value={avgConsumption != null ? fmtNum(avgConsumption, 2) : "—"}
        unit="L/100km"
      />
      <StatTile
        label={`Wasted parked idling · ${fmtNum(parkedCost, 2)} AED`}
        value={fmtNum(parkedFuel, 2)}
        unit="L"
      />
    </div>
  );
}
