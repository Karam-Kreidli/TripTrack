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
import { fmtAED, fmtDate, fmtDateTime } from "@/lib/format";
import ChartTooltip from "./ChartTooltip";

// One bar per individual trip (chronological) — the cost of each ride, not
// summed by day. Makes big single trips stand out from the pack.
export default function CostPerTripChart({
  trips,
  bare = false,
}: {
  trips: TripChartPoint[];
  bare?: boolean;
}) {
  const data = useMemo(
    () =>
      trips
        .filter((t) => t.cost_aed != null)
        .sort(
          (a, b) =>
            new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        )
        .map((t, i) => ({
          // Unique key per bar so same-day trips are distinct marks. The key
          // starts with the ISO start time so the axis tick can format the
          // date straight from the key value (never index back into `data` —
          // tickFormatter's index is over rendered ticks, not the data array).
          key: `${t.started_at}#${i}`,
          label: fmtDateTime(t.started_at),
          value: Number(t.cost_aed),
        })),
    [trips]
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
      <h2 className="mb-3 text-sm font-semibold">Cost per trip (AED)</h2>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--tt-muted)]">
          No data in this period.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--tt-grid)" vertical={false} />
            <XAxis
              dataKey="key"
              // Format the date from the tick's own value (the key = "ISO#idx"),
              // not by indexing data[] — the index here is over rendered ticks.
              tickFormatter={(v: string) => fmtDate(v.split("#")[0])}
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
              // Bars must be measured from zero, else bar length misrepresents value.
              domain={[0, "auto"]}
            />
            <Tooltip
              cursor={{ fill: "var(--tt-grid)", opacity: 0.4 }}
              content={<ChartTooltip format={(v) => fmtAED(v)} labelKey="label" />}
            />
            <Bar
              dataKey="value"
              fill="var(--tt-series)"
              radius={[4, 4, 0, 0]}
              maxBarSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Wrapper>
  );
}
