// Phase 1 Step 4F — Partner dashboard data loader.
//
// Loads all analyses shared with the current partner for the Partner
// Workspace dashboard at /portal/. Queries analysis_shares (filtered
// by the partner's user ID or email) + partner_feedback + basic
// property/analysis info for each share.

"use server";

import { createClient } from "@/lib/supabase/server";

export type PartnerDashboardDeal = {
  shareId: string;
  shareToken: string;
  analysisId: string;
  isActive: boolean;
  sentAt: string;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  message: string | null;
  // Property info
  address: string;
  city: string;
  state: string;
  // Deal math
  arv: number | null;
  maxOffer: number | null;
  offerPct: number | null;
  listPrice: number | null;
  // Partner's feedback (if any)
  feedbackAction: string | null;
  feedbackSubmittedAt: string | null;
  feedbackPassReason: string | null;
};

export type PartnerDashboardData = {
  deals: PartnerDashboardDeal[];
  partnerEmail: string;
};

export async function loadPartnerDashboardData(): Promise<PartnerDashboardData | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Load all shares for this user (by user ID or email fallback)
  const { data: shares, error: sharesError } = await supabase
    .from("analysis_shares")
    .select("id, share_token, analysis_id, is_active, sent_at, first_viewed_at, last_viewed_at, view_count, message")
    .or(`shared_with_user_id.eq.${user.id},shared_with_email.eq.${user.email}`)
    .order("sent_at", { ascending: false });

  if (sharesError || !shares || shares.length === 0) {
    return { deals: [], partnerEmail: user.email ?? "" };
  }

  // Load feedback for all these shares
  const shareIds = shares.map((s) => s.id);
  const { data: feedbackRows } = await supabase
    .from("partner_feedback")
    .select("analysis_share_id, action, submitted_at, pass_reason")
    .in("analysis_share_id", shareIds)
    .order("submitted_at", { ascending: false });

  // Build a map: shareId → latest feedback
  const feedbackMap = new Map<string, { action: string; submittedAt: string; passReason: string | null }>();
  for (const fb of feedbackRows ?? []) {
    if (!feedbackMap.has(fb.analysis_share_id)) {
      feedbackMap.set(fb.analysis_share_id, {
        action: fb.action,
        submittedAt: fb.submitted_at,
        passReason: fb.pass_reason,
      });
    }
  }

  // Load property + analysis info for each share's analysis
  const analysisIds = [...new Set(shares.map((s) => s.analysis_id))];
  const { data: analyses } = await supabase
    .from("analyses")
    .select("id, real_property_id")
    .in("id", analysisIds);

  const propertyIds = [...new Set((analyses ?? []).map((a) => a.real_property_id))];
  const [{ data: properties }, { data: dealMathRows }] = await Promise.all([
    supabase
      .from("real_properties")
      .select("id, unparsed_address, city, state")
      .in("id", propertyIds),
    supabase
      .from("watch_list_v")
      .select("analysis_id, arv_aggregate, max_offer, offer_pct, list_price")
      .in("analysis_id", analysisIds),
  ]);

  // Build lookup maps
  const analysisMap = new Map((analyses ?? []).map((a) => [a.id, a]));
  const propertyMap = new Map((properties ?? []).map((p) => [p.id, p]));
  const dealMathMap = new Map((dealMathRows ?? []).map((d) => [d.analysis_id, d]));

  const deals: PartnerDashboardDeal[] = shares.map((s) => {
    const analysis = analysisMap.get(s.analysis_id);
    const property = analysis ? propertyMap.get(analysis.real_property_id) : null;
    const dm = dealMathMap.get(s.analysis_id);
    const fb = feedbackMap.get(s.id);

    return {
      shareId: s.id,
      shareToken: s.share_token,
      analysisId: s.analysis_id,
      isActive: s.is_active,
      sentAt: s.sent_at,
      firstViewedAt: s.first_viewed_at,
      lastViewedAt: s.last_viewed_at,
      viewCount: s.view_count,
      message: s.message,
      address: property?.unparsed_address ?? "Unknown property",
      city: property?.city ?? "",
      state: property?.state ?? "",
      arv: dm?.arv_aggregate ?? null,
      maxOffer: dm?.max_offer ?? null,
      offerPct: dm?.offer_pct ?? null,
      listPrice: dm?.list_price ?? null,
      feedbackAction: fb?.action ?? null,
      feedbackSubmittedAt: fb?.submittedAt ?? null,
      feedbackPassReason: fb?.passReason ?? null,
    };
  });

  return { deals, partnerEmail: user.email ?? "" };
}
