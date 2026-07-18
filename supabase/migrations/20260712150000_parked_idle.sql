-- Parked idle: fuel burned sitting stationary with the engine running past a
-- 5-minute threshold — real money going nowhere. The firmware now subtracts
-- this out of fuel_used_liters (which is already DFCO-corrected) and reports it
-- separately, so trips.distance_km / fuel_used_liters describe DRIVING ONLY and
-- L/100km reflects driving, not parking.
--
-- Real example: a 69-min session spent 38 min parked-idling, burning 1.05 L
-- (AED 3.44) — 26% of its fuel — reading 13.8 L/100km instead of the true
-- ~10.2 for the actual driving.
--
-- Additive only: three new trips columns + one derived cost, priced by the
-- SAME trigger and date logic as cost_aed (no separate pricing path). No other
-- table is touched structurally.

alter table public.trips
  add column if not exists parked_idle_seconds     integer default 0,
  add column if not exists parked_idle_fuel_liters numeric(7,3),
  add column if not exists fuel_used_liters_raw    numeric(7,3),
  add column if not exists parked_idle_cost_aed    numeric(8,2);

comment on column public.trips.fuel_used_liters is
  'DFCO-corrected, parked-idle-excluded DRIVING fuel total. Primary/authoritative '
  'number; distance_km + this give driving L/100km. MAF-derived estimate.';
comment on column public.trips.fuel_used_liters_raw is
  'Uncorrected fuel total (pre-DFCO), for comparison only. Diagnostic, not primary.';
comment on column public.trips.parked_idle_seconds is
  'Total time stationary with the engine running past the 5-min parked-idle '
  'threshold. Distinct from in_leg_idle_seconds (short halts at lights).';
comment on column public.trips.parked_idle_fuel_liters is
  'Fuel burned during parked-idle periods — real money spent going nowhere. '
  'Already excluded from fuel_used_liters. MAF-derived estimate.';

-- Extend the trip-cost trigger to also price parked-idle fuel, against the same
-- 95-Special price on the trip's Dubai-local date. Same trigger, so it stays
-- consistent and date-correct — no separate pricing path.
create or replace function public.trips_compute_cost()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fuel_type text;
  v_price     public.fuel_prices;
begin
  select fuel_type into v_fuel_type
  from public.cars
  where id = new.car_id;

  v_price := public.fuel_price_for(
    v_fuel_type,
    (new.started_at at time zone 'Asia/Dubai')::date
  );

  if v_price.id is not null then
    new.fuel_price_id := v_price.id;
    new.cost_aed := round(new.fuel_used_liters * v_price.price_per_liter, 2);
    new.parked_idle_cost_aed := case
      when new.parked_idle_fuel_liters is not null
      then round(new.parked_idle_fuel_liters * v_price.price_per_liter, 2)
      else null end;
  else
    -- No price on record for that date; backfilled by the cascade below.
    new.fuel_price_id := null;
    new.cost_aed := null;
    new.parked_idle_cost_aed := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_trips_compute_cost on public.trips;
create trigger trg_trips_compute_cost
before insert or update of started_at, fuel_used_liters, parked_idle_fuel_liters, car_id
on public.trips
for each row
execute function public.trips_compute_cost();

-- Extend the late-price cascade to also recompute parked_idle_cost_aed.
create or replace function public.fuel_prices_recompute_trips()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_until date;
begin
  select min(fp.effective_from) into v_until
  from public.fuel_prices fp
  where fp.fuel_type = new.fuel_type
    and fp.effective_from > new.effective_from;

  update public.trips t
  set fuel_price_id = new.id,
      cost_aed = round(t.fuel_used_liters * new.price_per_liter, 2),
      parked_idle_cost_aed = case
        when t.parked_idle_fuel_liters is not null
        then round(t.parked_idle_fuel_liters * new.price_per_liter, 2)
        else null end
  from public.cars c
  where c.id = t.car_id
    and c.fuel_type = new.fuel_type
    and (t.started_at at time zone 'Asia/Dubai')::date >= new.effective_from
    and (v_until is null
         or (t.started_at at time zone 'Asia/Dubai')::date < v_until);

  return null;
end;
$$;

