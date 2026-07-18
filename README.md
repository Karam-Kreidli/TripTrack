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

1. Create a Supabase project and apply the migrations in
   `supabase/migrations/` in order (via the SQL editor, `supabase db push`,
   or the Supabase MCP). They create the schema, seed the Koleos + the July
   2026 fuel price, install the cost triggers, RLS, the `ingest_trip` and
   `ingest_refuel` / `add_car` RPCs, the `monthly_summary` view, and the
   manual-refuel + gap-detection tables.
2. `cp .env.example .env.local` and fill in your project URL and publishable
   key (Dashboard → Settings → API). Nothing is hardcoded; the app fails with
   a clear message if these are missing.
3. `npm install && npm run dev` → http://localhost:3000

The dashboard's key is **read-only**: RLS only grants `select` to `anon`.
All writes go through `SECURITY DEFINER` RPCs (`ingest_trip`, `ingest_refuel`,
`add_car`) that only the secret (service-role) key may execute. The dashboard's
own writes (logging a refuel, adding a car) run through **Next.js server
actions** that hold the secret key **server-side** — it is never shipped to the
browser. Set `SUPABASE_SECRET_KEY` in `.env.local` to enable those; reads work
without it.

## What the car actually exposes (measured, not assumed)

A 45-minute real-world OBD survey of the actual car (Renault Koleos 2022,
petrol; ESP32 + ELM327; 14,890 samples, 0–120 km/h, 23.8 km, 81% moving)
established ground truth for what PIDs this vehicle supports. This settles
several things the schema previously assumed. **Do not re-litigate these — they
were measured.**

Supported mode-01 PIDs: `0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0C, 0x0D, 0x0E,
0x0F, 0x10, 0x11, 0x13, 0x15, 0x1C, 0x1F, 0x21, 0x24, 0x2E, 0x30, 0x31, 0x3C,
0x41, 0x42, 0x43, 0x44, 0x45, 0x47, 0x49, 0x4A, 0x4C, 0x4D, 0x4E, 0x51, 0xE0`.

| PID | Name | Status |
|---|---|---|
| `0x10` | MAF | ✅ supported (0.57–56.12 g/s) — **basis for fuel** |
| `0x0D` | Vehicle speed | ✅ supported (integer km/h) — basis for distance |
| `0x0C` | Engine RPM | ✅ supported |
| `0x44` | Commanded equivalence ratio (lambda) | ✅ supported — used in the fuel formula |
| `0x0F` | Intake air temp | ✅ supported |
| `0x04` | Engine load | ✅ supported |
| `0x51` | Fuel type | ✅ returns `01` = Gasoline (confirms petrol) |
| `0x5E` | Engine fuel rate | ❌ **NOT supported** — zero responses in 45 min |
| `0x2F` | Fuel tank level | ❌ **NOT supported** — zero responses in 45 min |
| `0x0B` | Intake MAP | ❌ not supported |
| `0x5C` | Engine oil temp | ❌ not supported |

**`fuel_used_liters` is MAF-derived, not a meter reading.** Because `0x5E`
(direct fuel rate) doesn't exist on this car, the firmware computes fuel rate
from MAF:

```
fuel_L_per_h = MAF_g_per_s / (14.7 × lambda) / 745 × 3600
```

- `14.7` = stoichiometric air-fuel ratio for petrol
- `745` g/L = petrol density
- `lambda` from PID `0x44`, defaulting to `1.0` when it reads 0

Integrated over the real 45-minute drive this produced 23.82 km, 2.834 L →
**11.90 L/100km** (AED 9.32 @ 3.29/L), with 1.87 L/h at idle — both realistic
for this vehicle, so the method is sound. But it is an **estimate**, and its
accuracy is quantified only by the tank-to-tank cross-check (see Refuels). The
one validation so far is this single plausibility check against a real drive.

**Distance source.** `0x0D` (vehicle speed) is supported but reports **integer
km/h**, so distance integrated from it drifts. It is the authoritative source
today; **GPS will be better once fitted**, and the two should be cross-checked
when GPS lands.

**Multi-ECU response quirk.** Several PIDs return the reply frame **twice**
(e.g. `410C0F6E410C0F6E`) because more than one ECU answers. Parsers must take
the **first** frame deliberately, not by accident.

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
    "in_leg_idle_seconds": 210,
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
| `duration_seconds`, `distance_km`, `fuel_used_liters` | yes | `l_per_100km` is derived in the database — don't send it. **`fuel_used_liters` is now DFCO-corrected and parked-idle-excluded — it describes _driving only_** (see parked-idle below), so `distance_km` + it give true driving L/100km. See the source note below — these are the two signals every headline number rests on. |
| `in_leg_idle_seconds` | no | **In-leg idle only** — engine-on-but-stationary time *within the moving legs* (traffic lights, brief halts below the stop threshold). It **excludes** flagged-stop dwell, which is carried separately by each stop's `dwell_seconds`. So total stationary time = `in_leg_idle_seconds` + Σ `stops.dwell_seconds`; consequently it can be (and usually is) **less** than any single stop's dwell. Don't conflate the two. (Renamed from the old ambiguous `idle_seconds`; the ingest RPC still accepts the legacy key.) |
| `parked_idle_seconds`, `parked_idle_fuel_liters` | no | **Parked idle** — time/fuel spent stationary with the engine running *past a 5-min threshold* (sitting in a spot, engine on), as opposed to short halts at lights (`in_leg_idle_seconds`). This fuel is **already subtracted out of `fuel_used_liters`** by the firmware, so it never inflates driving consumption. `parked_idle_cost_aed` is server-computed by the same trigger that prices the trip. Real example: a 69-min session parked-idled 38 min / 1.05 L (26% of its fuel), reading 13.8 vs. the true ~10.2 L/100km. |
| `fuel_used_liters_raw` | no | Uncorrected (pre-DFCO) fuel total, **diagnostic/comparison only** — stored but not primary. `fuel_used_liters` is authoritative. |
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

