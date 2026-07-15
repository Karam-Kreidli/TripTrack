# TripTrack

Personal per-ride fuel cost tracker for a Renault Koleos 2022 (petrol, UAE 95
Special). An in-car ESP32 (OBD-II + GPS) logs each trip and uploads it — with
a delay, via a phone bridge — to Supabase. This repo is the **backend
(Supabase) and dashboard (Next.js)**; the firmware lives elsewhere.

## Stack

- **Supabase (Postgres)** — schema, cost calculation, ingestion RPC (`supabase/migrations/`)
- **Next.js App Router + TypeScript + Tailwind** — dashboard (`src/`)
- **Recharts** for charts, **Leaflet** for the trip route map

## Setup

1. Create a Supabase project and apply the three migrations in
   `supabase/migrations/` in order (via the SQL editor, `supabase db push`,
   or the Supabase MCP). They create the schema, seed the Koleos + the July
   2026 fuel price, install the cost triggers, RLS, the `ingest_trip` RPC,
   and the `monthly_summary` view.
2. `cp .env.example .env.local` and fill in your project URL and publishable
   key (Dashboard → Settings → API). Nothing is hardcoded; the app fails with
   a clear message if these are missing.
3. `npm install && npm run dev` → http://localhost:3000

The dashboard's key is **read-only**: RLS only grants `select` to `anon`.
All writes go through `ingest_trip`, which only the secret (service-role) key
may execute.

## Cost calculation (authoritative, in-database)

`cost_aed` is never computed by the dashboard or the device. A `BEFORE INSERT
OR UPDATE` trigger on `trips` looks up the latest `fuel_prices` row whose
`effective_from` is on or before the trip's **start date in Asia/Dubai** and
stamps `fuel_price_id` + `cost_aed = fuel_used_liters × price_per_liter`.

Why a trigger instead of an Edge Function: a trigger runs no matter how the
row arrives (REST upsert, retry, manual backfill), so the cost can't be stale
or bypassed, and there's no extra network hop. An Edge Function only prices
trips for callers that remember to route through it.

Out-of-order handling works in both directions:

- **Trip arrives late** (e.g. a June trip uploads in July): the trigger picks
  June's price, not the current one.
