"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase";

export type AddRefuelResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

// Insert a manual refuel via the ingest_refuel RPC (the sanctioned idempotent
// write path). Runs server-side only so the secret key never reaches the
// browser. Primary input is amount_paid_aed; litres are DB-derived.
export async function addRefuel(formData: FormData): Promise<AddRefuelResult> {
  const carId = Number(formData.get("car_id"));
  if (!Number.isFinite(carId) || carId <= 0) {
    return { ok: false, error: "A car is required." };
  }

  const amount = Number(formData.get("amount_paid_aed"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount paid (AED) is required and must be positive." };
  }

  const refueledAt = String(formData.get("refueled_at") ?? "").trim();
  if (!refueledAt) {
    return { ok: false, error: "Date & time of the fill-up is required." };
  }

  const num = (key: string): number | undefined => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  const payload: Record<string, unknown> = {
    client_refuel_id: randomUUID(),
    car_id: carId,
    // datetime-local has no zone; treat as Dubai wall-clock (fixed +04:00).
    refueled_at: `${refueledAt}:00+04:00`,
    amount_paid_aed: amount,
    is_full_tank: formData.get("is_full_tank") != null,
  };
  const odo = num("odometer_km");
  if (odo != null) payload.odometer_km = odo;
  const litresOverride = num("liters_added_override");
  if (litresOverride != null) payload.liters_added_override = litresOverride;
  const lat = num("lat");
  const lon = num("lon");
  if (lat != null) payload.lat = lat;
  if (lon != null) payload.lon = lon;

  let sb;
  try {
    sb = getServiceSupabase();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { data, error } = await sb.rpc("ingest_refuel", { payload });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/refuels");
  return { ok: true, id: data as number };
}
