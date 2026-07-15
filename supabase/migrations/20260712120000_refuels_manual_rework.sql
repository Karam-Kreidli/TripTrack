-- Refuels reworked: MANUAL entry keyed on AMOUNT PAID, explicitly incomplete.
--
-- A 45-minute real-world OBD survey of the Koleos (ESP32 + ELM327, 14,890
-- samples) proved PID 0x2F (fuel tank level) is NOT supported on this car —
-- zero responses, and blank in Car Scanner under the Renault profile. Automatic
-- refuel detection by watching the tank level rise is therefore impossible.
-- This is closed, not a TODO.
--
-- New model: the user enters AED paid; the DB derives litres exactly, because
-- UAE 95 Special is government-set monthly and uniform nationwide, and
-- fuel_prices already stores it by effective date:
--     liters_added = amount_paid_aed / price_per_liter (on the Dubai-local date)
-- This is an exact conversion, not an estimate (unlike the % method it replaces).
--
-- Multiple people drive this car and won't reliably log fills, so the data is
-- PERMANENTLY INCOMPLETE. The reshape below carries the fields the gap-detection
-- (see getTankWindows) needs to refuse a number it can't stand behind.
--
-- refuels holds no real data yet, so a clean drop/recreate is the sanctioned
-- destructive change (per the rework spec). No other table is dropped.

drop trigger if exists trg_refuels_compute_cost on public.refuels;
drop trigger if exists trg_fuel_prices_recompute_refuels on public.fuel_prices;
drop function if exists public.refuels_compute_cost();
drop function if exists public.fuel_prices_recompute_refuels();
drop function if exists public.ingest_refuel(jsonb);
drop table if exists public.refuels;

create table public.refuels (
  id               bigint generated always as identity primary key,
  client_refuel_id text not null unique,          -- idempotency key; a generated uuid for manual entries
  car_id           bigint not null references public.cars(id),
  refueled_at      timestamptz not null,          -- when the fill happened (was: detected_at)
  entered_at       timestamptz not null default now(),
  amount_paid_aed  numeric(8,2) not null,         -- PRIMARY INPUT: what was actually paid at the pump
  -- Trigger-derived from amount_paid_aed / price_per_liter. If the user happens
  -- to have the exact pump litres, they send liters_added_override and it wins;
  -- otherwise the trigger computes liters_added and leaves override null.
  liters_added_override numeric(7,3),
  liters_added     numeric(7,3),                  -- derived (or the override, copied in by the trigger)
  odometer_km      numeric(9,1),                  -- optional; sharpens tank-to-tank interval distance
  is_full_tank     boolean not null default true, -- tank-to-tank math is only valid between two full fills
  fuel_price_id    bigint references public.fuel_prices(id),
  lat              double precision,              -- optional: the station
  lon              double precision,
  created_at       timestamptz not null default now()
);

create index on public.refuels (car_id);
create index on public.refuels (fuel_price_id);
create index on public.refuels (refueled_at);

alter table public.refuels enable row level security;
create policy "public read refuels" on public.refuels
  for select to anon, authenticated using (true);

-- tank_capacity_liters no longer converts % → litres (0x2F is gone). It now
-- bounds a CORRECTNESS check: if MAF-estimated burn between two full fills
-- exceeds the tank, a refuel was missed. Its accuracy still matters.
comment on column public.cars.tank_capacity_liters is
  'Usable fuel tank capacity (litres). No longer used to convert tank-% to '
  'litres (PID 0x2F unsupported). Now bounds the missed-refuel check: estimated '
  'burn between two full fills cannot exceed this. Verify vs. the owner''s manual.';

-- Derive litres from amount paid at the government-set price on the refuel's
-- Dubai-local date. Exact (national fixed price), not an estimate. An optional
-- user override wins. If no price row exists for that date yet, leave null and
-- backfill via the fuel_prices cascade below.
create or replace function public.refuels_derive_liters()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_price public.fuel_prices;
begin
  v_price := public.fuel_price_for(
    '95_special',
    (new.refueled_at at time zone 'Asia/Dubai')::date
  );

  if new.liters_added_override is not null then
    -- User supplied exact pump litres: trust it, still stamp the price row.
    new.liters_added := new.liters_added_override;
    new.fuel_price_id := v_price.id;  -- may be null; that's fine
  elsif v_price.id is not null and v_price.price_per_liter > 0 then
    new.fuel_price_id := v_price.id;
    new.liters_added := round(new.amount_paid_aed / v_price.price_per_liter, 3);
  else
    -- No price on record for that date yet; backfilled by the cascade.
    new.fuel_price_id := null;
    new.liters_added := null;
  end if;

  return new;
