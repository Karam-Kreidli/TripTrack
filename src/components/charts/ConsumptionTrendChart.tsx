"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TripChartPoint } from "@/types/db";
import { fmtDate, fmtNum } from "@/lib/format";
import ChartTooltip from "./ChartTooltip";

// L/100km per trip, in trip order, with the period average as a reference.
export default function ConsumptionTrendChart({
  trips,
  bare = false,
}: {
  trips: TripChartPoint[];
  bare?: boolean;
}) {
  const { data, average } = useMemo(() => {
    const points = trips
      .filter((t) => t.l_per_100km != null)
      .sort(
        (a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      )
      .map((t) => ({
        label: fmtDate(t.started_at),
        value: Number(t.l_per_100km),
      }));
    const totalDistance = trips.reduce((s, t) => s + Number(t.distance_km), 0);
    const totalFuel = trips.reduce((s, t) => s + Number(t.fuel_used_liters), 0);
    return {
      data: points,
      average: totalDistance > 0 ? (totalFuel / totalDistance) * 100 : null,
    };
  }, [trips]);

  const Wrapper = bare ? "div" : "section";

  return (
    <Wrapper
      className={
        bare
          ? ""
          : "rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4"
      }
    >
      <h2 className="mb-3 text-sm font-semibold">
        Consumption per trip (L/100km)
      </h2>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--tt-muted)]">
          No data in this period.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
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
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={
                <ChartTooltip format={(v) => `${fmtNum(v, 2)} L/100km`} />
              }
            />
            {average != null && (
              <ReferenceLine
                y={average}
                stroke="var(--tt-muted)"
                strokeDasharray="4 4"
                label={{
                  value: `avg ${fmtNum(average, 1)}`,
                  position: "insideTopRight",
                  fill: "var(--tt-muted)",
                  fontSize: 11,
                }}
              />
            )}
            <Line
              dataKey="value"
              stroke="var(--tt-series)"
              strokeWidth={2}
              isAnimationActive={false}
              dot={{ r: 2.5, fill: "var(--tt-series)", strokeWidth: 0 }}
              activeDot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Wrapper>
  );
}
