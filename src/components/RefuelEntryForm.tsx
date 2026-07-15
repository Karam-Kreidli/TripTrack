"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Car, FuelPrice } from "@/types/db";
import { fmtNum } from "@/lib/format";
import { addRefuel } from "@/app/actions/refuels";

// Manual refuel entry. Primary field is AED PAID; litres are derived by the DB
// from the month's government-set price. We show the derived litres back
// live (using the current price) so the user can sanity-check before saving.
export default function RefuelEntryForm({
  cars,
  currentPrice,
}: {
  cars: Car[];
  currentPrice: FuelPrice | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = currentPrice ? Number(currentPrice.price_per_liter) : null;
  const amountNum = Number(amount);
  const previewLitres =
    price && price > 0 && Number.isFinite(amountNum) && amountNum > 0
      ? amountNum / price
      : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await addRefuel(new FormData(e.currentTarget));
    setSubmitting(false);
    if (result.ok) {
      setOpen(false);
      setAmount("");
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--tt-accent)] px-3 py-1.5 text-sm font-medium text-[var(--tt-accent-ink)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Log a refuel
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Log a refuel</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-[var(--tt-muted)] hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cars.length > 1 && (
          <Labeled label="Car">
            <select name="car_id" defaultValue={cars[0]?.id} className={SELECT}>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Labeled>
        )}
        {cars.length <= 1 && (
          <input type="hidden" name="car_id" value={cars[0]?.id ?? ""} />
        )}

        <Labeled label="Amount paid (AED)" required>
          <input
            name="amount_paid_aed"
            type="number"
            step="0.01"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 150.00"
            className={INPUT}
          />
        </Labeled>

        <Labeled label="Date & time" required>
          <input name="refueled_at" type="datetime-local" required className={INPUT} />
        </Labeled>

        <Labeled label="Odometer (km)">
          <input name="odometer_km" type="number" step="0.1" min="0" placeholder="optional" className={INPUT} />
        </Labeled>

        <Labeled label="Exact litres (if known)">
          <input name="liters_added_override" type="number" step="0.001" min="0" placeholder="overrides derived" className={INPUT} />
        </Labeled>

        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Station lat">
            <input name="lat" type="number" step="any" placeholder="optional" className={INPUT} />
          </Labeled>
          <Labeled label="Station lon">
            <input name="lon" type="number" step="any" placeholder="optional" className={INPUT} />
          </Labeled>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input name="is_full_tank" type="checkbox" defaultChecked className="accent-[var(--tt-accent)]" />
        Filled to full (required for the tank-to-tank check)
      </label>

      {/* Live derived-litres figure so the entry can be sanity-checked. */}
      {previewLitres != null && (
        <p className="mt-3 text-xs text-[var(--tt-muted)]">
          ≈ <span className="font-medium text-foreground">{fmtNum(previewLitres, 2)} L</span>
        </p>
      )}

      {error && <p className="mt-2 text-xs text-[#f87171]">{error}</p>}

      <div className="mt-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-[var(--tt-accent)] px-4 py-1.5 text-sm font-medium text-[var(--tt-accent-ink)] transition-opacity disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save refuel"}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-md border border-[var(--tt-border)] bg-[var(--background)] px-2 py-1.5 text-sm text-foreground [color-scheme:dark] placeholder:text-[var(--tt-muted)]/60 focus:border-[var(--tt-accent)] focus:outline-none";
const SELECT =
  "w-full rounded-md border border-[var(--tt-border)] bg-[var(--background)] px-2 py-1.5 text-sm [color-scheme:dark] focus:outline-none";

function Labeled({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--tt-muted)]">
        {label}
        {required && <span className="text-[var(--tt-accent)]"> *</span>}
      </span>
      {children}
    </label>
  );
}
