import { getSupabase } from "./supabase";
import type {
  Car,
  FuelPrice,
  MonthlySummary,
  Refuel,
  RoutePoint,
  TankWindow,
  Trip,
  TripLeg,
  TripStop,
} from "@/types/db";

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

export async function getTrips(
  opts: { from?: string; to?: string } = {}
): Promise<Trip[]> {
  const sb = getSupabase();
  let query = sb
    .from("trips")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5000);
  if (opts.from) query = query.gte("started_at", opts.from);
  if (opts.to) query = query.lt("started_at", opts.to);

  const { data, error } = await query;
  if (error) fail("Loading trips failed", error.message);
  return data as Trip[];
}

export type TripWithPrice = Trip & {
  fuel_prices: Pick<FuelPrice, "price_per_liter" | "effective_from"> | null;
};

export async function getTrip(id: string): Promise<TripWithPrice | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("trips")
    .select("*, fuel_prices(price_per_liter, effective_from)")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("Loading trip failed", error.message);
  return data as TripWithPrice | null;
}

export async function getRoutePoints(tripId: string): Promise<RoutePoint[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("route_points")
    .select("*")
    .eq("trip_id", tripId)
    .order("seq", { ascending: true })
    .limit(20000);
  if (error) fail("Loading route failed", error.message);
  return data as RoutePoint[];
}

export async function getTripLegs(tripId: string): Promise<TripLeg[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("trip_legs")
    .select("*")
    .eq("trip_id", tripId)
    .order("seq", { ascending: true });
  if (error) fail("Loading legs failed", error.message);
  return data as TripLeg[];
}

export async function getTripStops(tripId: string): Promise<TripStop[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("trip_stops")
    .select("*")
    .eq("trip_id", tripId)
    .order("seq", { ascending: true });
  if (error) fail("Loading stops failed", error.message);
  return data as TripStop[];
}

export async function getMonthlySummaries(): Promise<MonthlySummary[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("monthly_summary")
    .select("*")
    .order("month", { ascending: false });
  if (error) fail("Loading monthly summary failed", error.message);
  return data as MonthlySummary[];
}

export async function getCars(): Promise<Car[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("cars").select("*").order("id");
  if (error) fail("Loading cars failed", error.message);
  return data as Car[];
}

export async function getRefuels(
  opts: { from?: string; to?: string } = {}
): Promise<Refuel[]> {
  const sb = getSupabase();
  let query = sb
    .from("refuels")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(5000);
  if (opts.from) query = query.gte("detected_at", opts.from);
  if (opts.to) query = query.lt("detected_at", opts.to);

  const { data, error } = await query;
  if (error) fail("Loading refuels failed", error.message);
  return data as Refuel[];
}

// Tank-to-tank cross-check: for each pair of consecutive refuels, compare the
// litres actually pumped at the closing fill against the integrated per-trip
// fuel estimate over the same distance window. Computed here (not in SQL) so
// the page can show both numbers side by side. Uses ALL refuels/trips so
// windows aren't clipped by a period filter.
export async function getTankWindows(): Promise<TankWindow[]> {
  const [refuels, trips] = await Promise.all([
    getRefuels(),
    getTrips(),
  ]);
  // Ascending by time.
  const rf = [...refuels].sort(
    (a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime()
  );
  const windows: TankWindow[] = [];
  for (let i = 1; i < rf.length; i++) {
    const prev = rf[i - 1];
    const cur = rf[i];
    if (cur.liters_added_est == null) continue;
    const fromMs = new Date(prev.detected_at).getTime();
    const toMs = new Date(cur.detected_at).getTime();

    // The car isn't switched off between errands or across refuels, so a fill
    // often lands *inside* a trip. Attributing a whole trip to whichever window
    // its start falls in would dump the spanning trip entirely on one side and
    // misstate consumption around every fill-up. Instead, count only the share
    // of each trip whose time overlaps [from, to), splitting the trip at the
    // refuel instant. (Time-proportional: exact if the trip's rate is roughly
    // constant; leg-level attribution would refine this further.)
    let distanceKm = 0;
    let integratedLiters = 0;
    for (const t of trips) {
      const ts = new Date(t.started_at).getTime();
      const te = new Date(t.ended_at).getTime();
      const span = te - ts;
      const overlap = Math.min(te, toMs) - Math.max(ts, fromMs);
      if (overlap <= 0) continue;
      // A zero/negative-span trip that falls in the window counts wholly.
      const frac = span > 0 ? overlap / span : 1;
      distanceKm += Number(t.distance_km) * frac;
      integratedLiters += Number(t.fuel_used_liters) * frac;
    }
    if (distanceKm <= 0) continue;

    const tankLiters = Number(cur.liters_added_est);
    windows.push({
      fromAt: prev.detected_at,
      toAt: cur.detected_at,
      distanceKm,
      tankLiters,
      tankLper100: (tankLiters / distanceKm) * 100,
      integratedLiters,
      integratedLper100:
        integratedLiters > 0 ? (integratedLiters / distanceKm) * 100 : null,
      driftPct:
        integratedLiters > 0
          ? ((tankLiters - integratedLiters) / integratedLiters) * 100
          : null,
    });
  }
  return windows.reverse(); // newest first for display
}
