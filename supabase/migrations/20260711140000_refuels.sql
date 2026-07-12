-- Refuel detection: the device samples the OBD fuel-level PID (tank %). A
-- refuel is a rising fuel level (driving only lowers it). Refuels are events
-- on a car, not trips — their own table. Cost is real money at the pump,
-- kept distinct from the integrated per-trip fuel-rate estimate.
--
-- Additive only: alters cars (one column), adds one index to trips, creates
-- the refuels table. Cost/litres are authoritative in the DB (trigger), same
-- as trips.

-- Tank capacity, needed to convert a fill % delta into litres.
alter table public.cars add column if not exists tank_capacity_liters numeric(5,1);

-- Renault Koleos 2022 petrol tank ≈ 60 L. VERIFY against the owner's manual
-- and update if the real figure differs — it scales every refuel's litres/cost.
update public.cars set tank_capacity_liters = 60.0 where name = 'Koleos';

-- Covering index the Supabase linter flagged (FK trips.fuel_price_id).
create index if not exists idx_trips_fuel_price_id on public.trips (fuel_price_id);

-- Refuel events.
create table public.refuels (
  id                 bigint generated always as identity primary key,
  client_refuel_id   text not null unique,      -- generated on the device; makes uploads idempotent
  car_id             bigint not null references public.cars(id),
  detected_at        timestamptz not null,
  lat                double precision,
  lon                double precision,
  level_before_pct   numeric(5,2),
  level_after_pct    numeric(5,2),
  liters_added_est   numeric(7,3),              -- (after - before)/100 x tank_capacity_liters
  fuel_price_id      bigint references public.fuel_prices(id),
  cost_est_aed       numeric(8,2),
  created_at         timestamptz not null default now()
);

create index on public.refuels (car_id);
create index on public.refuels (fuel_price_id);
create index on public.refuels (detected_at);

-- RLS: read-only for the dashboard key, same as every other table. Writes go
-- through ingest_refuel on the service-role key.
alter table public.refuels enable row level security;
create policy "public read refuels" on public.refuels
  for select to anon, authenticated using (true);
