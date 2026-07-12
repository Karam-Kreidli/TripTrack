"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Refuel } from "@/types/db";
import { fmtAED, fmtDate } from "@/lib/format";
import ChartTooltip from "./ChartTooltip";

// Real money at the pump, accumulating over the period. Each refuel steps the
// line up by its cost — distinct from the estimated per-trip cost elsewhere.
export default function CumulativeSpendChart({
  refuels,
  bare = false,
}: {
  refuels: Refuel[];
  bare?: boolean;
}) {
  const data = useMemo(() => {
    let running = 0;
    return [...refuels]
      .filter((r) => r.cost_est_aed != null)
      .sort(
        (a, b) =>
          new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime()
      )
      .map((r) => {
        running += Number(r.cost_est_aed);
        return {
          label: fmtDate(r.detected_at),
          value: Math.round(running * 100) / 100,
        };
      });
  }, [refuels]);

  const Wrapper = bare ? "div" : "section";

  return (
    <Wrapper
      className={
        bare
          ? ""
          : "rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4"
      }
    >
      <h2 className="mb-3 text-sm font-semibold">Cumulative pump spend (AED)</h2>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--tt-muted)]">
          No refuels in this period.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--tt-accent)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--tt-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            />
            <Tooltip content={<ChartTooltip format={(v) => fmtAED(v)} />} />
            <Area
              dataKey="value"
              stroke="var(--tt-accent)"
              strokeWidth={2}
              fill="url(#spendFill)"
              dot={{ r: 3, fill: "var(--tt-accent)" }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Wrapper>
  );
}
