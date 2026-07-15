-- Document the exact meaning of trips.idle_seconds so it isn't conflated with
-- stop dwell. It is IN-LEG idle only: engine-on-but-stationary time within the
-- moving legs (traffic lights, brief halts below the stop threshold). It
-- EXCLUDES flagged-stop dwell, which trip_stops.dwell_seconds carries. Hence
-- total stationary time = idle_seconds + Σ trip_stops.dwell_seconds, and
-- idle_seconds < any single stop's dwell_seconds is expected, not a bug.
comment on column public.trips.idle_seconds is
  'In-leg idle only: engine-on-but-stationary time within moving legs (traffic '
  'lights, brief halts below the stop threshold). Excludes flagged-stop dwell '
  '(see trip_stops.dwell_seconds). Total stationary time = idle_seconds + '
  'sum(trip_stops.dwell_seconds).';
