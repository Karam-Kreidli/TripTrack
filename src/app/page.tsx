import Link from "next/link";
import ChartTabs from "@/components/ChartTabs";
import DashboardControls from "@/components/DashboardControls";
import SummaryCards from "@/components/SummaryCards";
import { resolveBucket } from "@/components/charts/chart-utils";
import { resolvePeriod } from "@/lib/periods";
import { getTrips } from "@/lib/queries";
import type { TripChartPoint } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; bucket?: string }>;
}) {
  const { range, from, to, bucket: bucketParam } = await searchParams;
  const period = resolvePeriod(range, { from, to });
  const bucket = resolveBucket(bucketParam);
  const trips = await getTrips({ from: period.from, to: period.to });

  const chartPoints: TripChartPoint[] = trips.map((t) => ({
    id: t.id,
    started_at: t.started_at,
    distance_km: t.distance_km,
    fuel_used_liters: t.fuel_used_liters,
    cost_aed: t.cost_aed,
    l_per_100km: t.l_per_100km,
  }));

  return (
    <div className="space-y-4">
      <DashboardControls
        rangeKey={period.key}
        fromDay={period.fromDay}
        toDay={period.toDay}
      />

      {trips.length === 0 ? (
        <div className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-8 text-center text-sm text-[var(--tt-muted)]">
          <p className="mb-1 font-medium text-foreground">
            No trips in “{period.label}”.
          </p>
          <p>
            Trips appear here once the device uploads them. Try{" "}
            <Link href="/?range=all" className="underline">
              All time
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <SummaryCards trips={trips} />
          <ChartTabs trips={chartPoints} bucket={bucket} />
        </>
      )}
    </div>
  );
}
