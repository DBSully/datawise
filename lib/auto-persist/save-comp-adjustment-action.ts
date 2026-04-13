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

  const { error } = await supabase
    .from("comparable_search_candidates")
    .update({ analyst_adjustments_json: input.adjustments })
    .eq("id", input.candidateId);

  if (error) return { error: error.message };
  return { error: null };
}
