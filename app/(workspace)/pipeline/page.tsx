import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { QueueResultsTable } from "@/components/screening/queue-results-table";
import { AutoFilterButtons } from "@/components/screening/auto-filter-buttons";
import { BatchProgressTracker } from "@/components/screening/batch-progress-tracker";
import { LocalTimestamp } from "@/components/common/local-timestamp";
import { cancelScreeningBatchAction } from "@/app/(workspace)/screening/actions";

export const dynamic = "force-dynamic";

// Inherited from the legacy /screening/[batchId] page — the progress
// tracker invokes runScreeningTickAction which is CPU-bound (loads comp
// pool, scores subjects, writes comps). 300s is the Vercel Pro max.
export const maxDuration = 300;

type ViewMode = "focus" | "screen" | "action" | "closed" | "all";

type PipelinePageProps = {
  searchParams?: Promise<{
    view?: string;
    batchId?: string;
    city?: string;
    propertyType?: string;
    prime?: string;
    passed?: string;
    mlsStatus?: string;
    sort?: string;
    page?: string;
    listingDays?: string;
    screenedDays?: string;
    priceLow?: string;
    priceHigh?: string;
  }>;
};

const PAGE_SIZE = 200;

const VIEW_MODES: { value: ViewMode; label: string; hint: string }[] = [
  { value: "focus",  label: "My Focus",  hint: "Watch-list + ongoing work" },
  { value: "screen", label: "Screening", hint: "Fresh, unreviewed" },
  { value: "action", label: "Action",    hint: "Pending showing / offer" },
  { value: "closed", label: "Closed",    hint: "Won / Lost — archive" },
  { value: "all",    label: "All",       hint: "Everything" },
];

// Fields on manual_analysis that count as "analyst has done work."
const MANUAL_ANALYSIS_JUDGEMENT_COLUMNS = [
  "analyst_condition",
  "update_year_est",
  "update_quality",
  "uad_condition_manual",
  "uad_updates_manual",
  "arv_manual",
  "margin_manual",
  "rehab_manual",
  "days_held_manual",
  "rent_estimate_monthly",
  "design_rating",
  "location_rating",
] as const;

