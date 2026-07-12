// Preset reporting periods, with boundaries at Dubai-local midnights.
// Dubai is fixed UTC+4 (no DST), so the offset can be written literally.

export type RangeKey = "7d" | "30d" | "365d" | "all" | "custom";

export interface Period {
  key: RangeKey;
  label: string;
  from?: string; // inclusive ISO instant
  to?: string; // exclusive ISO instant
  fromDay?: string; // custom range echo, YYYY-MM-DD (for the date inputs)
  toDay?: string;
}

// Presets only — "custom" is driven by its own calendar button.
export const RANGE_LABELS: Record<Exclude<RangeKey, "custom">, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "365d": "Last year",
  all: "All time",
};

// The preset applied when none is given in the URL.
export const DEFAULT_RANGE: RangeKey = "30d";

function dubaiTodayParts(): { y: number; m: number; d: number } {
  const [y, m, d] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" })
    .split("-")
    .map(Number);
  return { y, m, d };
}

function dubaiMidnightIso(y: number, m: number, d: number): string {
  // Normalize out-of-range month/day values (e.g. month 0 -> December last year).
  const norm = new Date(Date.UTC(y, m - 1, d));
  const yy = norm.getUTCFullYear();
  const mm = String(norm.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(norm.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}T00:00:00+04:00`;
}

// Convert inclusive YYYY-MM-DD form inputs to [from, to) Dubai-local instants.
export function dubaiDayRange(
  fromDay?: string,
  toDay?: string
): { from?: string; to?: string } {
  const parse = (day: string) => day.split("-").map(Number) as [number, number, number];
  const result: { from?: string; to?: string } = {};
  if (fromDay) {
    const [y, m, d] = parse(fromDay);
    result.from = dubaiMidnightIso(y, m, d);
  }
  if (toDay) {
    const [y, m, d] = parse(toDay);
    result.to = dubaiMidnightIso(y, m, d + 1);
  }
  return result;
}

export function resolvePeriod(
  key: string | undefined,
  custom?: { from?: string; to?: string }
): Period {
  // A custom From/To (either bound) wins over any preset.
  if (custom && (custom.from || custom.to)) {
    const { from, to } = dubaiDayRange(custom.from, custom.to);
    const label =
      custom.from && custom.to
        ? `${custom.from} → ${custom.to}`
        : custom.from
        ? `From ${custom.from}`
        : `Until ${custom.to}`;
    return { key: "custom", label, from, to, fromDay: custom.from, toDay: custom.to };
  }

  const presets = ["7d", "30d", "365d", "all"] as const;
  type Preset = (typeof presets)[number];
  const k: Preset = presets.includes(key as Preset)
    ? (key as Preset)
    : (DEFAULT_RANGE as Preset);

  const { y, m, d } = dubaiTodayParts();
  const label = RANGE_LABELS[k];

  // Rolling windows: last N days up to and including today. `to` is the start
  // of tomorrow (exclusive) so today's trips are included.
  switch (k) {
    case "7d":
      return {
        key: k,
        label,
        from: dubaiMidnightIso(y, m, d - 6),
        to: dubaiMidnightIso(y, m, d + 1),
      };
    case "30d":
      return {
        key: k,
        label,
        from: dubaiMidnightIso(y, m, d - 29),
        to: dubaiMidnightIso(y, m, d + 1),
      };
    case "365d":
      return {
        key: k,
        label,
        from: dubaiMidnightIso(y, m, d - 364),
        to: dubaiMidnightIso(y, m, d + 1),
      };
    case "all":
      return { key: k, label };
  }
}
