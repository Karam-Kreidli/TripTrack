import Link from "next/link";
import DashboardControls from "@/components/DashboardControls";
import RefuelEntryForm from "@/components/RefuelEntryForm";
import RefuelLog from "@/components/RefuelLog";
import TankToTankCheck from "@/components/TankToTankCheck";
import CostPerRefuelChart from "@/components/charts/CostPerRefuelChart";
import CumulativeSpendChart from "@/components/charts/CumulativeSpendChart";
import { fmtNum } from "@/lib/format";
import { resolvePeriod } from "@/lib/periods";
import {
  getCars,
  getCurrentFuelPrice,
  getProbableRefuelStops,
  getRefuels,
  getTankWindows,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function SpendTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4">
      <div className="text-2xl font-semibold tracking-tight">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-[var(--tt-muted)]">
            {unit}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-[var(--tt-muted)]">{label}</div>
    </div>
  );
}

export default async function RefuelsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range, from, to } = await searchParams;
  const period = resolvePeriod(range, { from, to });

  // Log / spend / chart respect the period. The cross-check uses all data so
  // tank-to-tank windows aren't clipped at the period boundary.
  const [refuels, windows, cars, currentPrice, probableStops] =
    await Promise.all([
      getRefuels({ from: period.from, to: period.to }),
      getTankWindows(),
      getCars(),
      getCurrentFuelPrice(),
      getProbableRefuelStops(),
    ]);

  const totalSpend = refuels.reduce(
    (s, r) => s + Number(r.amount_paid_aed ?? 0),
    0
  );
  const totalLiters = refuels.reduce(
    (s, r) => s + Number(r.liters_added ?? 0),
    0
  );
  const avgFill = refuels.length > 0 ? totalSpend / refuels.length : null;

  const excludedIntervals = windows.filter((w) => !w.valid).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DashboardControls
          rangeKey={period.key}
          fromDay={period.fromDay}
          toDay={period.toDay}
          basePath="/refuels"
        />
        <RefuelEntryForm cars={cars} currentPrice={currentPrice} />
      </div>

      {/* Gaps stay legible: surface excluded intervals / probable refuels when
          there are any, without the standing "not total spend" preamble. */}
      {(excludedIntervals > 0 || probableStops.length > 0) && (
        <div className="rounded-lg border border-[var(--tt-border)] bg-[var(--tt-surface)] px-3 py-2 text-xs text-[var(--tt-muted)]">
          {excludedIntervals > 0 && (
            <span className="text-[#f5a524]">
              {excludedIntervals} cross-check interval
              {excludedIntervals === 1 ? "" : "s"} excluded (suspected gap).
            </span>
          )}
          {probableStops.length > 0 && (
            <>
              {" "}
              {probableStops.length} probable-refuel stop
              {probableStops.length === 1 ? "" : "s"} detected from GPS.
            </>
          )}
        </div>
      )}

      {refuels.length === 0 && windows.length === 0 ? (
        <div className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-8 text-center text-sm text-[var(--tt-muted)]">
          <p className="mb-1 font-medium text-foreground">
            No refuels logged in “{period.label}”.
          </p>
          <p>
            Use “Log a refuel” above to add one, or try{" "}
            <Link href="/refuels?range=all" className="underline">
              All time
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SpendTile label="Logged refuels" value={String(refuels.length)} />
            <SpendTile
              label="Logged spend (not total)"
              value={fmtNum(totalSpend, 2)}
              unit="AED"
            />
            <SpendTile
              label="Litres (derived)"
              value={fmtNum(totalLiters, 1)}
              unit="L"
            />
            <SpendTile
              label="Avg per fill"
              value={avgFill != null ? fmtNum(avgFill, 2) : "—"}
              unit="AED"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4">
              <CostPerRefuelChart refuels={refuels} bare />
            </div>
            <div className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4">
              <CumulativeSpendChart refuels={refuels} bare />
            </div>
          </div>

          <TankToTankCheck windows={windows} />

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Refuel log</h2>
            <RefuelLog refuels={refuels} />
          </div>
        </>
      )}
    </div>
  );
}
