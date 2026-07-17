"use server";

import { revalidatePath } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase";

export type MergeStopResult = { ok: true } | { ok: false; error: string };

// Remove a falsely-flagged stop and merge its two adjoining legs into one, via
// the merge_stop RPC (folds the stop's idle fuel into the drive; trip totals
// unchanged). Server-side only so the secret key never reaches the browser.
export async function mergeStop(
  tripId: string,
  stopSeq: number
): Promise<MergeStopResult> {
  if (!tripId) return { ok: false, error: "Missing trip id." };
  if (!Number.isInteger(stopSeq)) return { ok: false, error: "Invalid stop." };

  let sb;
  try {
    sb = getServiceSupabase();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error } = await sb.rpc("merge_stop", {
    p_trip_id: tripId,
    p_stop_seq: stopSeq,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}
