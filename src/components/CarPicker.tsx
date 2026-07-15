"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Car } from "@/types/db";
import { addCar } from "@/app/actions/cars";

// A car avatar (photo or fallback glyph). Plain <img> so external image hosts
// work without next/image remote-pattern config.
function CarThumb({
  car,
  className,
  contain = false,
}: {
  car: Car;
  className?: string;
  // `contain` shows the whole car with no cropping/background (for the floating
  // trigger); otherwise the image is cropped to fill (the drawer list rows).
  contain?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (car.image_url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={car.image_url}
        alt={car.name}
        onError={() => setBroken(true)}
        className={`${contain ? "object-contain" : "object-cover"} ${
          className ?? ""
        }`}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center text-[var(--tt-muted)] ${
        contain ? "" : "bg-[var(--tt-border)]"
      } ${className ?? ""}`}
    >
      <svg width="55%" height="55%" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11m-14 0h14m-14 0a2 2 0 00-2 2v3h2m12-5a2 2 0 012 2v3h-2m-12 0h12m-12 0v1a1 1 0 001 1h1a1 1 0 001-1v-1m8 0v1a1 1 0 001 1h1a1 1 0 001-1v-1M7 13.5h.01M17 13.5h.01" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const FUEL_TYPES = [
  { value: "95_special", label: "95 Special" },
  { value: "98_super", label: "98 Super" },
  { value: "e_plus_91", label: "E-Plus 91" },
  { value: "diesel", label: "Diesel" },
];

export default function CarPicker({
  cars,
  currentCarId,
}: {
  cars: Car[];
  currentCarId?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<number | undefined>(
    currentCarId ?? cars[0]?.id
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const current = cars.find((c) => c.id === selectedId) ?? cars[0];

  // Close drawer on Escape.
  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await addCar(new FormData(e.currentTarget));
    setSubmitting(false);
    if (result.ok) {
      setAdding(false);
      setSelectedId(result.id);
      router.refresh(); // pull the new car list from the server
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      {/* Trigger: current car image, fixed bottom-right. */}
      <button
        onClick={() => setOpen(true)}
        aria-label={current ? `Car: ${current.name}. Open car menu` : "Add a car"}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-[var(--tt-border)] bg-[var(--tt-surface)] p-1 pr-3 shadow-lg transition-colors hover:border-white/25"
      >
        {current ? (
          <>
            <CarThumb car={current} className="h-11 w-11 rounded-full" />
            <span className="hidden text-sm font-medium sm:inline">
              {current.name}
            </span>
          </>
        ) : (
          <span className="px-2 text-sm text-[var(--tt-muted)]">+ Add car</span>
        )}
      </button>

      {/* Right-side vertical drawer. */}
      {open && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            ref={panelRef}
            role="dialog"
            aria-label="Cars"
            className="tt-scroll absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col overflow-y-auto border-l border-[var(--tt-border)] bg-[var(--tt-surface)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--tt-border)] px-4 py-3">
              <h2 className="text-sm font-semibold">Cars</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-[var(--tt-muted)] hover:bg-white/5 hover:text-foreground"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <ul className="space-y-1 p-2">
              {cars.map((car) => {
                const active = car.id === selectedId;
                return (
                  <li key={car.id}>
                    <button
                      onClick={() => setSelectedId(car.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                        active
                          ? "border-[var(--tt-accent)] bg-white/[.04]"
                          : "border-transparent hover:bg-white/5"
                      }`}
                    >
                      <CarThumb car={car} className="h-12 w-12 shrink-0 rounded-lg" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {car.name}
                        </div>
                        <div className="truncate text-xs text-[var(--tt-muted)]">
                          {[car.make, car.model, car.year]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-auto border-t border-[var(--tt-border)] p-3">
              {adding ? (
                <form onSubmit={onSubmit} className="space-y-2">
                  <Field name="name" label="Name" required placeholder="e.g. Koleos" />
                  <div className="grid grid-cols-2 gap-2">
                    <Field name="make" label="Make" placeholder="Renault" />
                    <Field name="model" label="Model" placeholder="Koleos" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field name="year" label="Year" type="number" placeholder="2022" />
                    <label className="block">
                      <span className="mb-1 block text-xs text-[var(--tt-muted)]">
                        Fuel type
                      </span>
                      <select
                        name="fuel_type"
                        defaultValue="95_special"
                        className="w-full rounded-md border border-[var(--tt-border)] bg-[var(--background)] px-2 py-1.5 text-sm [color-scheme:dark] focus:outline-none"
                      >
                        {FUEL_TYPES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      name="tank_capacity_liters"
                      label="Tank (L)"
                      type="number"
                      placeholder="60"
                    />
                    <Field name="device_id" label="Device id" placeholder="optional" />
                  </div>
                  <Field name="image_url" label="Image URL" placeholder="https://…" />

                  {error && (
                    <p className="text-xs text-[#f87171]">{error}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 rounded-lg bg-[var(--tt-accent)] px-3 py-1.5 text-sm font-medium text-[var(--tt-accent-ink)] transition-opacity disabled:opacity-50"
                    >
                      {submitting ? "Saving…" : "Save car"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        setError(null);
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm text-[var(--tt-muted)] hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--tt-border)] px-3 py-2 text-sm text-[var(--tt-muted)] transition-colors hover:border-[var(--tt-accent)] hover:text-foreground"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add car
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--tt-muted)]">
        {label}
        {required && <span className="text-[var(--tt-accent)]"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--tt-border)] bg-[var(--background)] px-2 py-1.5 text-sm text-foreground [color-scheme:dark] placeholder:text-[var(--tt-muted)]/60 focus:border-[var(--tt-accent)] focus:outline-none"
      />
    </label>
  );
}
