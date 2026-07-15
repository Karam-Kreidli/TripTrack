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
import type { Refuel } from "@/types/db";
import { fmtAED, fmtDate } from "@/lib/format";
import ChartTooltip from "./ChartTooltip";

// One bar per fill-up: what each individual refuel cost at the pump.
export default function CostPerRefuelChart({
  refuels,
  bare = false,
}: {
  refuels: Refuel[];
  bare?: boolean;
}) {
  const data = useMemo(
    () =>
      [...refuels]
        .filter((r) => r.amount_paid_aed != null)
        .sort(
          (a, b) =>
            new Date(a.refueled_at).getTime() -
            new Date(b.refueled_at).getTime()
        )
        .map((r, i) => ({
          // Unique key per bar (same-day fills stay distinct); format the axis
          // date from the key itself, never by indexing back into `data`.
          key: `${r.refueled_at}#${i}`,
          label: fmtDate(r.refueled_at),
          value: Number(r.amount_paid_aed),
        })),
    [refuels]
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
      <h2 className="mb-3 text-sm font-semibold">Cost per refuel (AED)</h2>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--tt-muted)]">
          No refuels in this period.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--tt-grid)" vertical={false} />
            <XAxis
              dataKey="key"
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
              // Bars measured from zero so length matches value.
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
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Wrapper>
  );
}