### Trip boundaries: the leg is the real unit

A **trip** is one ignition session (engine on → engine off). **In practice this
driver does not switch the engine off** between errands or while refuelling, so:

- A "trip" can span **many legs and a whole day** with a refuel in the middle.
  The **leg — not the trip — is the meaningful unit of analysis**, and the
  dashboard leans on legs accordingly.
- Because the device is powered from an **ignition-switched supply**, "engine
  off" == "power cut". The firmware therefore needs **hold-up capacitance** (or
  gap-reconstruction on next boot) to write `ended_at` and flush the final
  snapshot — otherwise every trip silently loses its tail. (Firmware concern,
  noted here so the backend expects possibly-missing trip tails.)

If you drive A→B→C without shutting the engine off, that's **one trip**,
decomposed into:

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
  Note `in_leg_idle_seconds: 210` is **not** part of that sum — it's the in-leg
  idling *contained within* the 648 + 458 s of moving-leg time, a subset, not an
  additional term. Total stationary time for this trip is therefore
  `210` (in-leg) `+ 249` (stop dwell) `= 459s`, and
  `in_leg_idle_seconds < dwell_seconds` is expected, not a contradiction.

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

## Refuels: manual and incomplete

**Automatic refuel detection is impossible on this car — this is closed, not a
TODO.** The old design watched PID `0x2F` (fuel tank level) rise. That PID is
**not supported by the Koleos**: zero responses across the 45-minute OBD survey,
and blank in Car Scanner with the Renault vehicle profile selected. Verified
twice.

So refuels are **entered manually**, and the primary input is **AED paid**, not
litres. UAE 95 Special is government-set monthly and uniform nationwide, and
`fuel_prices` already stores it by effective date, so litres are **derived
exactly** (not estimated, unlike everything MAF-based):

```
liters_added = amount_paid_aed / price_per_liter   (on the refuel's Dubai-local date)
```

Amount paid is also the *easier* thing to capture — people remember what they
paid, and it shows up on receipts and bank SMS.

### The data is permanently incomplete — and the system knows it

**Multiple people drive this car and will not reliably log fills.** The system
never assumes it has every refuel. A missed fill would make the tank-to-tank
cross-check **confidently wrong** rather than merely absent (litres at C ÷
distance A→C silently omits an unlogged fill B). Wrong-with-confidence is worse
than missing, so the design is defensive:

- **`is_full_tank`** — tank-to-tank math is only valid between two *full* fills.
- **Tank-capacity gap detection** — if MAF-estimated burn between two full fills
  exceeds `cars.tank_capacity_liters` (× 1.05), a fill was missed (the car can't
  burn more than a tankful between full fills). This needs zero cooperation.
- **GPS probable-refuel flags** — a short engine-on stop at a petrol station
  (`trip_stops.probable_refuel`, matched against `fuel_stations`) with no logged
  refuel inside an interval invalidates that interval. Activates when GPS lands.
- **Invalid intervals are excluded** from the cross-check and **surfaced**
  ("N intervals excluded — suspected unlogged refuel"), never averaged in.

**Logged refuel spend is a floor, not a total.** The dashboard labels it so.

### Entry shape

Written from the dashboard via a **server action** holding the secret key
server-side (the browser key stays read-only; RLS unchanged), which calls the
idempotent `ingest_refuel` RPC. Manual entries use a generated UUID as
`client_refuel_id`.

| Field | Required | Notes |
|---|---|---|
| `client_refuel_id` | yes | UUID; the idempotency key. |
| `car_id` | yes* | *Or `device_id`. |
| `refueled_at` | yes | When the fill happened (ISO-8601 with offset). Priced against its Dubai-local date. |
| `amount_paid_aed` | yes | **Primary input** — what was paid. Litres derived from it. |
| `is_full_tank` | default true | Only full-to-full intervals feed the cross-check. |
| `odometer_km` | optional | Sharpens interval distance when both endpoints have it. |
| `liters_added_override` | optional | Exact pump litres if known; **wins** over the derived value. |
| `lat`, `lon` | optional | The station; pinned on the trip map. |

Server-computed (don't send): `liters_added`, `fuel_price_id`, `entered_at`,
`created_at`. If no price exists for the date yet, `liters_added` is left null
and **backfilled** when the price is added (same late-price cascade as trips).

**Known caveat:** a pump transaction that includes non-fuel purchases (snacks,
car wash) inflates the derived litres. The capacity check catches gross cases;
otherwise treat derived litres as "at most this much fuel".

`tank_capacity_liters` on `cars` (seeded 60.0 — **verify against the owner's
manual**) no longer converts % to litres; it now bounds the missed-refuel check,
so its accuracy still matters.

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
