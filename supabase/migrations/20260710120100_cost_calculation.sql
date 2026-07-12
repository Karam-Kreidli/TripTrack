-- Cost calculation: authoritative in the database.
--
-- Chosen approach: Postgres function + trigger (not an Edge Function).
-- A BEFORE trigger runs no matter how a trip row arrives (REST upsert,
-- retried upload, manual SQL, backfill), so cost_aed can never be stale or
-- bypassed, and there is no extra network hop. An Edge Function would only
-- compute cost for callers that remember to route through it.
--
-- Trip dates are evaluated in Asia/Dubai: prices change on the 1st of each
-- month *local* time, so a trip at 00:30 on Aug 1 (Dubai) must use August's
-- price even though it is still July 31 in UTC.

-- Latest price whose effective_from is on or before the given date.
create or replace function public.fuel_price_for(
  p_fuel_type text,
  p_on_date   date
)
returns public.fuel_prices
language sql
stable
set search_path = ''
as $$
  select fp.*
  from public.fuel_prices fp
  where fp.fuel_type = p_fuel_type
    and fp.effective_from <= p_on_date
  order by fp.effective_from desc
  limit 1;
$$;

-- Trigger: stamp fuel_price_id + cost_aed on every insert, and on any
-- update that could change the outcome.
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
  else
    -- No price on record for that date (trip older than earliest fuel_prices
    -- row). Left null; backfilling fuel_prices recomputes it automatically
    -- via the trigger below.
    new.fuel_price_id := null;
    new.cost_aed := null;
  end if;

  return new;
end;
$$;

create trigger trg_trips_compute_cost
before insert or update of started_at, fuel_used_liters, car_id
on public.trips
for each row
execute function public.trips_compute_cost();

-- Trigger: when a fuel price is added late or corrected, recompute every
-- trip whose (Dubai-local) date falls inside that price's effective window
-- [effective_from, next effective_from). Covers out-of-order arrivals in
-- the other direction: trips uploaded before their month's price existed.
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
      cost_aed = round(t.fuel_used_liters * new.price_per_liter, 2)
  from public.cars c
  where c.id = t.car_id
    and c.fuel_type = new.fuel_type
    and (t.started_at at time zone 'Asia/Dubai')::date >= new.effective_from
    and (v_until is null
         or (t.started_at at time zone 'Asia/Dubai')::date < v_until);

  return null;
end;
$$;

create trigger trg_fuel_prices_recompute_trips
after insert or update of price_per_liter, effective_from, fuel_type
on public.fuel_prices
for each row
execute function public.fuel_prices_recompute_trips();
