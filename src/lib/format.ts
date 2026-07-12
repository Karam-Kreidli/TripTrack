// All dates are displayed and bucketed in Asia/Dubai — the car lives there,
// and fuel prices roll over on the 1st of the month Dubai time.
export const TZ = "Asia/Dubai";

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)}, ${fmtTime(iso)}`;
}

export function fmtMonth(isoDate: string): string {
  // isoDate is a plain YYYY-MM-DD (first of month); avoid TZ shifts by parsing manually.
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

export function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtNum(value: number | null | undefined, digits = 1): string {
  if (value == null) return "—";
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtAED(value: number | null | undefined): string {
  if (value == null) return "—";
  return `AED ${fmtNum(value, 2)}`;
}

// YYYY-MM-DD of an instant in Dubai time (en-CA locale formats ISO-style).
export function dubaiDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}
