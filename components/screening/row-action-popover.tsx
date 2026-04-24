"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { QueueResultRow } from "./queue-results-table";
import {
  updateInterestLevelAction,
  updateShowingStatusAction,
  updateWatchListNoteAction,
  passFromWatchListAction,
  moveToPipelineAction,
} from "@/app/(workspace)/deals/watchlist/actions";
import {
  advancePipelineStageAction,
  closeDealAction,
  moveToWatchListAction,
} from "@/app/(workspace)/deals/pipeline/actions";
import {
  promoteInPlaceAction,
  passOnScreeningResultAction,
  reactivateScreeningResultFormAction,
} from "@/app/(workspace)/screening/actions";

type RowActionPopoverProps = {
  row: QueueResultRow;
  anchorRect: DOMRect | null;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Positioning helper — simple fixed-position box anchored below the pill.
// ---------------------------------------------------------------------------

function positionStyle(anchorRect: DOMRect | null): React.CSSProperties {
  if (!anchorRect) return { top: 0, left: 0 };
  const POPOVER_WIDTH = 300;
  const MARGIN = 6;
  // Try to place below the anchor; if it'd overflow, flip above.
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const estimatedHeight = 320;
  let top = anchorRect.bottom + MARGIN;
  if (top + estimatedHeight > viewportHeight) {
    top = Math.max(MARGIN, anchorRect.top - estimatedHeight - MARGIN);
  }
  let left = anchorRect.left;
  if (left + POPOVER_WIDTH > viewportWidth) {
    left = Math.max(MARGIN, viewportWidth - POPOVER_WIDTH - MARGIN);
  }
  return { top, left, width: POPOVER_WIDTH };
}

// ---------------------------------------------------------------------------
// Stage classification — keep in sync with resolveStagePill.
// ---------------------------------------------------------------------------

type RowStage =
  | "foreign_active"
  | "closed"
  | "offer_open"
  | "showing"
  | "analyzed"
  | "watchlist"
  | "passed"
  | "screened";

function classify(row: QueueResultRow): RowStage {
  if (row.active_analysis_is_mine === false) return "foreign_active";
  const callerActive = row.active_analysis_is_mine === true && row.active_analysis_id != null;
  if (callerActive) {
    if (row.active_disposition === "closed") return "closed";
    if (row.open_offer_amount != null || row.open_offer_status) return "offer_open";
    if (row.next_showing_at) return "showing";
    if (row.analyzed_updated_at) return "analyzed";
    return "watchlist";
  }
  if (row.review_action === "passed") return "passed";
  return "screened";
}

// ---------------------------------------------------------------------------
// Shared reason options (mirrors /deals/watchlist defaults)
// ---------------------------------------------------------------------------

const PASS_REASONS = [
  "Overpriced",
  "Bad location",
  "Heavy rehab",
  "Structural issue",
  "Not a flip profile",
  "Other",
];

const INTEREST_LEVELS = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "curious", label: "Curious" },
  { value: "new", label: "New" },
];

