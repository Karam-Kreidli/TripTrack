"use client";

import dynamic from "next/dynamic";
import type { StopMarker } from "./TripMap";

// Leaflet touches `window` at import time, so the map must never render on
// the server.
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--tt-muted)]">
      Loading map…
    </div>
  ),
});

export default function TripMapPanel({
  path,
  stops,
  refuels,
}: {
  path: [number, number][];
  stops?: StopMarker[];
  refuels?: StopMarker[];
}) {
  return <TripMap path={path} stops={stops} refuels={refuels} />;
}
