"use server";

import { createClient } from "@/lib/supabase/server";
import type { CompAnalystAdjustments } from "@/lib/screening/types";

type SaveCompAdjustmentInput = {
  candidateId: string;
  adjustments: CompAnalystAdjustments;
};

export async function saveCompAdjustmentAction(
  input: SaveCompAdjustmentInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("comparable_search_candidates")
    .update({ analyst_adjustments_json: input.adjustments })
    .eq("id", input.candidateId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    // eslint-disable-next-line no-console
    console.error("[comp-adj] update matched 0 rows — likely RLS block. candidateId:", input.candidateId);
    return { error: "Update blocked — row not found or permission denied." };
  }
  return { error: null };
}
