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

// The fuel price in effect now (latest effective_from on or before today), used
// to preview derived litres in the refuel entry form.
export async function getCurrentFuelPrice(
  fuelType = "95_special"
): Promise<FuelPrice | null> {
  const sb = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("fuel_prices")
    .select("*")
    .eq("fuel_type", fuelType)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("Loading fuel price failed", error.message);
  return data as FuelPrice | null;
}

export async function getRefuels(
  opts: { from?: string; to?: string } = {}
): Promise<Refuel[]> {
  const sb = getSupabase();
  let query = sb
    .from("refuels")
    .select("*")
    .order("refueled_at", { ascending: false })
    .limit(5000);
  if (opts.from) query = query.gte("refueled_at", opts.from);
  if (opts.to) query = query.lt("refueled_at", opts.to);

  const { data, error } = await query;
  if (error) fail("Loading refuels failed", error.message);
  return data as Refuel[];
}

// Stops flagged as probable (unlogged) refuels — a short engine-on dwell at a
// station. Used to invalidate tank-to-tank intervals that contain one with no
// matching logged refuel. Returns [] until GPS/station matching populates it.
export async function getProbableRefuelStops(): Promise<TripStop[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("trip_stops")
    .select("*")
    .eq("probable_refuel", true);
  if (error) fail("Loading probable refuels failed", error.message);
  return data as TripStop[];
}

// How far past tank capacity we tolerate before declaring a missed refuel.
const TANK_OVERRUN_TOLERANCE = 1.05;

// Tank-to-tank cross-check — the only independent check on the MAF-derived fuel
// estimate. For each interval between two consecutive FULL fills, compare litres
// actually pumped vs. the MAF-integrated estimate over the same distance.
//
// The data is permanently incomplete (multiple drivers, voluntary logging), and
// a missed refuel makes an interval CONFIDENTLY WRONG rather than merely absent.
// So every interval is validity-checked and invalid ones are excluded (never
// silently averaged in) but still returned so the page can surface the gap.
export async function getTankWindows(): Promise<TankWindow[]> {
  const [refuels, trips, probableStops, cars] = await Promise.all([
    getRefuels(),
    getTrips(),
    getProbableRefuelStops(),
    getCars(),
  ]);

  // Tank capacity of the (single) car; refuels are one car for now.
  const tankCapacity = cars[0]?.tank_capacity_liters ?? null;

  const rf = [...refuels].sort(
    (a, b) =>
      new Date(a.refueled_at).getTime() - new Date(b.refueled_at).getTime()
  );

  const windows: TankWindow[] = [];
  for (let i = 1; i < rf.length; i++) {
    const prev = rf[i - 1];
    const cur = rf[i];
    if (cur.liters_added == null) continue;

    const fromMs = new Date(prev.refueled_at).getTime();
    const toMs = new Date(cur.refueled_at).getTime();
    const tankLiters = Number(cur.liters_added);

    // Distance + MAF estimate over the window. The engine is never switched off,
    // so a fill lands mid-trip; count only the time-overlapping share of each
    // trip (split at the refuel instant) rather than whole trips.
    let tripsDistanceKm = 0;
    let integratedLiters = 0;
    for (const t of trips) {
      const ts = new Date(t.started_at).getTime();
      const te = new Date(t.ended_at).getTime();
      const span = te - ts;
      const overlap = Math.min(te, toMs) - Math.max(ts, fromMs);
      if (overlap <= 0) continue;
      const frac = span > 0 ? overlap / span : 1;
      tripsDistanceKm += Number(t.distance_km) * frac;
      integratedLiters += Number(t.fuel_used_liters) * frac;
    }

    // Prefer an odometer delta when both endpoints have it (independent of the
    // trip integration); else fall back to integrated trip distance.
    let distanceKm = tripsDistanceKm;
    let distanceSource: "odometer" | "trips" = "trips";
    if (prev.odometer_km != null && cur.odometer_km != null) {
      const odoDelta = Number(cur.odometer_km) - Number(prev.odometer_km);
      if (odoDelta > 0) {
        distanceKm = odoDelta;
        distanceSource = "odometer";
      }
    }

    // Interval validity — refuse a number we can't stand behind.
    let invalidReason: string | null = null;
    if (!prev.is_full_tank || !cur.is_full_tank) {
      invalidReason = "endpoint not a full tank";
    } else if (tankCapacity != null && tankLiters > tankCapacity) {
      invalidReason = "fill exceeds tank capacity (bad data / non-fuel purchase)";
    } else if (
      tankCapacity != null &&
      integratedLiters > tankCapacity * TANK_OVERRUN_TOLERANCE
    ) {
      // Physically impossible between two full fills → a refuel was missed.
      invalidReason = "estimated burn exceeds a tankful — suspected unlogged refuel";
    } else if (
      probableStops.some((s) => {
        const sm = new Date(s.arrived_at).getTime();
        return sm > fromMs && sm < toMs;
      })
    ) {
      invalidReason = "a probable refuel stop has no matching logged entry";
    } else if (distanceKm <= 0) {
      invalidReason = "no distance recorded in the interval";
    }

    const valid = invalidReason == null;
    windows.push({
      fromAt: prev.refueled_at,
      toAt: cur.refueled_at,
      distanceKm,
      distanceSource,
      tankLiters,
      tankLper100: valid && distanceKm > 0 ? (tankLiters / distanceKm) * 100 : null,
      integratedLiters,
      integratedLper100:
        valid && distanceKm > 0 ? (integratedLiters / distanceKm) * 100 : null,
      driftPct:
        valid && integratedLiters > 0
          ? ((tankLiters - integratedLiters) / integratedLiters) * 100
          : null,
      valid,
      invalidReason,
    });
  }
  return windows.reverse(); // newest first for display
}
