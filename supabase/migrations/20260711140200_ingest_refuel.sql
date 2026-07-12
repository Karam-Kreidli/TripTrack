-- ingest_refuel: idempotent entry point for the device bridge, mirroring
-- ingest_trip. Upsert on client_refuel_id so a retried upload updates the same
-- row instead of duplicating. Cost/litres columns are omitted on purpose — the
-- refuels_compute_cost trigger stamps them.

create or replace function public.ingest_refuel(payload jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_refuel_id bigint;
  v_car_id    bigint;
begin
  if coalesce(payload->>'client_refuel_id', '') = '' then
    raise exception 'ingest_refuel: payload.client_refuel_id is required';
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
    raise exception 'ingest_refuel: could not resolve car (car_id: %, device_id: %)',
      payload->>'car_id', payload->>'device_id';
  end if;

  insert into public.refuels (
    client_refuel_id, car_id, detected_at,
    lat, lon, level_before_pct, level_after_pct, liters_added_est
  )
  values (
    payload->>'client_refuel_id', v_car_id,
    (payload->>'detected_at')::timestamptz,
    (payload->>'lat')::double precision,
    (payload->>'lon')::double precision,
    (payload->>'level_before_pct')::numeric,
    (payload->>'level_after_pct')::numeric,
    -- Optional: if the device sends litres directly, use it; else the trigger
    -- derives it from the before/after % and tank capacity.
    (payload->>'liters_added_est')::numeric
  )
  on conflict (client_refuel_id) do update set
    car_id           = excluded.car_id,
    detected_at      = excluded.detected_at,
    lat              = excluded.lat,
    lon              = excluded.lon,
    level_before_pct = excluded.level_before_pct,
    level_after_pct  = excluded.level_after_pct,
    liters_added_est = excluded.liters_added_est
  returning id into v_refuel_id;

  return v_refuel_id;
end;
$$;

-- Only the secret (service role) key may ingest; the dashboard key is read-only.
revoke execute on function public.ingest_refuel(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_refuel(jsonb) to service_role;
