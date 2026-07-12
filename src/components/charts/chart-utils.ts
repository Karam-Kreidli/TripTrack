import type { TripChartPoint } from "@/types/db";
import { dubaiDateKey } from "@/lib/format";

export type Bucket = "day" | "week" | "month";

export function resolveBucket(value: string | undefined): Bucket {
  return value === "week" || value === "month" ? value : "day";
}

export interface BucketPoint {
  key: string; // sortable YYYY-MM-DD bucket start
  label: string;
  value: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function bucketStart(dateKey: string, bucket: Bucket): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (bucket === "day") return dateKey;
  if (bucket === "month") return `${dateKey.slice(0, 7)}-01`;
  // week starting Monday
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function bucketLabel(key: string, bucket: Bucket): string {
  const [y, m, d] = key.split("-").map(Number);
  if (bucket === "month") return `${MONTHS[m - 1]} ${y}`;
  if (bucket === "week") {
    // The key is the Monday; show the Mon–Sun span, e.g. "6–12 Jul".
    const start = new Date(Date.UTC(y, m - 1, d));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const sm = start.getUTCMonth();
    const em = end.getUTCMonth();
    return sm === em
      ? `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS[em]}`
      : `${start.getUTCDate()} ${MONTHS[sm]} – ${end.getUTCDate()} ${MONTHS[em]}`;
  }
  return `${d} ${MONTHS[m - 1]}`;
}

// Sum `field` over trips per day/week/month bucket (Dubai-local calendar).
// Trips where the field is null (e.g. cost not yet priced) are skipped.
export function bucketTrips(
  trips: TripChartPoint[],
  bucket: Bucket,
  field: "cost_aed" | "distance_km"
): BucketPoint[] {
  const sums = new Map<string, number>();
  for (const trip of trips) {
    const value = trip[field];
    if (value == null) continue;
    const key = bucketStart(dubaiDateKey(trip.started_at), bucket);
    sums.set(key, (sums.get(key) ?? 0) + Number(value));
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      label: bucketLabel(key, bucket),
      value: Math.round(value * 100) / 100,
    }));
}

// Count of trips per day/week/month bucket (Dubai-local calendar).
export function bucketCounts(
  trips: TripChartPoint[],
  bucket: Bucket
): BucketPoint[] {
  const counts = new Map<string, number>();
  for (const trip of trips) {
    const key = bucketStart(dubaiDateKey(trip.started_at), bucket);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      label: bucketLabel(key, bucket),
      value,
    }));
}
