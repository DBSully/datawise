// Phase 1 Step 3E.7.d — RehabCardModal (editing).
//
// The Rehab card's detail modal per WORKSTATION_CARD_SPEC.md §5.2.
// Wraps 3C's existing <RehabCard> component (extracted in 3C Task 6)
// inside <DetailModal>. The RehabCard handles: per-category scope
// selectors with instant client-side recalc, custom items section,
// and the Save button (legacy bulk form action — per-input auto-persist
// migration is a 3E.8 polish item per the spec note in §5.2).
//
// Additions over the standalone RehabCard:
// - "Rehab Override active" banner when Quick Analysis has a manual
//   rehab value set. Per spec §5.2 the category math is still
//   displayed for context but the override takes priority.
// - Wrapped in <DetailModal> with the standard header/close/ESC/
//   backdrop behavior.
//
// The modal manages its own local state for categoryScopes and
// customItems (initialized from data.rehab), and uses useRouter for
// the post-save page refresh — same pattern the legacy Workstation
// used.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DetailModal } from "@/components/workstation/detail-modal";
import { RehabCard } from "@/components/workstation/rehab-card";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";
import { fmt } from "@/lib/reports/format";
import type { WorkstationData, RehabCategoryScopes } from "@/lib/reports/types";
import type { UseDebouncedSaveResult } from "@/lib/auto-persist/use-debounced-save";

type RehabCardModalProps = {
  data: WorkstationData;
  rehabManual: boolean;
  /** Controlled input + save-status for the Rehab Override. Shared
   *  with Quick Analysis so edits from either surface flow through
   *  one debounced save. */
  rehabInput: string;
  setRehabInput: (s: string) => void;
  rehabSave: UseDebouncedSaveResult;
  autoRehab: number | null;
  onClose: () => void;
};

export function RehabCardModal({
  data,
  rehabManual,
  rehabInput,
  setRehabInput,
  rehabSave,
  autoRehab,
  onClose,
}: RehabCardModalProps) {
  const router = useRouter();

  // Local state for rehab category scope overrides and custom items.
  // Initialized from the server-loaded data. The RehabCard mutates
  // these as the user clicks scope buttons and edits custom items;
  // the Save button persists them via the legacy bulk form action.
  const [categoryScopes, setCategoryScopes] = useState<RehabCategoryScopes>(
    (data.rehab.categoryScopes as RehabCategoryScopes) ?? {},
  );
  const [customItems, setCustomItems] = useState<
    Array<{ label: string; cost: number }>
  >((data.rehab.customItems as Array<{ label: string; cost: number }>) ?? []);
  const [isSaving, setIsSaving] = useState(false);

  return (
    <DetailModal title="Rehab Budget" onClose={onClose}>
      {/* Rehab Override — editable inline. Writes through the lifted
       *  useDebouncedSave hook shared with Quick Analysis. When set,
       *  the category math below is informational only (shows what
       *  the auto-computed rehab would be). */}
      <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Rehab Override
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={rehabInput}
              onChange={(e) => setRehabInput(e.target.value)}
              placeholder={
                autoRehab != null
                  ? Math.round(autoRehab).toLocaleString()
                  : "—"
              }
              className="w-[120px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            <SaveStatusDot
              status={rehabSave.status}
              errorMessage={rehabSave.errorMessage}
            />
            {rehabInput && (
              <button
                type="button"
                onClick={() => setRehabInput("")}
                className="text-[10px] text-slate-400 hover:text-red-500"
                title="Clear override"
              >
                ×
              </button>
            )}
          </div>
        </div>
        {rehabManual && (
          <p className="mt-1.5 text-[10px] text-amber-700">
            Override active — category math below is informational only.
            {autoRehab != null && (
              <> Auto would be {fmt(Math.round(autoRehab))}.</>
            )}
          </p>
        )}
      </div>

      <RehabCard
        d={data}
        categoryScopes={categoryScopes}
        setCategoryScopes={setCategoryScopes}
        customItems={customItems}
        setCustomItems={setCustomItems}
        isSaving={isSaving}
        setIsSaving={setIsSaving}
        router={router}
      />
    </DetailModal>
  );
}
