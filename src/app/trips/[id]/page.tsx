import Link from "next/link";
import { notFound } from "next/navigation";
import LegBreakdown from "@/components/LegBreakdown";
import TripMapPanel from "@/components/TripMapPanel";
import {
  fmtAED,
  fmtDate,
  fmtDateTime,
  fmtDuration,
  fmtNum,
  fmtTime,
} from "@/lib/format";
import {
  getRefuels,
  getRoutePoints,
  getTrip,
  getTripLegs,
  getTripStops,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--tt-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await getTrip(id);
  if (!trip) notFound();

  const [points, legs, stops, tripRefuels] = await Promise.all([
    getRoutePoints(trip.id),
    getTripLegs(trip.id),
    getTripStops(trip.id),
    // Refuels detected during this trip's window (a refuel usually coincides
    // with a dwell, but is authoritative on its own).
    getRefuels({ from: trip.started_at, to: trip.ended_at }),
  ]);
  const isCoord = (c: (number | null)[]): c is [number, number] =>
    c[0] != null && c[1] != null;

  // Prefer the recorded GPS trace. With no route points, thread the line
  // through the leg waypoints (each leg's start + the last leg's end) so it
  // passes through every stop instead of drawing straight start->end. Fall
  // back to just the trip's start/end only when there are no legs.
  const legWaypoints: [number | null, number | null][] =
    legs.length > 0
      ? [
          ...legs.map(
            (l) => [l.start_lat, l.start_lon] as [number | null, number | null]
          ),
          [legs[legs.length - 1].end_lat, legs[legs.length - 1].end_lon],
        ]
      : [];
  const legPath: [number, number][] = legWaypoints.filter(isCoord);

  const path: [number, number][] =
    points.length > 0
      ? points.map((p) => [p.lat, p.lon])
      : legPath.length > 1
      ? legPath
      : ([
          [trip.start_lat, trip.start_lon],
          [trip.end_lat, trip.end_lon],
        ].filter(isCoord) as [number, number][]);

  const stopMarkers = stops.map((s) => ({
    lat: s.lat,
    lon: s.lon,
    label: `Stop ${s.seq} · ${fmtDuration(s.dwell_seconds)}`,
  }));

  const refuelMarkers = tripRefuels
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => ({
      lat: r.lat as number,
      lon: r.lon as number,
      label: `Refuel · ${fmtNum(r.liters_added, 1)} L · ${fmtAED(
        r.amount_paid_aed
      )}`,
    }));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/trips" className="text-sm text-[var(--tt-muted)] hover:underline">
          &larr; All trips
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Trip on {fmtDate(trip.started_at)}
        </h1>
        <p className="text-sm text-[var(--tt-muted)]">
          {fmtTime(trip.started_at)} – {fmtTime(trip.ended_at)} ·{" "}
          {fmtDuration(trip.duration_seconds)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4 sm:grid-cols-3 lg:grid-cols-4">
        <Item label="Distance" value={`${fmtNum(trip.distance_km, 2)} km`} />
        <Item label="Fuel used" value={`${fmtNum(trip.fuel_used_liters, 3)} L`} />
        <Item label="Consumption" value={`${fmtNum(trip.l_per_100km, 2)} L/100km`} />
        <Item label="Cost" value={fmtAED(trip.cost_aed)} />
        <Item label="Avg speed" value={`${fmtNum(trip.avg_speed_kmh, 1)} km/h`} />
        <Item label="Max speed" value={`${fmtNum(trip.max_speed_kmh, 1)} km/h`} />
        <Item label="In-leg idle" value={fmtDuration(trip.in_leg_idle_seconds)} />
        <Item label="Uploaded" value={fmtDateTime(trip.uploaded_at)} />
      </dl>

      <LegBreakdown legs={legs} stops={stops} />

      <div className="h-96 overflow-hidden rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)]">
        {path.length > 0 ? (
          <TripMapPanel path={path} stops={stopMarkers} refuels={refuelMarkers} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--tt-muted)]">
            No GPS data recorded for this trip.
          </div>
        )}
      </div>
      {points.length > 0 && (
        <p className="text-xs text-[var(--tt-muted)]">
          {points.length} GPS points · device trip id{" "}
          <code className="font-mono">{trip.client_trip_id}</code>
        </p>
      )}
    </div>
  );
}
