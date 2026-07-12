-- TripTrack initial schema
-- Cars, fuel prices, trips, and GPS route points.
-- Plain double precision lat/lon for now; swap to PostGIS geography if
-- spatial queries (e.g. "trips near X") are ever needed.

-- Cars: supports tracking more than one vehicle later.
create table public.cars (
  id           bigint generated always as identity primary key,
  name         text not null,
  make         text,
  model        text,
  year         integer,
  fuel_type    text not null default '95_special',
  device_id    text,
  created_at   timestamptz not null default now()
);

-- Fuel prices: 95 Special changes monthly; cost is calculated against
-- the price in effect on the trip's date.
create table public.fuel_prices (
  id              bigint generated always as identity primary key,
  fuel_type       text not null default '95_special',
  price_per_liter numeric(6,3) not null,
  effective_from  date not null,
  created_at      timestamptz not null default now(),
  unique (fuel_type, effective_from)
);

-- Trips: one row per completed ride.
create table public.trips (
  id               uuid primary key default gen_random_uuid(),
  client_trip_id   text not null unique,   -- generated on the device; makes uploads idempotent
  car_id           bigint not null references public.cars(id),

  started_at       timestamptz not null,
  ended_at         timestamptz not null,
  duration_seconds integer not null,

  distance_km      numeric(8,3) not null,
  fuel_used_liters numeric(7,3) not null,
  idle_seconds     integer,

  avg_speed_kmh    numeric(5,1),
  max_speed_kmh    numeric(5,1),

  start_lat        double precision,
  start_lon        double precision,
  end_lat          double precision,
  end_lon          double precision,

  l_per_100km      numeric(6,2) generated always as (
                     case when distance_km > 0
                       then (fuel_used_liters / distance_km) * 100
                       else null end
                   ) stored,

  fuel_price_id    bigint references public.fuel_prices(id),
  cost_aed         numeric(8,2),

  notes            jsonb,
  uploaded_at      timestamptz not null default now()
);

-- Route points: GPS breadcrumb trail per trip, for the map view.
create table public.route_points (
  id          bigint generated always as identity primary key,
  trip_id     uuid not null references public.trips(id) on delete cascade,
  seq         integer not null,
  recorded_at timestamptz not null,
  lat         double precision not null,
  lon         double precision not null,
  speed_kmh   numeric(5,1),
  unique (trip_id, seq)
);

create index on public.route_points (trip_id);
create index on public.trips (started_at);
create index on public.trips (car_id);

-- Seed data ---------------------------------------------------------------

insert into public.cars (name, make, model, year, fuel_type)
values ('Koleos', 'Renault', 'Koleos', 2022, '95_special');

-- UAE 95 Special: AED 3.29/L effective July 1 2026. Prices update on the
-- 1st of each month; insert a new row each month (backfill older months to
-- cost trips that arrive late for past months).
insert into public.fuel_prices (fuel_type, price_per_liter, effective_from)
values ('95_special', 3.290, '2026-07-01');
