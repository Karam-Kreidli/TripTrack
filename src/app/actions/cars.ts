"use server";

import { revalidatePath } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase";

export type AddCarResult = { ok: true; id: number } | { ok: false; error: string };

// Insert a car via the SECURITY DEFINER add_car RPC (the sanctioned write path;
// the dashboard's read key can't write). Runs server-side only, so the secret
// key never reaches the browser.
export async function addCar(formData: FormData): Promise<AddCarResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };

  const num = (key: string): number | undefined => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const str = (key: string): string | undefined => {
    const raw = String(formData.get(key) ?? "").trim();
    return raw === "" ? undefined : raw;
  };

  const payload = {
    name,
    make: str("make"),
    model: str("model"),
    year: num("year"),
    fuel_type: str("fuel_type"),
    device_id: str("device_id"),
    tank_capacity_liters: num("tank_capacity_liters"),
    image_url: str("image_url"),
  };

  let sb;
  try {
    sb = getServiceSupabase();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { data, error } = await sb.rpc("add_car", { payload });
  if (error) return { ok: false, error: error.message };

  // Refresh any page that lists cars (the picker is in the shared layout).
  revalidatePath("/", "layout");
  return { ok: true, id: data as number };
}