- **Price arrives late** (you add a month's price after its trips uploaded):
  a trigger on `fuel_prices` recomputes every trip inside that price's
  effective window. Trips with no applicable price keep `cost_aed = null`
  until a price is backfilled.

**Monthly chore:** on the 1st of each month, insert the new UAE 95 Special
price:

```sql
insert into fuel_prices (fuel_type, price_per_liter, effective_from)
values ('95_special', <new price>, '<YYYY-MM-01>');
```

## Ingestion contract (device → Supabase)

The device (or the phone bridge) makes **one HTTP call per trip** to the
`ingest_trip` RPC through Supabase's REST API:

```
POST {SUPABASE_URL}/rest/v1/rpc/ingest_trip
apikey: {SUPABASE_SECRET_KEY}
Authorization: Bearer {SUPABASE_SECRET_KEY}
Content-Type: application/json
```

Both values come from environment/config on the uploader — never hardcode
them in firmware. The body wraps the trip in a `payload` field:

```json
{
  "payload": {
    "client_trip_id": "koleos-20260709-183012-a1b2",
    "car_id": 1,
    "started_at": "2026-07-09T18:30:12+04:00",
    "ended_at": "2026-07-09T18:52:47+04:00",
    "duration_seconds": 1355,
    "distance_km": 14.82,
    "fuel_used_liters": 1.213,
    "idle_seconds": 210,
    "avg_speed_kmh": 39.4,
    "max_speed_kmh": 92.0,
    "start_lat": 25.276987,
    "start_lon": 55.296249,
    "end_lat": 25.197197,
    "end_lon": 55.274376,
    "notes": { "fw": "0.3.1" },
    "route_points": [
      { "seq": 0, "recorded_at": "2026-07-09T18:30:12+04:00", "lat": 25.276987, "lon": 55.296249, "speed_kmh": 0 },
      { "seq": 1, "recorded_at": "2026-07-09T18:30:17+04:00", "lat": 25.276410, "lon": 55.295803, "speed_kmh": 23.5 }
    ],
    "legs": [
      { "seq": 1, "start_lat": 25.276987, "start_lon": 55.296249, "end_lat": 25.240000, "end_lon": 55.305000, "started_at": "2026-07-09T18:30:12+04:00", "ended_at": "2026-07-09T18:41:00+04:00", "distance_km": 8.10, "fuel_used_liters": 0.802, "avg_speed_kmh": 38.5 },
      { "seq": 2, "start_lat": 25.240000, "start_lon": 55.305000, "end_lat": 25.197197, "end_lon": 55.274376, "started_at": "2026-07-09T18:45:09+04:00", "ended_at": "2026-07-09T18:52:47+04:00", "distance_km": 6.72, "fuel_used_liters": 0.372, "avg_speed_kmh": 63.0 }
    ],
    "stops": [
      { "seq": 1, "lat": 25.240000, "lon": 55.305000, "arrived_at": "2026-07-09T18:41:00+04:00", "departed_at": "2026-07-09T18:45:09+04:00", "dwell_seconds": 249, "idle_fuel_liters": 0.039 }
    ]
  }
}
```

Field notes:

| Field | Required | Notes |
|---|---|---|
| `client_trip_id` | yes | Generated on the device, globally unique (e.g. device id + start timestamp). **The idempotency key.** |
| `car_id` | yes* | *Or send `device_id` instead; the RPC resolves the car from `cars.device_id`. |
| `started_at`, `ended_at` | yes | ISO-8601 with offset. Send the real wall-clock offset (`+04:00`); cost pricing is done against the Dubai-local date. |
| `duration_seconds`, `distance_km`, `fuel_used_liters` | yes | `l_per_100km` is derived in the database — don't send it. See the source note below on `distance_km` and `fuel_used_liters` — they're the two signals every headline number rests on. |
| `idle_seconds` | no | **In-leg idle only** — engine-on-but-stationary time *within the moving legs* (traffic lights, brief halts below the stop threshold). It **excludes** flagged-stop dwell, which is carried separately by each stop's `dwell_seconds`. So total stationary time = `idle_seconds` + Σ `stops.dwell_seconds`; consequently `idle_seconds` can be (and usually is) **less** than any single stop's dwell. Don't conflate the two. |
| `avg_speed_kmh`, `max_speed_kmh`, `start/end_lat/lon`, `notes` | no | `notes` is free-form JSON. |
| `route_points[]` | no | `seq` starts at 0 and must be unique per trip; `speed_kmh` optional. |
| `legs[]` | no | The moving segments between stops (A→B, B→C…). One ignition session with two stops = three legs; a stop-free trip has one leg or none. `seq` starts at 1. Send `distance_km` + `fuel_used_liters` from cumulative-odometer/fuel snapshots at each boundary — do **not** send `l_per_100km` or `cost_aed`; both are server-computed. |
| `stops[]` | no | Stationary dwells within the trip (engine running), detected when speed ≈ 0 past the dwell threshold. `dwell_seconds` and `idle_fuel_liters` are what qualify a location as a real stop vs. a traffic light. Don't send `idle_cost_aed` — server-computed. |

### Where these numbers come from (signal sources)

The schema receives `distance_km` and `fuel_used_liters` as givens, but **every
headline figure — trip/leg/idle cost, L/100km — derives from them**, so the
device is responsible for choosing the right source. This isn't cosmetic; it
sets the error floor.

- **`distance_km` — prefer integrated OBD speed (PID `0x0D`, universally
  supported).** Integrating vehicle speed over time is the more trustworthy
  basis for *distance*. Use **GPS for the route shape only** (the
  `route_points[]` polyline), not for the odometer figure: GPS jitter while
  stationary accumulates **phantom distance** and can register a "moving"
  reading at 0 actual km/h, which both inflates distance and muddies stop
  detection. If you must derive distance from GPS-haversine, expect a different
  (and generally worse) error profile — state which you used in `notes`.

- **`fuel_used_liters` — this is the load-bearing, least-certain signal.**
  The whole dataset rests on it, and how the car exposes fuel decides whether
  your numbers are *measured*, *approximated*, or *impossible*, in descending
  quality:
  1. **Direct fuel-rate PID (`0x5E`)** — engine fuel rate in L/h, integrate over
     time. Best case; the figure is genuinely measured.
  2. **MAF-derived (`0x10` + assumed air-fuel ratio)** — compute fuel from mass
     air flow and a stoichiometric AFR fudge factor. Works, but carries more
     error and needs calibration against known fill-ups.
  3. **Neither** — you're reduced to a fixed economy constant × distance, which
     guts the premise (you'd be *assuming* consumption, then "discovering" it).

  **Probe this with the ELM327 on day one** — it's the single measurement that
  determines whether TripTrack is measuring reality or narrating an assumption.
  Which PIDs the Koleos (Renault/Samsung-derived) actually exposes is not
  safely assertable from memory; verify on the car, don't trust a spec sheet.

### Legs & stops: the decomposition model

A **trip** is one ignition session (engine on → engine off). If you drive
A→B→C without shutting the engine off, that's **one trip**, decomposed into:

- **legs** — the moving segments (A→B, B→C). Each carries its own distance and
  fuel from cumulative snapshots, so per-leg consumption is real, not a
  proportional guess.
- **stops** — the dwell at B, carrying the **idle fuel** burned while parked
  with the engine running.

This lets the dashboard show driving cost per leg *and* idle waste as its own
line. The data must satisfy an accounting identity you can validate against:

```
trip.fuel_used_liters = Σ legs.fuel_used_liters + Σ stops.idle_fuel_liters
trip.cost_aed         = Σ legs.cost_aed         + Σ stops.idle_cost_aed
```

If those don't reconcile, a snapshot was dropped. `legs[]`/`stops[]` are
optional — omit them and the trip is just its flat totals as before.

**Reconciling the example** (so the two time budgets are clear, since they're
easy to conflate):

- *Fuel:* `0.802 + 0.372` (legs) `+ 0.039` (stop idle) `= 1.213` ✓
- *Distance:* `8.10 + 6.72 = 14.82` ✓
- *Time:* leg 1 `648s` + stop dwell `249s` + leg 2 `458s` `= 1355s` = `duration_seconds` ✓.
  Note `idle_seconds: 210` is **not** part of that sum — it's the in-leg idling
  *contained within* the 648 + 458 s of moving-leg time, a subset, not an
  additional term. Total stationary time for this trip is therefore
  `210` (in-leg) `+ 249` (stop dwell) `= 459s`, and `idle_seconds < dwell_seconds`
  is expected, not a contradiction.

**Idempotency:** the RPC upserts on `client_trip_id`
(`on conflict do update`). Re-posting the same trip — retries, double
uploads, out-of-order batches — updates the same row and **replaces** its
route points, legs, and stops wholesale; duplicates are impossible. The whole
call is one transaction: a failed upload can be retried blindly. Success
returns the trip's server UUID (JSON string).

Fields the device must **not** send: `id`, `l_per_100km`, `fuel_price_id`,
`cost_aed` (trips + legs), `idle_cost_aed` (stops), `uploaded_at` — all
server-computed. Leg/stop costs are stamped by the same trigger that prices
trips, against the fuel price on the trip's Dubai-local date, so a leg is
always costed at the same rate as its parent trip.

## Ingestion contract — refuel events (device → Supabase)

The device continuously samples the OBD fuel-level PID (a tank-fill %). A
refuel is detected on-device as the level **rising** (driving only lowers it).
Each detected refuel is POSTed **once** to the `ingest_refuel` RPC:

```
POST {SUPABASE_URL}/rest/v1/rpc/ingest_refuel
apikey: {SUPABASE_SECRET_KEY}
Authorization: Bearer {SUPABASE_SECRET_KEY}
Content-Type: application/json
```

```json
{
  "payload": {
    "client_refuel_id": "koleos-rf-20260709-1930",
    "car_id": 1,
    "detected_at": "2026-07-09T19:30:00+04:00",
    "lat": 25.1105,
    "lon": 55.1985,
    "level_before_pct": 22.0,
    "level_after_pct": 88.0
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `client_refuel_id` | yes | Device-generated, globally unique. **The idempotency key.** |
| `car_id` | yes* | *Or send `device_id`; the RPC resolves the car from `cars.device_id`. |
| `detected_at` | yes | ISO-8601 with offset. Cost is priced against this instant's Dubai-local date. |
| `level_before_pct`, `level_after_pct` | recommended | Tank-fill % before/after. The DB derives litres: `(after − before)/100 × cars.tank_capacity_liters`. |
| `liters_added_est` | optional | Send only if the device computes litres itself; it then **overrides** the %-based derivation. Otherwise omit and let the DB derive it. |
| `lat`, `lon` | optional | Pump location; shown as a pin/link on the dashboard. |

**Litres are an estimate — treat them as coarse, not precise.** The tank-level
PID (typically `0x2F`) is usually reported in **chunky 5–10% steps**, is
**slosh-damped and lagged** by the ECU (the % keeps settling for seconds after
you stop fuelling), and the sender is **non-linear near full/empty**. So a
"22% → 88%" reading turning into ~40 L inherits all of that quantization: the
litre figure is good to roughly a few litres, not to the decimal. This is a
"set expectations" caveat, not a defect — the tank-to-tank cross-check exists
precisely to *quantify* this drift against real distance driven. Don't build
anything that assumes refuel litres are exact.

**Idempotency:** upserts on `client_refuel_id`, so retries update the same row
instead of duplicating.

Fields the device must **not** send: `id`, `fuel_price_id`, `cost_est_aed`,
`created_at` — all server-computed. `cost_est_aed = liters_added_est ×
price_per_liter` on the refuel's Dubai-local date, via a trigger mirroring the
trip-cost logic. `tank_capacity_liters` lives on `cars` (seeded 60.0 for the
Koleos — **verify against the owner's manual**; it scales every refuel).

## Dashboard

- **/** — summary cards (trips, distance, fuel, cost, weighted avg L/100km)
  for a selected period, plus cost/distance-over-time bars (day/week/month
  toggle) and a per-trip consumption trend.
- **/trips** — sortable table (click headers), date-range filter, links to
  detail.
- **/trips/[id]** — full per-trip breakdown, the fuel price it was costed
  at, the GPS route on an OpenStreetMap/Leaflet map (with stops marked), and
  a **legs & stops** panel: per-leg cost/consumption, idle waste at each stop,
  and a driving-vs-idle fuel split.
- **/refuels** — pump-spend cards (total spent, litres, avg per fill),
  a cumulative-spend chart (real money at the pump, distinct from the
  estimated per-trip cost), a **tank-to-tank cross-check** comparing
  real-world consumption between fills against the integrated per-trip
  estimate (flagging large drift), and the refuel log (date, tank level
  before→after, litres, cost, location). Refuels also appear as pins on the
  trip map when they fall within a trip's window.
- **/reports** — monthly rollup (from the `monthly_summary` view) and
  most/least efficient trips (≥ 2 km, to keep cold-start hops out of the
  ranking).

All dates group and display in Asia/Dubai.

## Extending later

- **Second car**: `insert into cars ...` with its `device_id` — everything is
  `car_id`-keyed already; add a car filter to the dashboard when it matters.
- **PostGIS** for spatial queries (heatmaps, "trips near X") — swap the
  plain lat/lon columns for `geography` then.
- **Driver attribution** — add a `drivers` table + `trips.driver_id`.
- **Tighter device auth** — today ingestion uses the secret key from the
  phone bridge; move to an Edge Function validating a per-device token if
  the device ever talks to the internet directly.
