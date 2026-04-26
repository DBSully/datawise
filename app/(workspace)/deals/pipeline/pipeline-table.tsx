"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  advancePipelineStageAction,
  updateOfferStatusAction,
  closeDealAction,
  moveToWatchListAction,
} from "./actions";
import { LocalTimestamp } from "@/components/common/local-timestamp";

type PipelineRow = {
  analysis_id: string;
  unparsed_address: string;
  city: string;
  property_type: string | null;
  lifecycle_stage: string;
  offer_status: string | null;
  showing_status: string | null;
  subject_list_price: number | null;
  current_list_price: number | null;
  arv_aggregate: number | null;
  max_offer: number | null;
  est_gap_per_sqft: number | null;
  offer_submitted_date: string | null;
  offer_deadline_date: string | null;
  offer_accepted_date: string | null;
  days_since_update: number | null;
  analyst_interest: string | null;
};

function $f(v: number | null | undefined) {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const STAGE_DISPLAY: Record<string, { label: string; color: string }> = {
  showing: { label: "Showing", color: "bg-blue-100 text-blue-800" },
  offer: { label: "Offer", color: "bg-amber-100 text-amber-800" },
  under_contract: { label: "Under Contract", color: "bg-purple-100 text-purple-800" },
};

const OFFER_STATUS_OPTIONS = [
  { value: "", label: "—" },
  { value: "drafting", label: "Drafting" },
  { value: "submitted", label: "Submitted" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

const INTEREST_ICONS: Record<string, string> = {
  hot: "🔴", warm: "🟡", watch: "🟢", new: "⚪",
};

export function PipelineTable({ rows }: { rows: PipelineRow[] }) {
  const router = useRouter();
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeOutcome, setCloseOutcome] = useState<"won" | "lost">("won");
  const [closeReason, setCloseReason] = useState("");

  const handleAdvance = useCallback(
    async (analysisId: string, nextStage: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("next_stage", nextStage);
      await advancePipelineStageAction(fd);
      router.refresh();
    },
    [router],
  );

  const handleOfferStatus = useCallback(
    async (analysisId: string, status: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("offer_status", status);
      await updateOfferStatusAction(fd);
      router.refresh();
    },
    [router],
  );

  const handleClose = useCallback(
    async (analysisId: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("outcome", closeOutcome);
      if (closeReason) fd.set("reason", closeReason);
      await closeDealAction(fd);
      setClosingId(null);
      setCloseReason("");
      router.refresh();
    },
    [closeOutcome, closeReason, router],
  );

  const handleBackToWatchList = useCallback(
    async (analysisId: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      await moveToWatchListAction(fd);
      router.refresh();
    },
    [router],
  );

  if (rows.length === 0) {
    return (
      <div className="dw-card py-12 text-center">
        <p className="text-sm text-slate-500">
          No deals in the pipeline. Move deals from the{" "}
          <Link href="/analysis" className="text-blue-600 hover:underline">
            Watch List
          </Link>{" "}
          when ready.
        </p>
      </div>
    );
  }

  return (
    <div className="dw-table-wrap">
      <table className="dw-table-compact min-w-[1300px]">
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th>Stage</th>
            <th>Address</th>
            <th>City</th>
            <th className="text-right">List</th>
            <th className="text-right">ARV</th>
            <th className="text-right">Max Offer</th>
            <th>Offer Status</th>
            <th>Submitted</th>
            <th>Deadline</th>
            <th className="text-right">Days Idle</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const stageInfo = STAGE_DISPLAY[r.lifecycle_stage] ?? {
              label: r.lifecycle_stage,
              color: "bg-slate-100 text-slate-600",
            };
            const isClosing = closingId === r.analysis_id;
            const listPrice = r.current_list_price ?? r.subject_list_price;

            return (
              <tr key={r.analysis_id}>
                <td className="text-center">
                  {INTEREST_ICONS[r.analyst_interest ?? "new"] ?? "⚪"}
                </td>
                <td>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${stageInfo.color}`}
                  >
                    {stageInfo.label}
                  </span>
                </td>
                <td className="font-medium">
                  <Link
                    href={`/analysis/${r.analysis_id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {r.unparsed_address}
                  </Link>
                </td>
                <td className="text-slate-500">{r.city}</td>
                <td className="text-right">{$f(listPrice)}</td>
                <td className="text-right font-medium text-emerald-700">
                  {$f(r.arv_aggregate)}
                </td>
                <td className="text-right font-medium">{$f(r.max_offer)}</td>
                <td>
                  <select
                    value={r.offer_status ?? ""}
                    onChange={(e) =>
                      handleOfferStatus(r.analysis_id, e.target.value)
                    }
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
                  >
                    {OFFER_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-xs text-slate-500">
                  <LocalTimestamp value={r.offer_submitted_date} format="date" />
                </td>
                <td className="text-xs text-slate-500">
                  <LocalTimestamp value={r.offer_deadline_date} format="date" />
                </td>
                <td
                  className={`text-right ${
                    (r.days_since_update ?? 0) >= 3
                      ? "font-semibold text-amber-700"
                      : "text-slate-500"
                  }`}
                >
                  {r.days_since_update ?? "—"}
                </td>
                <td>
                  {isClosing ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={closeOutcome}
                        onChange={(e) =>
                          setCloseOutcome(e.target.value as "won" | "lost")
                        }
                        className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
                      >
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                      </select>
                      {closeOutcome === "lost" && (
                        <input
                          type="text"
                          value={closeReason}
                          onChange={(e) => setCloseReason(e.target.value)}
                          placeholder="Reason..."
                          className="w-20 rounded border border-slate-200 px-1 py-0.5 text-[10px]"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleClose(r.analysis_id)}
                        className="text-[10px] font-semibold text-emerald-600"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setClosingId(null)}
                        className="text-[10px] text-slate-400"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {r.lifecycle_stage === "showing" && (
                        <button
                          type="button"
                          onClick={() => handleAdvance(r.analysis_id, "offer")}
                          className="text-[10px] font-semibold text-indigo-600 hover:underline"
                        >
                          → Offer
                        </button>
                      )}
                      {r.lifecycle_stage === "offer" && (
                        <button
                          type="button"
                          onClick={() =>
                            handleAdvance(r.analysis_id, "under_contract")
                          }
                          className="text-[10px] font-semibold text-indigo-600 hover:underline"
                        >
                          → Contract
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setClosingId(r.analysis_id)}
                        className="text-[10px] font-semibold text-emerald-600 hover:underline"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBackToWatchList(r.analysis_id)}
                        className="text-[10px] text-slate-400 hover:underline"
                      >
                        ← Watch
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