function formatNumber(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function buildHref(
  base: string,
  params: Record<string, string | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

function parseViewMode(raw: string | undefined, batchMode: boolean): ViewMode {
  if (
    raw === "focus" ||
    raw === "screen" ||
    raw === "action" ||
    raw === "closed" ||
    raw === "all"
  )
    return raw;
  // Default depends on context. Main pipeline: "focus" pushes the analyst
  // toward action. Batch mode: "all" because the analyst explicitly pulled
  // the batch and wants full visibility; chips still let them narrow to
  // watchlist-only ("focus") when hunting for new info on known properties.
  return batchMode ? "all" : "focus";
}

export default async function PipelinePage({
  searchParams,
}: PipelinePageProps) {
  noStore();

  const resolved = searchParams ? await searchParams : undefined;
  const batchId = resolved?.batchId;
  const viewMode = parseViewMode(resolved?.view, Boolean(batchId));
  const cityFilter = resolved?.city ?? "all";
  const typeFilter = resolved?.propertyType ?? "all";
  const primeFilter = resolved?.prime ?? "all";
  const includePassed = resolved?.passed === "1";
  const mlsStatusFilter = resolved?.mlsStatus ?? "all";
  const sort = resolved?.sort ?? "gap_desc";
  const page = Math.max(1, Number(resolved?.page ?? "1") || 1);
  const listingDays = resolved?.listingDays ? parseInt(resolved.listingDays, 10) : null;
  const screenedDays = resolved?.screenedDays ? parseInt(resolved.screenedDays, 10) : null;
  const priceLow = resolved?.priceLow ? parseInt(resolved.priceLow, 10) : null;
  const priceHigh = resolved?.priceHigh ? parseInt(resolved.priceHigh, 10) : null;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;

  const listingDaysCutoffIso = (() => {
    if (!listingDays || listingDays <= 0) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (listingDays - 1));
    cutoff.setHours(0, 0, 0, 0);
    return cutoff.toISOString().slice(0, 10);
  })();

  const [
    { data: cityRows },
    { data: typeRows },
    { data: statusRows },
    batchResult,
  ] = await Promise.all([
    supabase.from("property_city_options_v").select("city").order("city", { ascending: true }).range(0, 500),
    supabase.from("property_type_options_v").select("property_type").order("property_type", { ascending: true }).range(0, 100),
    supabase.from("mls_status_counts_v").select("mls_status").order("mls_status", { ascending: true }),
    batchId
      ? supabase.from("screening_batches").select("id, name, status, total_subjects, prime_candidate_count, screened_count, completed_at, source_import_batch_id, created_at").eq("id", batchId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const cities = (cityRows ?? []).map((r: { city: string }) => r.city).filter(Boolean);
  const propertyTypes = (typeRows ?? []).map((r: { property_type: string }) => r.property_type).filter(Boolean);
  const mlsStatuses = (statusRows ?? []).map((r: { mls_status: string }) => r.mls_status).filter(Boolean);
  const batchMeta = batchResult.data as
    | {
        id: string;
        name: string;
        status: string;
        total_subjects: number | null;
        prime_candidate_count: number | null;
        screened_count: number | null;
        completed_at: string | null;
        source_import_batch_id: string | null;
        created_at: string;
      }
    | null;
  const batchIsActive =
    batchMeta?.status === "running" || batchMeta?.status === "pending";
  const batchCanCancel = batchMeta != null && batchMeta.status !== "complete";

  // --------------------------------------------------------------------
  // Main query against screening_pipeline_v (migration 20260424130000).
  // --------------------------------------------------------------------

  let query = supabase.from("screening_pipeline_v").select("*");

  // Batch mode: show ALL results in this batch, including stale/non-latest
  // ones (user explicit preference — if you pulled the batch, every
  // property in it should stay visible). Otherwise restrict to latest per
  // property via the maintained flag.
  if (batchId) {
    query = query.eq("screening_batch_id", batchId);
  } else {
    query = query.eq("is_latest_for_property", true);
  }

  // View-mode partitioning. Applies in both default and batch mode —
  // batch mode just defaults to "all" rather than "focus" so the user
  // sees the full batch unless they opt to narrow it.
  //   focus  = watch-list + anything the caller is actively working on
  //   screen = fresh, unreviewed, not mine
  //   action = my watch-list items with pending showing/offer
  //   all    = everything (modulo passed/filters)
  switch (viewMode) {
    case "focus":
      query = query.eq("has_caller_active_analysis", true);
      break;
    case "screen":
      query = query
        .eq("has_caller_active_analysis", false)
        .is("review_action", null);
      break;
    case "action":
      query = query
        .eq("has_caller_active_analysis", true)
        .eq("caller_active_disposition", "active")
        .or("caller_active_showing_status.not.is.null,caller_active_offer_status.not.is.null");
      break;
    case "closed":
      query = query
        .eq("has_caller_active_analysis", true)
        .eq("caller_active_disposition", "closed");
      break;
    case "all":
    default:
      // no view-mode filter
      break;
  }

  if (cityFilter !== "all") query = query.eq("subject_city", cityFilter);
  if (typeFilter !== "all") query = query.eq("subject_property_type", typeFilter);
  if (primeFilter === "true") query = query.eq("is_prime_candidate", true);
  // Passed hidden by default; ?passed=1 surfaces them for archival lookup.
  if (!includePassed) query = query.or("review_action.is.null,review_action.neq.passed");
  if (mlsStatusFilter !== "all") query = query.eq("latest_mls_status", mlsStatusFilter);
  if (listingDaysCutoffIso) query = query.gte("latest_listing_contract_date", listingDaysCutoffIso);
  if (screenedDays && screenedDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (screenedDays - 1));
    cutoff.setHours(0, 0, 0, 0);
    query = query.gte("screening_updated_at", cutoff.toISOString());
  }
  if (priceLow && priceLow > 0) query = query.gte("subject_list_price", priceLow);
  if (priceHigh && priceHigh > 0) query = query.lte("subject_list_price", priceHigh);

  switch (sort) {
    case "gap_desc":         query = query.order("est_gap_per_sqft",   { ascending: false, nullsFirst: false }); break;
    case "offer_pct_desc":   query = query.order("offer_pct",          { ascending: false, nullsFirst: false }); break;
    case "spread_desc":      query = query.order("spread",             { ascending: false, nullsFirst: false }); break;
    case "arv_desc":         query = query.order("arv_aggregate",      { ascending: false, nullsFirst: false }); break;
    case "offer_desc":       query = query.order("max_offer",          { ascending: false, nullsFirst: false }); break;
    case "rehab_asc":        query = query.order("rehab_total",        { ascending: true,  nullsFirst: false }); break;
    case "price_asc":        query = query.order("subject_list_price", { ascending: true,  nullsFirst: false }); break;
    default:                 query = query.order("est_gap_per_sqft",   { ascending: false, nullsFirst: false });
  }

  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: results, error } = await query;

  if (error) throw new Error(error.message);

  // ------------------------------------------------------------------
  // Follow-up batch queries scoped to the visible rows
  // ------------------------------------------------------------------

  const visiblePropertyIds = Array.from(
    new Set((results ?? []).map((r) => (r as { real_property_id: string }).real_property_id)),
  );

  const ownerNameById = new Map<string, string>();
  const foreignOwnerIdByPropertyId = new Map<string, string>();
  const screeningRunCountByPropertyId = new Map<string, number>();
  const analyzedAtByAnalysisId = new Map<string, string>();
  const sharesByAnalysisId = new Map<
    string,
    { count: number; latestSentAt: string | null }
  >();
  const nextShowingByAnalysisId = new Map<
    string,
    { scheduledAt: string; status: string | null }
  >();
  const openOfferByAnalysisId = new Map<
    string,
    { amount: number | null; status: string | null; deadlineAt: string | null }
  >();
  const acceptedOfferAnalysisIds = new Set<string>();
  const ucDateByPropertyId = new Map<string, string | null>();
  const domByPropertyId = new Map<string, number | null>();
  const physicalByPropertyId = new Map<
    string,
    {
      beds: number | null;
      baths: number | null;
      buildingSqft: number | null;
      yearBuilt: number | null;
    }
  >();
  const closeDateByPropertyId = new Map<string, string | null>();

  type RecentEvent = {
    event_type: string;
    before_value: unknown;
    after_value: unknown;
    detected_at: string;
  };
  const recentEventByPropertyId = new Map<string, RecentEvent>();

  if (visiblePropertyIds.length > 0) {
    // Collect caller-active analysis ids from the view's columns.
    const activeAnalysisIds = Array.from(
      new Set(
        (results ?? [])
          .map((r) => (r as { caller_active_analysis_id: string | null }).caller_active_analysis_id)
          .filter((v): v is string => v != null),
      ),
    );

    // 1. Screening run count per property.
    const runsPromise = supabase
      .from("screening_results")
      .select("real_property_id")
      .in("real_property_id", visiblePropertyIds);

    // 2. Recent property_events per property (latest N bounded).
    const eventsPromise = supabase
      .from("property_events")
      .select("real_property_id, event_type, before_value, after_value, detected_at")
      .in("real_property_id", visiblePropertyIds)
      .order("detected_at", { ascending: false })
      .limit(600);

    // 3. Latest MLS listing per property — UC + close dates + DOM source.
    const mlsPromise = supabase
      .from("mls_listings")
      .select("real_property_id, purchase_contract_date, close_date, listing_contract_date, created_at")
      .in("real_property_id", visiblePropertyIds)
      .order("listing_contract_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    // 3a. Property physical — powers the focus-view physical columns.
    const physicalPromise = supabase
      .from("property_physical")
      .select(
        "real_property_id, bedrooms_total, bathrooms_total, building_area_total_sqft, above_grade_finished_area_sqft, year_built",
      )
      .in("real_property_id", visiblePropertyIds);

    // 4. Shared-analysis attribution for "Reviewed by X" — non-self analyses.
    //    We pull analyses by property_id and filter to non-caller-owned ones
    //    to get owner names. This is separate from the caller-owned view
    //    columns above.
    const foreignAnalysesPromise = currentUserId
      ? supabase
          .from("analyses")
          .select("id, real_property_id, created_by_user_id")
          .in("real_property_id", visiblePropertyIds)
          .neq("created_by_user_id", currentUserId)
          .eq("is_archived", false)
      : Promise.resolve({ data: null });

    const [
      { data: runRows },
      { data: eventRows },
      { data: mlsRows },
      { data: physicalRows },
      { data: foreignAnalyses },
    ] = await Promise.all([
      runsPromise,
      eventsPromise,
      mlsPromise,
      physicalPromise,
      foreignAnalysesPromise,
    ]);

    for (const row of runRows ?? []) {
      const r = row as { real_property_id: string };
      screeningRunCountByPropertyId.set(
        r.real_property_id,
        (screeningRunCountByPropertyId.get(r.real_property_id) ?? 0) + 1,
      );
    }

    for (const row of eventRows ?? []) {
      const e = row as RecentEvent & { real_property_id: string };
      if (!recentEventByPropertyId.has(e.real_property_id)) {
        recentEventByPropertyId.set(e.real_property_id, {
          event_type: e.event_type,
          before_value: e.before_value,
          after_value: e.after_value,
          detected_at: e.detected_at,
        });
      }
    }

    const todayMs = Date.now();
    for (const row of mlsRows ?? []) {
      const m = row as {
        real_property_id: string;
        purchase_contract_date: string | null;
        close_date: string | null;
        listing_contract_date: string | null;
      };
      // First row per property wins (ordered by listing_contract_date desc).
      if (!ucDateByPropertyId.has(m.real_property_id)) {
        ucDateByPropertyId.set(m.real_property_id, m.purchase_contract_date);
        closeDateByPropertyId.set(m.real_property_id, m.close_date);

        // DOM — matches watch_list_v computation.
        let dom: number | null = null;
        if (m.purchase_contract_date && m.listing_contract_date) {
          dom = Math.max(
            0,
            Math.round(
              (new Date(m.purchase_contract_date).getTime() -
                new Date(m.listing_contract_date).getTime()) /
                86_400_000,
            ),
          );
        } else if (m.listing_contract_date) {
          dom = Math.max(
            0,
            Math.round(
              (todayMs - new Date(m.listing_contract_date).getTime()) / 86_400_000,
            ) + 1,
          );
        }
        domByPropertyId.set(m.real_property_id, dom);
      }
    }

    for (const row of physicalRows ?? []) {
      const p = row as {
        real_property_id: string;
        bedrooms_total: number | null;
        bathrooms_total: number | null;
        building_area_total_sqft: number | null;
        above_grade_finished_area_sqft: number | null;
        year_built: number | null;
      };
      physicalByPropertyId.set(p.real_property_id, {
        beds: p.bedrooms_total,
        baths: p.bathrooms_total,
        buildingSqft:
          p.building_area_total_sqft ?? p.above_grade_finished_area_sqft,
        yearBuilt: p.year_built,
      });
    }

    for (const row of foreignAnalyses ?? []) {
      const a = row as { id: string; real_property_id: string; created_by_user_id: string };
      // First foreign analysis per property wins for the "By X" label.
      if (!foreignOwnerIdByPropertyId.has(a.real_property_id)) {
        foreignOwnerIdByPropertyId.set(a.real_property_id, a.created_by_user_id);
      }
    }

    // Per-analysis enrichment for pills (restricted to caller's own).
    if (activeAnalysisIds.length > 0) {
      const manualPromise = supabase
        .from("manual_analysis")
        .select(
          "analysis_id, updated_at, analyst_condition, update_year_est, update_quality, uad_condition_manual, uad_updates_manual, arv_manual, margin_manual, rehab_manual, days_held_manual, rent_estimate_monthly, design_rating, location_rating",
        )
        .in("analysis_id", activeAnalysisIds);

      const sharesPromise = supabase
        .from("analysis_shares")
        .select("analysis_id, sent_at, is_active")
        .in("analysis_id", activeAnalysisIds)
        .eq("is_active", true);

      const showingsPromise = supabase
        .from("analysis_showings")
        .select("analysis_id, scheduled_at, status")
        .in("analysis_id", activeAnalysisIds)
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: true });

      // All offers — the loop categorizes into open (pending work on the
      // Action pill) vs accepted (drives Won pill for closed deals).
      const offersPromise = supabase
        .from("analysis_offers")
        .select("analysis_id, offer_amount, status, submitted_at, deadline_at, accepted_at, expired_at")
        .in("analysis_id", activeAnalysisIds)
        .order("submitted_at", { ascending: false });

      const [
        { data: manualRows },
        { data: shareRows },
        { data: showingRows },
        { data: offerRows },
      ] = await Promise.all([manualPromise, sharesPromise, showingsPromise, offersPromise]);

      for (const row of manualRows ?? []) {
        const r = row as Record<string, unknown>;
        const hasJudgement = MANUAL_ANALYSIS_JUDGEMENT_COLUMNS.some(
          (col) => r[col] !== null && r[col] !== undefined && r[col] !== "",
        );
        if (hasJudgement) {
          analyzedAtByAnalysisId.set(
            r.analysis_id as string,
            (r.updated_at as string | null) ?? "",
          );
        }
      }

      for (const row of shareRows ?? []) {
        const r = row as { analysis_id: string; sent_at: string };
        const prior = sharesByAnalysisId.get(r.analysis_id);
        if (!prior) {
          sharesByAnalysisId.set(r.analysis_id, { count: 1, latestSentAt: r.sent_at });
        } else {
          sharesByAnalysisId.set(r.analysis_id, {
            count: prior.count + 1,
            latestSentAt:
              prior.latestSentAt && prior.latestSentAt >= r.sent_at
                ? prior.latestSentAt
                : r.sent_at,
          });
        }
      }

      const nowIso = new Date().toISOString();
      for (const row of showingRows ?? []) {
        const r = row as { analysis_id: string; scheduled_at: string; status: string | null };
        if (r.scheduled_at < nowIso) continue;
        if (!nextShowingByAnalysisId.has(r.analysis_id)) {
          nextShowingByAnalysisId.set(r.analysis_id, {
            scheduledAt: r.scheduled_at,
            status: r.status,
          });
        }
      }

      for (const row of offerRows ?? []) {
        const r = row as {
          analysis_id: string;
          offer_amount: number | null;
          status: string | null;
          deadline_at: string | null;
          accepted_at: string | null;
          expired_at: string | null;
        };
        if (r.accepted_at) {
          acceptedOfferAnalysisIds.add(r.analysis_id);
          continue;
        }
        // Open = neither accepted nor expired. Keep the most recent (the
        // query orders by submitted_at DESC).
        if (r.expired_at) continue;
        if (!openOfferByAnalysisId.has(r.analysis_id)) {
          openOfferByAnalysisId.set(r.analysis_id, {
            amount: r.offer_amount,
            status: r.status,
            deadlineAt: r.deadline_at,
          });
        }
      }
    }

    // Profile names for foreign-analysis owners.
    const foreignOwnerIds = Array.from(
      new Set(Array.from(foreignOwnerIdByPropertyId.values())),
    );
    if (foreignOwnerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", foreignOwnerIds);
      for (const p of profiles ?? []) {
        const row = p as { id: string; full_name: string | null; email: string };
        ownerNameById.set(row.id, row.full_name || row.email);
      }
    }
  }

  const totalCount = results?.length ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const defaultView: ViewMode = batchMeta ? "all" : "focus";
  const currentParams = {
    view: viewMode !== defaultView ? viewMode : undefined,
    batchId,
    city: cityFilter !== "all" ? cityFilter : undefined,
    propertyType: typeFilter !== "all" ? typeFilter : undefined,
    prime: primeFilter !== "all" ? primeFilter : undefined,
    passed: includePassed ? "1" : undefined,
    mlsStatus: mlsStatusFilter !== "all" ? mlsStatusFilter : undefined,
    sort: sort !== "gap_desc" ? sort : undefined,
  };

  const sortOptions = [
    { value: "gap_desc", label: "Gap (List) $/sqft" },
    { value: "offer_pct_desc", label: "Offer %" },
    { value: "spread_desc", label: "Spread" },
    { value: "arv_desc", label: "ARV" },
    { value: "offer_desc", label: "Max Offer" },
    { value: "rehab_asc", label: "Rehab (low)" },
    { value: "price_asc", label: "Price (low)" },
  ];

  // Shape rows for client component.
  const tableRows = (results ?? []).map((r: Record<string, unknown>) => {
    const propertyId = r.real_property_id as string;
    const callerAnalysisId = r.caller_active_analysis_id as string | null;
    const foreignOwnerId = callerAnalysisId
      ? null
      : foreignOwnerIdByPropertyId.get(propertyId) ?? null;

    const analyzedAt = callerAnalysisId ? analyzedAtByAnalysisId.get(callerAnalysisId) ?? null : null;
    const share = callerAnalysisId ? sharesByAnalysisId.get(callerAnalysisId) ?? null : null;
    const showing = callerAnalysisId ? nextShowingByAnalysisId.get(callerAnalysisId) ?? null : null;
    const offer = callerAnalysisId ? openOfferByAnalysisId.get(callerAnalysisId) ?? null : null;
    const recentEvent = recentEventByPropertyId.get(propertyId) ?? null;

    return {
      id: r.id as string,
      real_property_id: propertyId,
      screening_batch_id: r.screening_batch_id as string,
      is_prime_candidate: r.is_prime_candidate as boolean,
      subject_address: r.subject_address as string,
      subject_city: r.subject_city as string,
      subject_property_type: r.subject_property_type as string | null,
      subject_list_price: r.subject_list_price as number | null,
      mls_status: r.latest_mls_status as string | null,
      mls_major_change_type: r.latest_mls_major_change_type as string | null,
      listing_contract_date: r.latest_listing_contract_date as string | null,
      uc_date: ucDateByPropertyId.get(propertyId) ?? null,
      close_date: closeDateByPropertyId.get(propertyId) ?? null,
      arv_aggregate: r.arv_aggregate as number | null,
      trend_annual_rate: r.trend_annual_rate as number | null,
      trend_raw_rate: r.trend_raw_rate as number | null,
      trend_confidence: r.trend_confidence as string | null,
      trend_detail_json: r.trend_detail_json as Record<string, unknown> | null,
      spread: r.spread as number | null,
      est_gap_per_sqft: r.est_gap_per_sqft as number | null,
      arv_comp_count: r.arv_comp_count as number | null,
      rehab_total: r.rehab_total as number | null,
      hold_total: r.hold_total as number | null,
      max_offer: r.max_offer as number | null,
      offer_pct: r.offer_pct as number | null,
      promoted_analysis_id: r.promoted_analysis_id as string | null,
      comp_search_run_id: r.comp_search_run_id as string | null,
      review_action: r.review_action as string | null,
      has_active_analysis: callerAnalysisId != null || foreignOwnerId != null,
      active_analysis_id: callerAnalysisId,
      active_lifecycle_stage: r.caller_active_lifecycle_stage as string | null,
      active_interest_level: r.caller_active_interest_level as string | null,
      active_analysis_is_mine:
        callerAnalysisId != null ? true : foreignOwnerId ? false : null,
      active_analysis_owner_name: foreignOwnerId
        ? ownerNameById.get(foreignOwnerId) ?? null
        : null,
      has_newer_screening_than_analysis: false,

      screening_run_count: screeningRunCountByPropertyId.get(propertyId) ?? 0,
      analyzed_updated_at: analyzedAt,
      share_count: share?.count ?? 0,
      latest_share_at: share?.latestSentAt ?? null,
      next_showing_at: showing?.scheduledAt ?? null,
      next_showing_status: showing?.status ?? null,
      open_offer_amount: offer?.amount ?? null,
      open_offer_status: offer?.status ?? null,
      open_offer_deadline: offer?.deadlineAt ?? null,
      recent_event: recentEvent,

      // Step 4 — disposition + Won/Lost signal for single-pill rendering.
      active_disposition: callerAnalysisId
        ? (r.caller_active_disposition as string | null)
        : null,
      has_accepted_offer: callerAnalysisId
        ? acceptedOfferAnalysisIds.has(callerAnalysisId)
        : false,

      // Physical columns (rendered only when view=focus).
      beds_total: physicalByPropertyId.get(propertyId)?.beds ?? null,
      baths_total: physicalByPropertyId.get(propertyId)?.baths ?? null,
      building_sqft: physicalByPropertyId.get(propertyId)?.buildingSqft ?? null,
      year_built: physicalByPropertyId.get(propertyId)?.yearBuilt ?? null,
      dom: domByPropertyId.get(propertyId) ?? null,
    };
  });

  return (
    <section className="dw-section-stack-compact">
      <div>
        {batchMeta && (
          <Link href="/intake/imports" className="text-xs text-blue-600 hover:underline">
            &larr; Back to Imports
          </Link>
        )}
        <h1 className="dw-page-title mt-1">
          {batchMeta ? `Batch: ${batchMeta.name}` : "Pipeline"}
        </h1>
        <p className="dw-page-copy">
          {batchMeta ? (
            <>
              {formatNumber(batchMeta.total_subjects)} subjects &middot;{" "}
              {formatNumber(batchMeta.screened_count)} screened &middot;{" "}
              <span className="font-semibold text-emerald-700">
                {formatNumber(batchMeta.prime_candidate_count)} Prime Candidates
              </span>{" "}
              &middot; <LocalTimestamp value={batchMeta.completed_at} />{" "}
              &middot;{" "}
              <Link
                href={buildHref("/pipeline", { ...currentParams, batchId: undefined })}
                className="text-blue-600 hover:underline"
              >
                Clear batch filter
              </Link>
              {totalCount > 0 && <> &middot; {formatNumber(totalCount)} showing</>}
            </>
          ) : (
            <>
              Every property you&apos;ve touched — filter by mode.
              {totalCount > 0 && <> &middot; {formatNumber(totalCount)} rows</>}
            </>
          )}
        </p>
      </div>

      {/* Batch-mode-only controls */}
      {batchMeta && batchIsActive && (
        <BatchProgressTracker
          batchId={batchMeta.id}
          initialTotalSubjects={batchMeta.total_subjects ?? 0}
          initialScreenedCount={batchMeta.screened_count ?? 0}
          initialPrimeCount={batchMeta.prime_candidate_count ?? 0}
          initialStatus={batchMeta.status}
        />
      )}

      {batchMeta && batchMeta.status === "error" && !batchIsActive && (
        <div className="dw-card-tight border-red-200 bg-red-50 text-sm text-red-800">
          This batch errored during screening. You can cancel it below and
          start a new screen, or retry from the tracker above.
        </div>
      )}

      {batchCanCancel && batchMeta && (
        <form action={cancelScreeningBatchAction} className="flex justify-end">
          <input type="hidden" name="batch_id" value={batchMeta.id} />
          <input type="hidden" name="redirect_to" value="/intake/imports" />
          <button type="submit" className="text-xs text-red-600 hover:underline">
            Cancel and delete this batch
          </button>
        </form>
      )}

      {batchMeta?.source_import_batch_id && (
        <div className="dw-card-tight border-blue-200 bg-blue-50 text-sm text-blue-800">
          Screened from{" "}
          <Link href="/intake/imports" className="font-medium text-blue-700 hover:underline">
            import batch
          </Link>
          {" · "}{formatNumber(batchMeta.total_subjects)} listings from import
        </div>
      )}

      {/* View-mode chips. Default is "focus" on /pipeline and "all" in
          batch mode; omitting the param gives you the default. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">View:</span>
        {VIEW_MODES.map((m) => {
          return (
            <Link
              key={m.value}
              href={buildHref("/pipeline", {
                ...currentParams,
                view: m.value === defaultView ? undefined : m.value,
                page: undefined,
              })}
              title={m.hint}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === m.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {m.label}
            </Link>
          );
        })}
      </div>

      {/* Auto Filter Buttons */}
      <AutoFilterButtons />

      {/* Filters */}
      <form method="get" className="dw-card-tight flex flex-wrap items-end gap-3">
        {viewMode !== "focus" && <input type="hidden" name="view" value={viewMode} />}
        {batchId && <input type="hidden" name="batchId" value={batchId} />}

        <div>
          <label className="dw-label" htmlFor="city">City</label>
          <select id="city" name="city" className="dw-select" defaultValue={cityFilter}>
            <option value="all">All Cities</option>
            {cities.map((c: string) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="dw-label" htmlFor="propertyType">Type</label>
          <select id="propertyType" name="propertyType" className="dw-select" defaultValue={typeFilter}>
            <option value="all">All Types</option>
            {propertyTypes.map((t: string) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="dw-label" htmlFor="prime">Prime</label>
          <select id="prime" name="prime" className="dw-select" defaultValue={primeFilter}>
            <option value="all">All</option>
            <option value="true">Prime Only</option>
          </select>
        </div>

        <div>
          <label className="dw-label" htmlFor="mlsStatus">MLS Status</label>
          <select id="mlsStatus" name="mlsStatus" className="dw-select" defaultValue={mlsStatusFilter}>
            <option value="all">All Statuses</option>
            {mlsStatuses.map((s: string) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="dw-label" htmlFor="passed">Passed</label>
          <select id="passed" name="passed" className="dw-select" defaultValue={includePassed ? "1" : "0"}>
            <option value="0">Hide passed</option>
            <option value="1">Include passed</option>
          </select>
        </div>

        {sort !== "gap_desc" && (
          <input type="hidden" name="sort" value={sort} />
        )}

        <button type="submit" className="dw-button-secondary">
          Filter
        </button>
      </form>

      {/* Sort controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">Sort:</span>
        {sortOptions.map((opt) => (
          <Link
            key={opt.value}
            href={buildHref("/pipeline", { ...currentParams, sort: opt.value })}
            className={`rounded px-2 py-0.5 text-xs ${
              sort === opt.value
                ? "bg-blue-100 font-semibold text-blue-800"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {/* Results table — focus view surfaces physical columns (beds,
          baths, bldg SF, year, DOM) for watch-list scanning. */}
      <QueueResultsTable
        results={tableRows}
        showPhysicalColumns={viewMode === "focus"}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={buildHref("/pipeline", { ...currentParams, page: String(page - 1) })}
              className="text-blue-600 hover:underline"
            >
              ← Prev
            </Link>
          )}
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildHref("/pipeline", { ...currentParams, page: String(page + 1) })}
              className="text-blue-600 hover:underline"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
