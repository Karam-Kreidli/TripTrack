"use client";

interface TooltipEntry {
  value?: number | string;
  name?: string;
  payload?: Record<string, unknown>;
}

// Recharts custom tooltip: chart surface, hairline border, ink-colored text
// (values never wear the series color). `labelKey` lets the header read a
// friendly label off the datum (used when the axis key isn't display text —
// e.g. same-day trips keyed uniquely but labelled by date+time).
export default function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelKey,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  format: (value: number) => string;
  labelKey?: string;
}) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  const header =
    labelKey && payload[0].payload?.[labelKey] != null
      ? String(payload[0].payload[labelKey])
      : label;
  return (
    <div className="rounded-lg border border-[var(--tt-border)] bg-[var(--tt-surface)] px-3 py-2 text-xs shadow-sm">
      <div className="text-[var(--tt-muted)]">{header}</div>
      <div className="mt-0.5 font-semibold">
        {format(Number(payload[0].value))}
      </div>
    </div>
  );
}
