// Phase 1 — Partner Quick Analysis sandbox save action.
//
// Saves a partner's private override value to partner_analysis_versions.
// Each field (arv_override, rehab_override, target_profit_override,
// days_held_override) is saved individually via the same debounced
// auto-persist pattern the analyst's Quick Analysis uses (3D).
//
// Requires auth — only the partner linked to this share can write.

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PartnerOverrideField =
  | "arv_override"
  | "rehab_override"
  | "target_profit_override"
  | "days_held_override"
  | "financing_override"
  | "buyer_commission_pct_override"
  | "seller_commission_pct_override";

type SavePartnerOverrideInput = {
  shareId: string;
  field: PartnerOverrideField;
  value: number | null;
};

export async function savePartnerOverrideAction(
  input: SavePartnerOverrideInput,
): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { shareId, field, value } = input;

  // Verify the share exists, is active, and belongs to this user
  const { data: share, error: lookupError } = await supabase
    .from("analysis_shares")
    .select("id")
    .eq("id", shareId)
    .eq("is_active", true)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (!share) throw new Error("Share not found or not active.");

  // Update the partner_analysis_versions row (created when the share
  // was first created in createAnalysisShareAction). If no row exists
  // yet (edge case), create one.
  const { data: existing } = await supabase
    .from("partner_analysis_versions")
    .select("id")
    .eq("analysis_share_id", shareId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("partner_analysis_versions")
      .update({ [field]: value })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("partner_analysis_versions")
      .insert({ analysis_share_id: shareId, [field]: value });
    if (error) throw new Error(error.message);
  }
}