-- Recreate ingest_trip to accept & store the three new fields. Optional and
-- backward-compatible: older payloads without them still insert (missing
-- parked_idle_seconds -> 0, the litre fields -> null). Idempotent upsert on
-- client_trip_id unchanged. parked_idle_cost_aed is trigger-computed, not sent.
create or replace function public.ingest_trip(payload jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_car_id  bigint;
begin
  if coalesce(payload->>'client_trip_id', '') = '' then
    raise exception 'ingest_trip: payload.client_trip_id is required';
  end if;

  if payload ? 'car_id' then
    v_car_id := (payload->>'car_id')::bigint;
  else
    select id into v_car_id from public.cars where device_id = payload->>'device_id';
  end if;

  if v_car_id is null then
    raise exception 'ingest_trip: could not resolve car (car_id: %, device_id: %)',
      payload->>'car_id', payload->>'device_id';
  end if;

  insert into public.trips (
    client_trip_id, car_id,
    started_at, ended_at, duration_seconds,
    distance_km, fuel_used_liters, in_leg_idle_seconds,
    parked_idle_seconds, parked_idle_fuel_liters, fuel_used_liters_raw,
    avg_speed_kmh, max_speed_kmh,
    start_lat, start_lon, end_lat, end_lon,
    notes
  )
  values (
    payload->>'client_trip_id', v_car_id,
    (payload->>'started_at')::timestamptz,
    (payload->>'ended_at')::timestamptz,
    (payload->>'duration_seconds')::integer,
    (payload->>'distance_km')::numeric,
    (payload->>'fuel_used_liters')::numeric,
    coalesce(payload->>'in_leg_idle_seconds', payload->>'idle_seconds')::integer,
    coalesce((payload->>'parked_idle_seconds')::integer, 0),
    nullif(payload->>'parked_idle_fuel_liters', '')::numeric,
    nullif(payload->>'fuel_used_liters_raw', '')::numeric,
    (payload->>'avg_speed_kmh')::numeric,
    (payload->>'max_speed_kmh')::numeric,
    (payload->>'start_lat')::double precision,
    (payload->>'start_lon')::double precision,
    (payload->>'end_lat')::double precision,
    (payload->>'end_lon')::double precision,
    payload->'notes'
  )
  on conflict (client_trip_id) do update set
    car_id                  = excluded.car_id,
    started_at              = excluded.started_at,
    ended_at                = excluded.ended_at,
    duration_seconds        = excluded.duration_seconds,
    distance_km             = excluded.distance_km,
    fuel_used_liters        = excluded.fuel_used_liters,
    in_leg_idle_seconds     = excluded.in_leg_idle_seconds,
    parked_idle_seconds     = excluded.parked_idle_seconds,
    parked_idle_fuel_liters = excluded.parked_idle_fuel_liters,
    fuel_used_liters_raw    = excluded.fuel_used_liters_raw,
    avg_speed_kmh           = excluded.avg_speed_kmh,
    max_speed_kmh           = excluded.max_speed_kmh,
    start_lat               = excluded.start_lat,
    start_lon               = excluded.start_lon,
    end_lat                 = excluded.end_lat,
    end_lon                 = excluded.end_lon,
    notes                   = excluded.notes,
    uploaded_at             = now()
  returning id into v_trip_id;

  delete from public.route_points where trip_id = v_trip_id;
  delete from public.trip_legs     where trip_id = v_trip_id;
  delete from public.trip_stops    where trip_id = v_trip_id;

  insert into public.route_points (trip_id, seq, recorded_at, lat, lon, speed_kmh)
  select v_trip_id, (p->>'seq')::integer, (p->>'recorded_at')::timestamptz,
         (p->>'lat')::double precision, (p->>'lon')::double precision,
         (p->>'speed_kmh')::numeric
  from jsonb_array_elements(coalesce(payload->'route_points', '[]'::jsonb)) p;

  insert into public.trip_legs (
    trip_id, seq, start_lat, start_lon, end_lat, end_lon,
    started_at, ended_at, distance_km, fuel_used_liters, avg_speed_kmh
  )
  select v_trip_id, (l->>'seq')::integer,
         (l->>'start_lat')::double precision, (l->>'start_lon')::double precision,
         (l->>'end_lat')::double precision, (l->>'end_lon')::double precision,
         (l->>'started_at')::timestamptz, (l->>'ended_at')::timestamptz,
         (l->>'distance_km')::numeric, (l->>'fuel_used_liters')::numeric,
         (l->>'avg_speed_kmh')::numeric
  from jsonb_array_elements(coalesce(payload->'legs', '[]'::jsonb)) l;

  insert into public.trip_stops (
    trip_id, seq, lat, lon, arrived_at, departed_at, dwell_seconds, idle_fuel_liters
  )
  select v_trip_id, (s->>'seq')::integer,
         (s->>'lat')::double precision, (s->>'lon')::double precision,
         (s->>'arrived_at')::timestamptz, (s->>'departed_at')::timestamptz,
         (s->>'dwell_seconds')::integer, (s->>'idle_fuel_liters')::numeric
  from jsonb_array_elements(coalesce(payload->'stops', '[]'::jsonb)) s;

  return v_trip_id;
end;
$$;

revoke execute on function public.ingest_trip(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_trip(jsonb) to service_role;
