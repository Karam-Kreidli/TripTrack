-- Per-car image shown in the dashboard car-picker.
alter table public.cars add column if not exists image_url text;

comment on column public.cars.image_url is
  'URL of a photo/illustration of the car, shown in the dashboard car picker.';

-- Privileged insert for the dashboard "add car" flow. Writes are otherwise
-- RLS-restricted to service_role (the publishable key is SELECT-only), so this
-- SECURITY DEFINER RPC is the single sanctioned write path from the app, mirror-
-- ing ingest_trip. Called by a server action using the secret key.
create or replace function public.add_car(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
  car_name text := nullif(trim(payload->>'name'), '');
begin
  if car_name is null then
    raise exception 'name is required';
  end if;

  insert into public.cars (
    name, make, model, year, fuel_type, device_id,
    tank_capacity_liters, image_url
  )
  values (
    car_name,
    nullif(trim(payload->>'make'), ''),
    nullif(trim(payload->>'model'), ''),
    (payload->>'year')::int,
    coalesce(nullif(trim(payload->>'fuel_type'), ''), '95_special'),
    nullif(trim(payload->>'device_id'), ''),
    (payload->>'tank_capacity_liters')::numeric,
    nullif(trim(payload->>'image_url'), '')
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.add_car(jsonb) from public, anon, authenticated;
grant execute on function public.add_car(jsonb) to service_role;
