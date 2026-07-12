"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TripChartPoint } from "@/types/db";
import { fmtAED, fmtNum } from "@/lib/format";
import { bucketCounts, bucketTrips, type Bucket } from "./chart-utils";
import ChartTooltip from "./ChartTooltip";

export type BucketField = "cost_aed" | "distance_km" | "count";

// Formatters live here rather than arriving as props: functions can't cross
// the server -> client component boundary.
const FORMATS: Record<BucketField, (v: number) => string> = {
  cost_aed: (v) => fmtAED(v),
  distance_km: (v) => `${fmtNum(v, 1)} km`,
  count: (v) => `${v} ${v === 1 ? "trip" : "trips"}`,
};

// Single-series bar chart: either a per-trip value summed per bucket, or the
// count of trips per bucket (field "count"). The bucket (day/week/month) is
// controlled page-wide, so it arrives as a prop.
export default function TimeBucketBarChart({
  title,
  trips,
  field,
  bucket,
  bare = false,
}: {
  title: string;
  trips: TripChartPoint[];
  field: BucketField;
  bucket: Bucket;
  // When bare, the parent supplies the card + title (e.g. the chart tab panel),
  // so render just the titled plot without an outer card.
  bare?: boolean;
}) {
  const format = FORMATS[field];
  const data = useMemo(
    () =>
      field === "count"
        ? bucketCounts(trips, bucket)
        : bucketTrips(trips, bucket, field),
    [trips, bucket, field]
  );

  const Wrapper = bare ? "div" : "section";

  return (
    <Wrapper
      className={
        bare
          ? ""
          : "rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4"
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--tt-muted)]">
          No data in this period.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--tt-grid)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--tt-muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--tt-axis)" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "var(--tt-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
              allowDecimals={field !== "count"}
              // Bars must be measured from zero, else bar length misrepresents value.
              domain={[0, "auto"]}
            />
            <Tooltip
              cursor={{ fill: "var(--tt-grid)", opacity: 0.4 }}
              content={<ChartTooltip format={format} />}
            />
            <Bar
              dataKey="value"
              fill="var(--tt-series)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Wrapper>
  );
}
