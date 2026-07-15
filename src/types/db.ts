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

// A refuel event: the OBD fuel level rose (driving only lowers it). Cost is
// real money at the pump, distinct from the integrated per-trip estimate.
export interface Refuel {
  id: number;
  client_refuel_id: string;
  car_id: number;
  detected_at: string;
  lat: number | null;
  lon: number | null;
  level_before_pct: number | null;
  level_after_pct: number | null;
  liters_added_est: number | null;
  fuel_price_id: number | null;
  cost_est_aed: number | null;
  created_at: string;
}

// One tank-to-tank window: real-world consumption (litres at the later
// refuel ÷ distance since the previous one) vs. the integrated trip estimate.
export interface TankWindow {
  fromAt: string;
  toAt: string;
  distanceKm: number;
  tankLiters: number; // litres added at the closing refuel
  tankLper100: number | null;
  integratedLiters: number; // Σ trips.fuel_used_liters in the window
  integratedLper100: number | null;
  driftPct: number | null; // (tank - integrated) / integrated × 100
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
  idle_seconds: number | null;
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
