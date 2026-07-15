-- Rename trips.idle_seconds -> trips.in_leg_idle_seconds.
--
-- "idle" was ambiguous and the README example even contradicted itself
-- (idle_seconds 210 < a single stop's dwell 249). The field is IN-LEG idle
-- only: engine-on-but-stationary time within the moving legs (traffic lights,
-- brief halts below the stop threshold), EXCLUDING flagged-stop dwell. The new
-- name says so. Total stationary time = in_leg_idle_seconds + Σ dwell_seconds.
--
-- Additive/corrective: a column rename (data preserved). The monthly-summary
-- view binds to the column and follows the rename automatically; ingest_trip's
-- body references the name literally, so it's recreated below (and now accepts
-- both the new key and the legacy idle_seconds key for payload compatibility).

alter table public.trips rename column idle_seconds to in_leg_idle_seconds;

comment on column public.trips.in_leg_idle_seconds is
  'In-leg idle only: engine-on-but-stationary time within the moving legs '
  '(traffic lights, brief halts below the stop threshold). Excludes flagged-'
  'stop dwell (trip_stops.dwell_seconds). Total stationary time = '
  'in_leg_idle_seconds + sum(trip_stops.dwell_seconds).';

-- Recreate ingest_trip writing the renamed column. Accepts payload key
-- 'in_leg_idle_seconds' (preferred) or legacy 'idle_seconds'.
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
    (payload->>'avg_speed_kmh')::numeric,
    (payload->>'max_speed_kmh')::numeric,
    (payload->>'start_lat')::double precision,
    (payload->>'start_lon')::double precision,
    (payload->>'end_lat')::double precision,
    (payload->>'end_lon')::double precision,
    payload->'notes'
  )
  on conflict (client_trip_id) do update set
    car_id              = excluded.car_id,
    started_at          = excluded.started_at,
    ended_at            = excluded.ended_at,
    duration_seconds    = excluded.duration_seconds,
    distance_km         = excluded.distance_km,
    fuel_used_liters    = excluded.fuel_used_liters,
    in_leg_idle_seconds = excluded.in_leg_idle_seconds,
    avg_speed_kmh       = excluded.avg_speed_kmh,
    max_speed_kmh       = excluded.max_speed_kmh,
    start_lat           = excluded.start_lat,
    start_lon           = excluded.start_lon,
    end_lat             = excluded.end_lat,
    end_lon             = excluded.end_lon,
    notes               = excluded.notes,
    uploaded_at         = now()
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
