-- Refuel cost + litres: authoritative in the DB, mirroring trips_compute_cost.
--
-- The existing trip-cost logic is a BEFORE trigger (not an Edge Function), so
-- cost can't be stale or bypassed regardless of how a row arrives. Refuels use
-- the same approach and the same fuel_price_for() helper + Asia/Dubai date, so
-- a refuel is priced exactly like a trip on the same day.

create or replace function public.refuels_compute_cost()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tank  numeric;
  v_price public.fuel_prices;
begin
  -- Derive litres from the fill-% delta when the device didn't send it.
  -- Fuel senders are non-linear near full/empty, so this is an estimate.
  if new.liters_added_est is null
     and new.level_before_pct is not null
     and new.level_after_pct is not null then
    select tank_capacity_liters into v_tank from public.cars where id = new.car_id;
    if v_tank is not null then
      new.liters_added_est :=
        round((new.level_after_pct - new.level_before_pct) / 100.0 * v_tank, 3);
    end if;
  end if;

  -- Price against 95 Special on the refuel's Dubai-local date.
  v_price := public.fuel_price_for(
    '95_special',
    (new.detected_at at time zone 'Asia/Dubai')::date
  );

  if v_price.id is not null and new.liters_added_est is not null then
    new.fuel_price_id := v_price.id;
    new.cost_est_aed := round(new.liters_added_est * v_price.price_per_liter, 2);
  else
    -- No price on record for that date, or litres unknown. Left null;
    -- backfilling fuel_prices recomputes it via the cascade below.
    new.fuel_price_id := null;
    new.cost_est_aed := null;
  end if;

  return new;
end;
$$;

create trigger trg_refuels_compute_cost
before insert or update of detected_at, level_before_pct, level_after_pct,
                           liters_added_est, car_id
on public.refuels
for each row
execute function public.refuels_compute_cost();

-- Extend the late-price cascade to refuels: when a month's price is added or
-- corrected, recompute refuels whose Dubai-local date falls in its window.
-- (Trips + legs/stops already recompute via their own cascade functions.)
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
      cost_est_aed = round(r.liters_added_est * new.price_per_liter, 2)
  from public.cars c
  where c.id = r.car_id
    and c.fuel_type = new.fuel_type
    and r.liters_added_est is not null
    and (r.detected_at at time zone 'Asia/Dubai')::date >= new.effective_from
    and (v_until is null
         or (r.detected_at at time zone 'Asia/Dubai')::date < v_until);

  return null;
end;
$$;

create trigger trg_fuel_prices_recompute_refuels
after insert or update of price_per_liter, effective_from, fuel_type
on public.fuel_prices
for each row
execute function public.fuel_prices_recompute_refuels();
