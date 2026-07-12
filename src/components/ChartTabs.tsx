"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TripChartPoint } from "@/types/db";
import type { Bucket } from "@/components/charts/chart-utils";
import ConsumptionTrendChart from "@/components/charts/ConsumptionTrendChart";
import CostPerTripChart from "@/components/charts/CostPerTripChart";
import TimeBucketBarChart from "@/components/charts/TimeBucketBarChart";

type TabKey = "cost" | "distance" | "trips" | "perTrip" | "consumption";

const TABS: { key: TabKey; label: string; bucketed: boolean }[] = [
  { key: "cost", label: "Cost", bucketed: true },
  { key: "distance", label: "Distance", bucketed: true },
  { key: "trips", label: "Trips", bucketed: true },
  { key: "perTrip", label: "Cost per trip", bucketed: false },
  { key: "consumption", label: "Consumption", bucketed: false },
];

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "day", label: "D" },
  { key: "week", label: "W" },
  { key: "month", label: "M" },
];

const BUCKET_NOUN: Record<Bucket, string> = {
  day: "day",
  week: "week",
  month: "month",
};

// The chart panel owns its own controls: a tab strip picks which single chart
// shows, and (only for bucketed charts) a compact D/W/M toggle sits inline.
// This keeps the top of the page to one control row instead of three.
export default function ChartTabs({
  trips,
  bucket,
}: {
  trips: TripChartPoint[];
  bucket: Bucket;
}) {
  const [tab, setTab] = useState<TabKey>("cost");
  const router = useRouter();
  const params = useSearchParams();
  const bucketed = TABS.find((t) => t.key === tab)?.bucketed ?? false;

  function setBucket(b: Bucket) {
    const q = new URLSearchParams(params.toString());
    if (b === "day") q.delete("bucket");
    else q.set("bucket", b);
    const qs = q.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <section className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)]">
      {/* Chart header: tabs on the left, contextual bucket on the right */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--tt-border)] px-2 py-2">
        <div className="flex flex-wrap gap-0.5 text-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                tab === t.key
                  ? "bg-[var(--tt-accent)] text-[var(--tt-accent-ink)] font-medium"
                  : "text-[var(--tt-muted)] hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {bucketed && (
          <div className="inline-flex rounded-md border border-[var(--tt-border)] p-0.5 text-xs">
            {BUCKETS.map((b) => (
              <button
                key={b.key}
                onClick={() => setBucket(b.key)}
                aria-current={bucket === b.key ? "page" : undefined}
                title={`Per ${BUCKET_NOUN[b.key]}`}
                className={`rounded px-2 py-0.5 transition-colors ${
                  bucket === b.key
                    ? "bg-[var(--tt-accent)] text-[var(--tt-accent-ink)] font-medium"
                    : "text-[var(--tt-muted)] hover:text-foreground"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4">
        {tab === "cost" && (
          <TimeBucketBarChart
            title={`Fuel cost per ${BUCKET_NOUN[bucket]} (AED)`}
            trips={trips}
            field="cost_aed"
            bucket={bucket}
            bare
          />
        )}
        {tab === "distance" && (
          <TimeBucketBarChart
            title={`Distance per ${BUCKET_NOUN[bucket]} (km)`}
            trips={trips}
            field="distance_km"
            bucket={bucket}
            bare
          />
        )}
        {tab === "trips" && (
          <TimeBucketBarChart
            title={`Trips per ${BUCKET_NOUN[bucket]}`}
            trips={trips}
            field="count"
            bucket={bucket}
            bare
          />
        )}
        {tab === "perTrip" && <CostPerTripChart trips={trips} bare />}
        {tab === "consumption" && <ConsumptionTrendChart trips={trips} bare />}
      </div>
    </section>
  );
}
