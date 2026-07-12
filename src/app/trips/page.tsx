import TripsList from "@/components/TripsList";
import { resolvePeriod } from "@/lib/periods";
import { getTrips } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range, from, to } = await searchParams;
  const period = resolvePeriod(range, { from, to });
  const trips = await getTrips({ from: period.from, to: period.to });

  return (
    <div className="space-y-4">
      <TripsList
        trips={trips}
        rangeKey={period.key}
        fromDay={period.fromDay}
        toDay={period.toDay}
      />
    </div>
  );
}
