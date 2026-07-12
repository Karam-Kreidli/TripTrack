"use client";

import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

// OSM tiles are always light, so route/marker colors are chosen to read on a
// light basemap while matching the app's yellow accent.
const ROUTE_COLOR = "#e0a800";
const START_GREEN = "#0ca30c";
const END_RED = "#d03b3b";
const STOP_BLUE = "#2a78d6";
const REFUEL_VIOLET = "#7c5cff";

export interface StopMarker {
  lat: number;
  lon: number;
  label: string;
}

export default function TripMap({
  path,
  stops = [],
  refuels = [],
}: {
  path: [number, number][];
  stops?: StopMarker[];
  refuels?: StopMarker[];
}) {
  if (path.length === 0) return null;

  const lats = [
    ...path.map(([lat]) => lat),
    ...stops.map((s) => s.lat),
    ...refuels.map((r) => r.lat),
  ];
  const lons = [
    ...path.map(([, lon]) => lon),
    ...stops.map((s) => s.lon),
    ...refuels.map((r) => r.lon),
  ];
  const bounds: LatLngBoundsExpression = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];

  const start = path[0];
  const end = path[path.length - 1];

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {path.length > 1 && (
        <Polyline positions={path} color={ROUTE_COLOR} weight={4} opacity={0.9} />
      )}
      <CircleMarker
        center={start}
        radius={7}
        pathOptions={{ color: "#ffffff", weight: 2, fillColor: START_GREEN, fillOpacity: 1 }}
      >
        <Tooltip>Start</Tooltip>
      </CircleMarker>
      {stops.map((s, i) => (
        <CircleMarker
          key={`stop-${i}`}
          center={[s.lat, s.lon]}
          radius={6}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: STOP_BLUE, fillOpacity: 1 }}
        >
          <Tooltip>{s.label}</Tooltip>
        </CircleMarker>
      ))}
      {refuels.map((r, i) => (
        <CircleMarker
          key={`refuel-${i}`}
          center={[r.lat, r.lon]}
          radius={7}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: REFUEL_VIOLET, fillOpacity: 1 }}
        >
          <Tooltip>{r.label}</Tooltip>
        </CircleMarker>
      ))}
      {path.length > 1 && (
        <CircleMarker
          center={end}
          radius={7}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: END_RED, fillOpacity: 1 }}
        >
          <Tooltip>End</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