end;
$$;

create trigger trg_refuels_derive_liters
before insert or update of refueled_at, amount_paid_aed, liters_added_override, car_id
on public.refuels
for each row
execute function public.refuels_derive_liters();

-- Late-price cascade: when a month's price is added/corrected, recompute
-- liters_added for refuels in its window that don't have a user override.
create or replace function public.fuel_prices_recompute_refuels()
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

  update public.refuels r
  set fuel_price_id = new.id,
      liters_added = case
        when r.liters_added_override is not null then r.liters_added_override
        when new.price_per_liter > 0 then round(r.amount_paid_aed / new.price_per_liter, 3)
        else null end
  from public.cars c
  where c.id = r.car_id
    and c.fuel_type = new.fuel_type
    and (r.refueled_at at time zone 'Asia/Dubai')::date >= new.effective_from
    and (v_until is null
         or (r.refueled_at at time zone 'Asia/Dubai')::date < v_until);

  return null;
end;
$$;

create trigger trg_fuel_prices_recompute_refuels
after insert or update of price_per_liter, effective_from, fuel_type
on public.fuel_prices
for each row
execute function public.fuel_prices_recompute_refuels();

-- ingest_refuel: kept as the single idempotent write core (server action calls
-- it with the secret key; mirrors ingest_trip/add_car). Repointed to the new
-- shape. Cost is amount_paid_aed itself; litres are trigger-derived.
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
  if coalesce(payload->>'amount_paid_aed', '') = '' then
    raise exception 'ingest_refuel: payload.amount_paid_aed is required';
  end if;

  if payload ? 'car_id' then
    v_car_id := (payload->>'car_id')::bigint;
  else
    select id into v_car_id from public.cars where device_id = payload->>'device_id';
  end if;
  if v_car_id is null then
    raise exception 'ingest_refuel: could not resolve car (car_id: %, device_id: %)',
      payload->>'car_id', payload->>'device_id';
  end if;

  insert into public.refuels (
    client_refuel_id, car_id, refueled_at, amount_paid_aed,
    liters_added_override, odometer_km, is_full_tank, lat, lon
  )
  values (
    payload->>'client_refuel_id', v_car_id,
    (payload->>'refueled_at')::timestamptz,
    (payload->>'amount_paid_aed')::numeric,
    nullif(payload->>'liters_added_override', '')::numeric,
    nullif(payload->>'odometer_km', '')::numeric,
    coalesce((payload->>'is_full_tank')::boolean, true),
    nullif(payload->>'lat', '')::double precision,
    nullif(payload->>'lon', '')::double precision
  )
  on conflict (client_refuel_id) do update set
    car_id                = excluded.car_id,
    refueled_at           = excluded.refueled_at,
    amount_paid_aed       = excluded.amount_paid_aed,
    liters_added_override = excluded.liters_added_override,
    odometer_km           = excluded.odometer_km,
    is_full_tank          = excluded.is_full_tank,
    lat                   = excluded.lat,
    lon                   = excluded.lon
  returning id into v_refuel_id;

  return v_refuel_id;
end;
$$;

revoke execute on function public.ingest_refuel(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_refuel(jsonb) to service_role;

-- GPS probable-refuel detection (implemented now, activates when GPS lands).
-- A short engine-running stop at a petrol station is almost certainly a fill.
alter table public.trip_stops add column if not exists probable_refuel boolean;
comment on column public.trip_stops.probable_refuel is
  'True when this stop looks like a fill-up (short engine-on dwell at a fuel '
  'station). Used to detect unlogged refuels that would silently corrupt the '
  'tank-to-tank check. Populated once GPS + fuel_stations matching lands.';

create table if not exists public.fuel_stations (
  id   bigint generated always as identity primary key,
  name text not null,
  lat  double precision not null,
  lon  double precision not null
);
alter table public.fuel_stations enable row level security;
create policy "public read fuel_stations" on public.fuel_stations
  for select to anon, authenticated using (true);
