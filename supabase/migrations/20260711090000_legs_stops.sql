-- Trip legs & stops: decompose one ignition session (A->B->C without engine
-- off) into moving legs and stationary dwells, so cost is known per leg and
-- idle waste at each stop is costed too.
--
-- Accounting identity the data must satisfy:
--   trip.fuel_used_liters = Σ leg.fuel_used_liters + Σ stop.idle_fuel_liters
--   trip.cost_aed         = Σ leg.cost_aed         + Σ stop.idle_cost_aed
--
-- (Tables trip_legs / trip_stops already exist; this migration adds the RLS,
-- cost triggers, and extends ingest_trip. It is written idempotently so it can
-- run against the live DB where the tables were created ad hoc.)

-- Row-level security: read-only for the dashboard key, same as every other
-- table. Writes go through ingest_trip on the service-role key.
alter table public.trip_legs  enable row level security;
alter table public.trip_stops enable row level security;

drop policy if exists "public read trip_legs"  on public.trip_legs;
drop policy if exists "public read trip_stops" on public.trip_stops;
create policy "public read trip_legs"  on public.trip_legs  for select to anon, authenticated using (true);
create policy "public read trip_stops" on public.trip_stops for select to anon, authenticated using (true);

-- Price lookup for a child row: uses the parent trip's Dubai-local start date
-- and the car's fuel type, mirroring trips_compute_cost so a leg/stop is
-- always costed at the same price as its trip.
create or replace function public.price_for_trip(p_trip_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select fp.price_per_liter
  from public.trips t
  join public.cars c on c.id = t.car_id
  cross join lateral public.fuel_price_for(
    c.fuel_type,
    (t.started_at at time zone 'Asia/Dubai')::date
  ) fp
  where t.id = p_trip_id
    and fp.id is not null;
$$;

-- Leg cost trigger: cost_aed = fuel_used_liters * price-on-trip-date.
create or replace function public.trip_legs_compute_cost()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_price numeric;
begin
  v_price := public.price_for_trip(new.trip_id);
  new.cost_aed := case when v_price is not null
                       then round(new.fuel_used_liters * v_price, 2)
                       else null end;
  return new;
end;
$$;

drop trigger if exists trg_trip_legs_compute_cost on public.trip_legs;
create trigger trg_trip_legs_compute_cost
before insert or update of fuel_used_liters, trip_id
on public.trip_legs
for each row
execute function public.trip_legs_compute_cost();

-- Stop cost trigger: idle_cost_aed = idle_fuel_liters * price-on-trip-date.
create or replace function public.trip_stops_compute_cost()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_price numeric;
begin
  v_price := public.price_for_trip(new.trip_id);
  new.idle_cost_aed := case when v_price is not null and new.idle_fuel_liters is not null
                            then round(new.idle_fuel_liters * v_price, 2)
                            else null end;
  return new;
end;
$$;

drop trigger if exists trg_trip_stops_compute_cost on public.trip_stops;
create trigger trg_trip_stops_compute_cost
before insert or update of idle_fuel_liters, trip_id
on public.trip_stops
for each row
execute function public.trip_stops_compute_cost();

-- When a fuel price arrives/changes late, trips already recompute; extend that
-- to legs and stops so their costs stay in lockstep with the trip.
create or replace function public.fuel_prices_recompute_children()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.trip_legs l
  set cost_aed = round(l.fuel_used_liters * new.price_per_liter, 2)
  from public.trips t
  join public.cars c on c.id = t.car_id
  where l.trip_id = t.id
    and c.fuel_type = new.fuel_type
    and (t.started_at at time zone 'Asia/Dubai')::date >= new.effective_from
    and (t.started_at at time zone 'Asia/Dubai')::date < coalesce(
      (select min(fp.effective_from) from public.fuel_prices fp
       where fp.fuel_type = new.fuel_type and fp.effective_from > new.effective_from),
      'infinity'::date);

  update public.trip_stops s
  set idle_cost_aed = round(s.idle_fuel_liters * new.price_per_liter, 2)
  from public.trips t
  join public.cars c on c.id = t.car_id
  where s.trip_id = t.id
    and s.idle_fuel_liters is not null
    and c.fuel_type = new.fuel_type
    and (t.started_at at time zone 'Asia/Dubai')::date >= new.effective_from
    and (t.started_at at time zone 'Asia/Dubai')::date < coalesce(
      (select min(fp.effective_from) from public.fuel_prices fp
       where fp.fuel_type = new.fuel_type and fp.effective_from > new.effective_from),
      'infinity'::date);

  return null;
end;
$$;

drop trigger if exists trg_fuel_prices_recompute_children on public.fuel_prices;
create trigger trg_fuel_prices_recompute_children
after insert or update of price_per_liter, effective_from, fuel_type
on public.fuel_prices
for each row
execute function public.fuel_prices_recompute_children();

-- Extend ingest_trip: same idempotent trip upsert + route_points, now also
-- replacing legs[] and stops[] wholesale (a retry can't duplicate them).
-- Cost columns are omitted from the insert on purpose — the triggers stamp them.
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
    select id into v_car_id
    from public.cars
    where device_id = payload->>'device_id';
  end if;

  if v_car_id is null then
    raise exception 'ingest_trip: could not resolve car (car_id: %, device_id: %)',
      payload->>'car_id', payload->>'device_id';
  end if;

  insert into public.trips (
    client_trip_id, car_id,
    started_at, ended_at, duration_seconds,
    distance_km, fuel_used_liters, idle_seconds,
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
    (payload->>'idle_seconds')::integer,
    (payload->>'avg_speed_kmh')::numeric,
    (payload->>'max_speed_kmh')::numeric,
    (payload->>'start_lat')::double precision,
    (payload->>'start_lon')::double precision,
    (payload->>'end_lat')::double precision,
    (payload->>'end_lon')::double precision,
    payload->'notes'
  )
  on conflict (client_trip_id) do update set
    car_id           = excluded.car_id,
    started_at       = excluded.started_at,
    ended_at         = excluded.ended_at,
    duration_seconds = excluded.duration_seconds,
    distance_km      = excluded.distance_km,
    fuel_used_liters = excluded.fuel_used_liters,
    idle_seconds     = excluded.idle_seconds,
    avg_speed_kmh    = excluded.avg_speed_kmh,
    max_speed_kmh    = excluded.max_speed_kmh,
    start_lat        = excluded.start_lat,
    start_lon        = excluded.start_lon,
    end_lat          = excluded.end_lat,
    end_lon          = excluded.end_lon,
    notes            = excluded.notes,
    uploaded_at      = now()
  returning id into v_trip_id;

  -- Replace children wholesale so retries stay idempotent.
  delete from public.route_points where trip_id = v_trip_id;
  delete from public.trip_legs     where trip_id = v_trip_id;
  delete from public.trip_stops    where trip_id = v_trip_id;

  insert into public.route_points (trip_id, seq, recorded_at, lat, lon, speed_kmh)
  select
    v_trip_id,
    (p->>'seq')::integer,
    (p->>'recorded_at')::timestamptz,
    (p->>'lat')::double precision,
    (p->>'lon')::double precision,
    (p->>'speed_kmh')::numeric
  from jsonb_array_elements(coalesce(payload->'route_points', '[]'::jsonb)) p;

  insert into public.trip_legs (
    trip_id, seq, start_lat, start_lon, end_lat, end_lon,
    started_at, ended_at, distance_km, fuel_used_liters, avg_speed_kmh
  )
  select
    v_trip_id,
    (l->>'seq')::integer,
    (l->>'start_lat')::double precision,
    (l->>'start_lon')::double precision,
    (l->>'end_lat')::double precision,
    (l->>'end_lon')::double precision,
    (l->>'started_at')::timestamptz,
    (l->>'ended_at')::timestamptz,
    (l->>'distance_km')::numeric,
    (l->>'fuel_used_liters')::numeric,
    (l->>'avg_speed_kmh')::numeric
  from jsonb_array_elements(coalesce(payload->'legs', '[]'::jsonb)) l;

  insert into public.trip_stops (
    trip_id, seq, lat, lon, arrived_at, departed_at, dwell_seconds, idle_fuel_liters
  )
  select
    v_trip_id,
    (s->>'seq')::integer,
    (s->>'lat')::double precision,
    (s->>'lon')::double precision,
    (s->>'arrived_at')::timestamptz,
    (s->>'departed_at')::timestamptz,
    (s->>'dwell_seconds')::integer,
    (s->>'idle_fuel_liters')::numeric
  from jsonb_array_elements(coalesce(payload->'stops', '[]'::jsonb)) s;

  return v_trip_id;
end;
$$;

revoke execute on function public.ingest_trip(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_trip(jsonb) to service_role;
