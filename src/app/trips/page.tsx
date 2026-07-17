import TripsList from "@/components/TripsList";
import { resolvePeriod } from "@/lib/periods";
import { getLegCounts, getTrips } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range, from, to } = await searchParams;
  const period = resolvePeriod(range, { from, to });
  const [trips, legCounts] = await Promise.all([
    getTrips({ from: period.from, to: period.to }),
    getLegCounts(),
  ]);

  // Plain object (a Map can't cross the server→client boundary as-is).
  const legCountById: Record<string, number> = Object.fromEntries(legCounts);

  return (
    <div className="space-y-4">
      <TripsList
        trips={trips}
        legCounts={legCountById}
        rangeKey={period.key}
        fromDay={period.fromDay}
        toDay={period.toDay}
      />
    </div>
  );
}