const SHOWING_STATUS_OPTIONS = [
  { value: "", label: "—" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RowActionPopover({
  row,
  anchorRect,
  onClose,
}: RowActionPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const stage = classify(row);
  const analysisId = row.active_analysis_id;

  return (
    <div
      ref={ref}
      role="dialog"
      className="fixed z-50 rounded-md border border-slate-200 bg-white shadow-xl"
      style={positionStyle(anchorRect)}
    >
      {/* Header */}
      <div className="border-b border-slate-100 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">
          {stage.replace("_", " ")}
        </div>
        <div className="truncate text-sm font-semibold text-slate-900">
          {row.subject_address}
        </div>
        <div className="text-[11px] text-slate-500">{row.subject_city}</div>
      </div>

      {/* Actions — scroll if overflow */}
      <div className="max-h-[380px] overflow-y-auto px-3 py-2 space-y-2 text-[12px]">
        {/* Open analysis (if any) */}
        {analysisId && (
          <Link
            href={`/analysis/${analysisId}`}
            className="block rounded bg-blue-600 px-2 py-1.5 text-center text-xs font-semibold text-white hover:bg-blue-700"
          >
            Open Analysis
          </Link>
        )}

        {/* ── Foreign active — read-only ─────────────────────────────── */}
        {stage === "foreign_active" && (
          <div className="text-[11px] text-slate-500">
            Another analyst ({row.active_analysis_owner_name ?? "unknown"}) is working
            on this property. Read-only.
          </div>
        )}

        {/* ── Screened only — promote / pass ─────────────────────────── */}
        {stage === "screened" && (
          <>
            <form action={promoteInPlaceAction} className="space-y-1">
              <input type="hidden" name="result_id" value={row.id} />
              <input type="hidden" name="open_workstation" value="false" />
              <label className="text-[10px] uppercase tracking-wide text-slate-500">
                Promote to Watch List
              </label>
              <div className="flex items-center gap-1">
                <select
                  name="interest_level"
                  defaultValue="warm"
                  className="flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
                >
                  {INTEREST_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Promote
                </button>
              </div>
            </form>

            <form action={passOnScreeningResultAction} className="space-y-1">
              <input type="hidden" name="result_id" value={row.id} />
              <label className="text-[10px] uppercase tracking-wide text-slate-500">
                Pass
              </label>
              <div className="flex items-center gap-1">
                <select
                  name="pass_reason"
                  required
                  className="flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
                  defaultValue=""
                >
                  <option value="" disabled>Reason…</option>
                  {PASS_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Pass
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── Passed — reactivate ────────────────────────────────────── */}
        {stage === "passed" && (
          <form action={reactivateScreeningResultFormAction}>
            <input type="hidden" name="result_id" value={row.id} />
            <button
              type="submit"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reactivate
            </button>
          </form>
        )}

        {/* ── Caller active (any stage) — interest / showing / note ──── */}
        {analysisId &&
          (stage === "watchlist" ||
            stage === "analyzed" ||
            stage === "showing" ||
            stage === "offer_open") && (
            <>
              <form action={updateInterestLevelAction} className="space-y-1">
                <input type="hidden" name="analysis_id" value={analysisId} />
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  Interest
                </label>
                <div className="flex items-center gap-1">
                  <select
                    name="interest_level"
                    defaultValue={row.active_interest_level ?? "warm"}
                    className="flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
                  >
                    {INTEREST_LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    Save
                  </button>
                </div>
              </form>

              <form action={updateShowingStatusAction} className="space-y-1">
                <input type="hidden" name="analysis_id" value={analysisId} />
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  Showing
                </label>
                <div className="flex items-center gap-1">
                  <select
                    name="showing_status"
                    defaultValue={row.next_showing_status ?? ""}
                    className="flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
                  >
                    {SHOWING_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    Save
                  </button>
                </div>
              </form>

              <form action={updateWatchListNoteAction} className="space-y-1">
                <input type="hidden" name="analysis_id" value={analysisId} />
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  Note
                </label>
                <textarea
                  name="watch_list_note"
                  rows={2}
                  className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
                  placeholder="Short note…"
                />
                <button
                  type="submit"
                  className="w-full rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Save Note
                </button>
              </form>
            </>
          )}

        {/* ── Stage progression ──────────────────────────────────────── */}
        {analysisId && stage === "watchlist" && (
          <form action={moveToPipelineAction}>
            <input type="hidden" name="analysis_id" value={analysisId} />
            <button
              type="submit"
              className="w-full rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Move to Pipeline →
            </button>
          </form>
        )}

        {analysisId && stage === "showing" && (
          <form action={advancePipelineStageAction}>
            <input type="hidden" name="analysis_id" value={analysisId} />
            <input type="hidden" name="next_stage" value="offer" />
            <button
              type="submit"
              className="w-full rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Advance to Offer →
            </button>
          </form>
        )}

        {analysisId && stage === "offer_open" && (
          <form action={advancePipelineStageAction}>
            <input type="hidden" name="analysis_id" value={analysisId} />
            <input type="hidden" name="next_stage" value="under_contract" />
            <button
              type="submit"
              className="w-full rounded border border-purple-300 bg-purple-50 px-2 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-100"
            >
              Advance to Under Contract →
            </button>
          </form>
        )}

        {/* ── Close deal (active stages past watchlist) ──────────────── */}
        {analysisId &&
          (stage === "showing" || stage === "offer_open") && (
            <details className="rounded border border-slate-200 bg-slate-50 p-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                Close deal…
              </summary>
              <form action={closeDealAction} className="mt-2 space-y-1">
                <input type="hidden" name="analysis_id" value={analysisId} />
                <div className="flex gap-1">
                  <label className="flex-1">
                    <input type="radio" name="outcome" value="won" required className="mr-1" />
                    Won
                  </label>
                  <label className="flex-1">
                    <input type="radio" name="outcome" value="lost" className="mr-1" />
                    Lost
                  </label>
                </div>
                <input
                  name="reason"
                  placeholder="Reason (optional)"
                  className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
                />
                <button
                  type="submit"
                  className="w-full rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Close Deal
                </button>
              </form>
            </details>
          )}

        {/* ── Closed — re-open ───────────────────────────────────────── */}
        {analysisId && stage === "closed" && (
          <form action={moveToWatchListAction}>
            <input type="hidden" name="analysis_id" value={analysisId} />
            <button
              type="submit"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Re-open to Watch List
            </button>
          </form>
        )}

        {/* ── Pass (from any active stage) ───────────────────────────── */}
        {analysisId &&
          (stage === "watchlist" ||
            stage === "analyzed" ||
            stage === "showing" ||
            stage === "offer_open") && (
            <details className="rounded border border-slate-200 bg-slate-50 p-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                Pass (archive)…
              </summary>
              <form action={passFromWatchListAction} className="mt-2 space-y-1">
                <input type="hidden" name="analysis_id" value={analysisId} />
                <select
                  name="pass_reason"
                  required
                  defaultValue=""
                  className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
                >
                  <option value="" disabled>Reason…</option>
                  {PASS_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Pass
                </button>
              </form>
            </details>
          )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 px-3 py-1.5 text-right">
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
