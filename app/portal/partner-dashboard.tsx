// Phase 1 Step 4F — PartnerDashboard client component.
//
// The partner's workspace — all shared analyses organized by status
// lanes per the 4F vision in PHASE1_STEP4_IMPLEMENTATION.md.
//
// Status lanes:
//   New      — shared but never viewed (no first_viewed_at)
//   Watching — viewed but no final feedback
//   Interested — feedback = interested / showing_request / discussion_request
//   Passed   — feedback = pass
//   All      — everything

"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  PartnerDashboardData,
  PartnerDashboardDeal,
} from "@/lib/partner-portal/load-partner-dashboard-data";

type Lane = "new" | "watching" | "interested" | "passed" | "all";

function classifyDeal(deal: PartnerDashboardDeal): Lane {
  if (!deal.isActive) return "passed";
  if (deal.feedbackAction === "pass") return "passed";
  if (
    deal.feedbackAction === "interested" ||
    deal.feedbackAction === "showing_request" ||
    deal.feedbackAction === "discussion_request"
  )
    return "interested";
  if (!deal.firstViewedAt) return "new";
  return "watching";
}

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const LANE_LABELS: Record<Lane, string> = {
  new: "New",
  watching: "Watching",
  interested: "Interested",
  passed: "Passed",
  all: "All",
};

const FEEDBACK_BADGE: Record<
  string,
  { label: string; color: string }
> = {
  interested: { label: "Interested", color: "bg-emerald-100 text-emerald-700" },
  showing_request: {
    label: "Showing Request",
    color: "bg-blue-100 text-blue-700",
  },
  discussion_request: {
    label: "Discussion Request",
    color: "bg-amber-100 text-amber-700",
  },
  pass: { label: "Passed", color: "bg-red-100 text-red-700" },
};

type PartnerDashboardProps = {
  data: PartnerDashboardData;
};

export function PartnerDashboard({ data }: PartnerDashboardProps) {
  const [activeLane, setActiveLane] = useState<Lane>("all");

  const laneCounts: Record<Lane, number> = {
    new: 0,
    watching: 0,
    interested: 0,
    passed: 0,
    all: data.deals.length,
  };
  for (const deal of data.deals) {
    laneCounts[classifyDeal(deal)]++;
  }

  const filteredDeals =
    activeLane === "all"
      ? data.deals
      : data.deals.filter((d) => classifyDeal(d) === activeLane);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-slate-900">
          Partner Workspace
        </h1>
        <p className="text-xs text-slate-500">
          Deals shared with {data.partnerEmail} ·{" "}
          {data.deals.length} total
        </p>
      </div>

      {/* Lane tabs */}
      <div className="flex gap-1">
        {(Object.keys(LANE_LABELS) as Lane[]).map((lane) => (
          <button
            key={lane}
            type="button"
            onClick={() => setActiveLane(lane)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              activeLane === lane
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {LANE_LABELS[lane]}{" "}
            <span
              className={
                activeLane === lane ? "text-slate-300" : "text-slate-400"
              }
            >
              ({laneCounts[lane]})
            </span>
          </button>
        ))}
      </div>

      {/* Deal cards */}
      {filteredDeals.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">
          {activeLane === "all"
            ? "No deals have been shared with you yet."
            : `No deals in the "${LANE_LABELS[activeLane]}" category.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDeals.map((deal) => (
            <DealCard key={deal.shareId} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}

function DealCard({ deal }: { deal: PartnerDashboardDeal }) {
  const lane = classifyDeal(deal);
  const fb = deal.feedbackAction
    ? FEEDBACK_BADGE[deal.feedbackAction]
    : null;

  return (
    <div
      className={`rounded-lg border bg-white px-4 py-3 shadow-sm ${
        lane === "new"
          ? "border-blue-200"
          : lane === "interested"
            ? "border-emerald-200"
            : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {lane === "new" && (
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            )}
            <h3 className="truncate text-sm font-semibold text-slate-900">
              {deal.address}
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            {deal.city}
            {deal.state ? `, ${deal.state}` : ""}
          </p>
        </div>

        <Link
          href={`/portal/deals/${deal.shareToken}`}
          className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
        >
          Open →
        </Link>
      </div>

      {/* Deal stats */}
      <div className="mt-2 flex gap-4 text-[11px]">
        <span>
          <span className="text-slate-500">ARV: </span>
          <span className="font-mono font-semibold text-slate-800">
            {fmt(deal.arv)}
          </span>
        </span>
        <span>
          <span className="text-slate-500">Max Offer: </span>
          <span className="font-mono font-semibold text-slate-800">
            {fmt(deal.maxOffer)}
          </span>
        </span>
        <span>
          <span className="text-slate-500">Offer%: </span>
          <span className="font-mono font-semibold text-slate-800">
            {fmtPct(deal.offerPct)}
          </span>
        </span>
        {deal.listPrice && (
          <span>
            <span className="text-slate-500">List: </span>
            <span className="font-mono text-slate-700">
              {fmt(deal.listPrice)}
            </span>
          </span>
        )}
      </div>

      {/* Message from analyst */}
      {deal.message && (
        <div className="mt-1.5 text-[11px] italic text-slate-500">
          &ldquo;{deal.message}&rdquo;
        </div>
      )}

      {/* Footer: timing + feedback badge */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <div className="flex gap-3">
          <span>Shared {timeAgo(deal.sentAt)}</span>
          {deal.viewCount > 0 && (
            <span>
              {deal.viewCount} view{deal.viewCount !== 1 ? "s" : ""}
            </span>
          )}
          {deal.lastViewedAt && (
            <span>Last viewed {timeAgo(deal.lastViewedAt)}</span>
          )}
        </div>
        {fb && (
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${fb.color}`}
          >
            {fb.label}
          </span>
        )}
      </div>
    </div>
  );
}
