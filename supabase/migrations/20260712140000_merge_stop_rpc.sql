-- merge_stop: manual correction for a falsely-flagged stop.
--
-- If a dwell exceeded the stop threshold but wasn't a real stop (e.g. a long
-- traffic light, drive-through), the trip got split into two legs around it.
-- This removes stop seq k and MERGES leg k with leg k+1 into one continuous
-- leg, FOLDING the stop's idle fuel into the merged leg so the trip's totals
-- and the accounting identity are preserved:
--   trip.fuel = Σ leg.fuel + Σ stop.idle_fuel   (unchanged: idle fuel moves
--   from the stop into the leg, total constant)
--
-- Legs/stops only — the trips row (distance, fuel, cost) is untouched. Leg cost
-- re-prices automatically via trg_trip_legs_compute_cost on the fuel update.
--
-- Idempotency note: this is a corrective edit, not an upsert. Re-running
-- ingest_trip for the same client_trip_id would REPLACE legs/stops wholesale
-- and undo this merge — acceptable, since a re-upload means the device resent
-- authoritative data.

create or replace function public.merge_stop(p_trip_id uuid, p_stop_seq integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stop   public.trip_stops;
  v_leg_a  public.trip_legs;   -- the leg before the stop (seq = p_stop_seq)
  v_leg_b  public.trip_legs;   -- the leg after the stop  (seq = p_stop_seq + 1)
  v_new_distance numeric;
  v_new_fuel     numeric;
  v_new_seconds  numeric;
begin
  select * into v_stop
  from public.trip_stops
  where trip_id = p_trip_id and seq = p_stop_seq;
  if not found then
    raise exception 'merge_stop: no stop seq % on trip %', p_stop_seq, p_trip_id;
  end if;

  -- With the interleaving leg1,stop1,leg2,stop2..., stop k sits between leg k
  -- and leg k+1.
  select * into v_leg_a from public.trip_legs
  where trip_id = p_trip_id and seq = p_stop_seq;
  select * into v_leg_b from public.trip_legs
  where trip_id = p_trip_id and seq = p_stop_seq + 1;
  if v_leg_a.id is null or v_leg_b.id is null then
    raise exception 'merge_stop: stop seq % is not flanked by two legs on trip %',
      p_stop_seq, p_trip_id;
  end if;

  v_new_distance := v_leg_a.distance_km + v_leg_b.distance_km;
  -- Fold the stop's idle fuel into the drive: it wasn't waste after all.
  v_new_fuel := v_leg_a.fuel_used_liters + v_leg_b.fuel_used_liters
                + coalesce(v_stop.idle_fuel_liters, 0);
  v_new_seconds := extract(epoch from (v_leg_b.ended_at - v_leg_a.started_at));

  -- Extend leg A to swallow the stop + leg B. The cost trigger re-prices from
  -- the new fuel_used_liters.
  update public.trip_legs
  set end_lat          = v_leg_b.end_lat,
      end_lon          = v_leg_b.end_lon,
      ended_at         = v_leg_b.ended_at,
      distance_km      = v_new_distance,
      fuel_used_liters = v_new_fuel,
      avg_speed_kmh    = case when v_new_seconds > 0
                              then round((v_new_distance / (v_new_seconds / 3600.0))::numeric, 1)
                              else v_leg_a.avg_speed_kmh end
  where id = v_leg_a.id;

  delete from public.trip_legs  where id = v_leg_b.id;
  delete from public.trip_stops where id = v_stop.id;

  -- Resequence the survivors so seqs stay contiguous (legs 1..N, stops 1..N-1).
  update public.trip_legs  set seq = seq - 1
  where trip_id = p_trip_id and seq > p_stop_seq + 1;
  update public.trip_stops set seq = seq - 1
  where trip_id = p_trip_id and seq > p_stop_seq;
end;
$$;

revoke execute on function public.merge_stop(uuid, integer) from public, anon, authenticated;
grant execute on function public.merge_stop(uuid, integer) to service_role;
