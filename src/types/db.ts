// Row shapes as returned by PostgREST (numeric columns arrive as JSON numbers).

export interface Car {
  id: number;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  fuel_type: string;
  device_id: string | null;
  tank_capacity_liters: number | null;
  image_url: string | null;
  created_at: string;
}

// A refuel event: MANUAL entry keyed on amount paid. Litres are derived exactly
// from the government-set UAE price on the refuel's date (not an estimate). The
// data is permanently incomplete — multiple drivers, voluntary logging.
export interface Refuel {
  id: number;
  client_refuel_id: string;
  car_id: number;
  refueled_at: string;
  entered_at: string;
  amount_paid_aed: number; // primary input — what was actually paid
  liters_added_override: number | null; // exact pump litres, if the user has them
  liters_added: number | null; // derived (or override) — amount_paid_aed / price
  odometer_km: number | null;
  is_full_tank: boolean;
  fuel_price_id: number | null;
  lat: number | null;
  lon: number | null;
  created_at: string;
}

// One tank-to-tank window: real-world consumption (litres pumped at the later
// full fill ÷ distance) vs. the MAF-integrated trip estimate. A window is
// INVALID (excluded from the check) when a refuel was likely missed — the only
// independent check on the fuel estimate must refuse a number it can't stand
// behind.
export interface TankWindow {
  fromAt: string;
  toAt: string;
  distanceKm: number;
  distanceSource: "odometer" | "trips"; // how distanceKm was measured
  tankLiters: number; // litres pumped at the closing fill
  tankLper100: number | null;
  integratedLiters: number; // MAF-integrated estimate over the window
  integratedLper100: number | null;
  driftPct: number | null; // (tank - integrated) / integrated × 100
  valid: boolean;
  invalidReason: string | null; // why it was excluded, if invalid
}

export interface FuelPrice {
  id: number;
  fuel_type: string;
  price_per_liter: number;
  effective_from: string; // date, YYYY-MM-DD
  created_at: string;
}

export interface Trip {
  id: string;
  client_trip_id: string;
  car_id: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  distance_km: number;
  fuel_used_liters: number;
  in_leg_idle_seconds: number | null;
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  start_lat: number | null;
  start_lon: number | null;
  end_lat: number | null;
  end_lon: number | null;
  l_per_100km: number | null;
  fuel_price_id: number | null;
  cost_aed: number | null;
  notes: Record<string, unknown> | null;
  uploaded_at: string;
}

export interface RoutePoint {
  id: number;
  trip_id: string;
  seq: number;
  recorded_at: string;
  lat: number;
  lon: number;
  speed_kmh: number | null;
}

// A moving segment between stops within one ignition session (A->B, B->C...).
export interface TripLeg {
  id: number;
  trip_id: string;
  seq: number;
  start_lat: number | null;
  start_lon: number | null;
  end_lat: number | null;
  end_lon: number | null;
  started_at: string;
  ended_at: string;
  distance_km: number;
  fuel_used_liters: number;
  avg_speed_kmh: number | null;
  l_per_100km: number | null;
  cost_aed: number | null;
}

// A stationary dwell within a trip (engine running), with idle fuel + cost.
export interface TripStop {
  id: number;
  trip_id: string;
  seq: number;
  lat: number;
  lon: number;
  arrived_at: string;
  departed_at: string;
  dwell_seconds: number;
  idle_fuel_liters: number | null;
  idle_cost_aed: number | null;
  probable_refuel: boolean | null; // looks like a fill-up (short engine-on stop at a station)
}

// A petrol station used for GPS probable-refuel matching.
export interface FuelStation {
  id: number;
  name: string;
  lat: number;
  lon: number;
}

export interface MonthlySummary {
  car_id: number;
  month: string; // first day of month, YYYY-MM-DD (Dubai-local months)
  trip_count: number;
  total_distance_km: number;
  total_fuel_liters: number;
  total_cost_aed: number | null;
  total_idle_seconds: number | null;
  avg_l_per_100km: number | null;
}

// The subset of trip fields the charts need (kept small since it crosses the
// server -> client component boundary as props).
export interface TripChartPoint {
  id: string;
  started_at: string;
  distance_km: number;
  fuel_used_liters: number;
  cost_aed: number | null;
  l_per_100km: number | null;
}
