// Phase 1 Step 3E.7.g — PipelineCardModal (editing with auto-persist).
//
// The Pipeline Status card's detail modal per WORKSTATION_CARD_SPEC.md §5.7.
// Editable: Showing Status select, Offer Status select, Watch List Note
// text. Each auto-persists via the existing per-field pipeline actions
// from deals/watchlist/actions.ts + deals/pipeline/actions.ts. Date fields
// (offer_submitted_date, offer_deadline_date) are read-only for now —
// they get set as side effects of the status actions.
//
// Footer: "Open in Action →" link per Decision 7.
//
// Per spec §5.7 note: Interest Level used to live in this card but moved
// to Tile 4 (Quick Status) per Dan's note. The Pipeline card now focuses
// purely on deal mechanics.

"use client";

import { useState } from "react";
import Link from "next/link";
import { useDebouncedSave } from "@/lib/auto-persist/use-debounced-save";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";
import { DetailModal } from "@/components/workstation/detail-modal";
import {
  updateShowingStatusAction,
  updateWatchListNoteAction,
} from "@/app/(workspace)/deals/watchlist/actions";
import {
  updateOfferStatusAction,
} from "@/app/(workspace)/deals/pipeline/actions";
import type { WorkstationData } from "@/lib/reports/types";

const SHOWING_OPTIONS = [
  "Not Scheduled",
  "Scheduled",
  "Complete",
  "Virtual Complete",
] as const;

const OFFER_OPTIONS = [
  "No Offer",
  "Drafting",
  "Submitted",
  "Accepted",
  "Expired",
  "Rejected",
] as const;

type PipelineCardModalProps = {
  data: WorkstationData;
  onClose: () => void;
};

export function PipelineCardModal({
  data,
  onClose,
}: PipelineCardModalProps) {
  const pl = data.pipeline;
  const analysisId = data.analysisId;

  const initialShowing = (pl?.showing_status as string | null) ?? null;
  const initialOffer = (pl?.offer_status as string | null) ?? null;
  const initialNote = (pl?.watch_list_note as string | null) ?? "";

  const [showingStatus, setShowingStatus] = useState<string | null>(
    initialShowing,
  );
  const [offerStatus, setOfferStatus] = useState<string | null>(initialOffer);
  const [watchListNote, setWatchListNote] = useState<string>(initialNote ?? "");

  // Dropdowns persist instantly (delayMs=0)
  const showingSave = useDebouncedSave(
    showingStatus,
    async (value) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("showing_status", value ?? "");
      await updateShowingStatusAction(fd);
    },
    { delayMs: 0 },
  );

  const offerSave = useDebouncedSave(
    offerStatus,
    async (value) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("offer_status", value ?? "");
      await updateOfferStatusAction(fd);
    },
    { delayMs: 0 },
  );

  // Watch list note debounces at 500ms (text input)
  const noteSave = useDebouncedSave(
    watchListNote,
    async (value) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("watch_list_note", value);
      await updateWatchListNoteAction(fd);
    },
  );

  // Read-only date fields from the pipeline record
  const offerSubmitted = (pl?.offer_submitted_date as string | null) ?? null;
  const offerDeadline = (pl?.offer_deadline_date as string | null) ?? null;

  return (
    <DetailModal title="Pipeline Status" onClose={onClose}>
      <div className="space-y-4">
        {/* Showing Status */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Showing Status
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <select
              value={showingStatus ?? ""}
              onChange={(e) =>
                setShowingStatus(e.target.value === "" ? null : e.target.value)
              }
              className="w-[180px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            >
              <option value="">(none)</option>
              {SHOWING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <SaveStatusDot
              status={showingSave.status}
              errorMessage={showingSave.errorMessage}
            />
          </div>
        </div>

        {/* Offer Status */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Offer Status
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <select
              value={offerStatus ?? ""}
              onChange={(e) =>
                setOfferStatus(e.target.value === "" ? null : e.target.value)
              }
              className="w-[180px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            >
              <option value="">(none)</option>
              {OFFER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <SaveStatusDot
              status={offerSave.status}
              errorMessage={offerSave.errorMessage}
            />
          </div>
        </div>

        {/* Date fields (read-only — set as side effects of status actions) */}
        <div className="flex gap-4 text-[11px]">
          <div>
            <span className="text-slate-500">Offer Submitted: </span>
            <span className="font-mono text-slate-700">
              {offerSubmitted ? offerSubmitted.slice(0, 10) : "\u2014"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Offer Deadline: </span>
            <span className="font-mono text-slate-700">
              {offerDeadline ? offerDeadline.slice(0, 10) : "\u2014"}
            </span>
          </div>
        </div>

        {/* Watch List Note */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Watch List Note
          </label>
          <div className="mt-0.5 flex items-start gap-1">
            <textarea
              value={watchListNote}
              onChange={(e) => setWatchListNote(e.target.value)}
              rows={3}
              placeholder="Quick note about this deal..."
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            <SaveStatusDot
              status={noteSave.status}
              errorMessage={noteSave.errorMessage}
            />
          </div>
        </div>
      </div>

      {/* Footer: Open in Action → */}
      <div className="mt-4 border-t border-slate-200 pt-3">
        <Link
          href="/action"
          onClick={onClose}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          Open in Action →
        </Link>
      </div>
    </DetailModal>
  );
}
