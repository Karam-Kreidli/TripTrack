-- Ingestion RPC, row-level security, and reporting views.

-- ingest_trip: single atomic, idempotent entry point for the device bridge.
-- POST /rest/v1/rpc/ingest_trip with {"payload": {...}} (see README).
--
-- Idempotency: upsert on trips.client_trip_id — re-posting the same trip
-- updates the existing row instead of duplicating it, and route points are
-- replaced wholesale so a retry can never double-append breadcrumbs.
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

  -- The device may send car_id directly, or its device_id for lookup.
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

  delete from public.route_points where trip_id = v_trip_id;

  insert into public.route_points (trip_id, seq, recorded_at, lat, lon, speed_kmh)
  select
    v_trip_id,
    (p->>'seq')::integer,
    (p->>'recorded_at')::timestamptz,
    (p->>'lat')::double precision,
    (p->>'lon')::double precision,
    (p->>'speed_kmh')::numeric
  from jsonb_array_elements(coalesce(payload->'route_points', '[]'::jsonb)) p;

  return v_trip_id;
end;
$$;

-- Only the secret (service role) key may ingest; the dashboard's
-- publishable key is read-only.
revoke execute on function public.ingest_trip(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_trip(jsonb) to service_role;

-- Row-level security: dashboard (anon/publishable key) can read everything,
-- writes only through the service-role key (bypasses RLS). Extend later with
-- per-user policies if this ever becomes multi-user.
alter table public.cars enable row level security;
alter table public.fuel_prices enable row level security;
alter table public.trips enable row level security;
alter table public.route_points enable row level security;

create policy "public read cars"         on public.cars         for select to anon, authenticated using (true);
create policy "public read fuel_prices"  on public.fuel_prices  for select to anon, authenticated using (true);
create policy "public read trips"        on public.trips        for select to anon, authenticated using (true);
create policy "public read route_points" on public.route_points for select to anon, authenticated using (true);

-- Monthly rollup for the reports page. Months are Dubai-local calendar
-- months to match how fuel prices roll over.
create view public.monthly_summary
with (security_invoker = true) as
select
  t.car_id,
  (date_trunc('month', t.started_at at time zone 'Asia/Dubai'))::date as month,
  count(*)::integer                                as trip_count,
  sum(t.distance_km)                               as total_distance_km,
  sum(t.fuel_used_liters)                          as total_fuel_liters,
  sum(t.cost_aed)                                  as total_cost_aed,
  sum(t.idle_seconds)                              as total_idle_seconds,
  case when sum(t.distance_km) > 0
    then round(sum(t.fuel_used_liters) / sum(t.distance_km) * 100, 2)
  end                                              as avg_l_per_100km
from public.trips t
group by t.car_id, (date_trunc('month', t.started_at at time zone 'Asia/Dubai'))::date;
