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
import { fmt } from "@/lib/reports/format";
import type { WorkstationData, RehabCategoryScopes } from "@/lib/reports/types";

type RehabCardModalProps = {
  data: WorkstationData;
  rehabManual: boolean;
  rehabManualValue: number | null;
  onClose: () => void;
};

export function RehabCardModal({
  data,
  rehabManual,
  rehabManualValue,
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
    <DetailModal title="Rehab" onClose={onClose}>
      {/* Rehab Override banner */}
      {rehabManual && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">⚠ Rehab Override active</span>
          {rehabManualValue != null && (
            <> in Quick Analysis ({fmt(rehabManualValue)})</>
          )}
          . Category math below is informational only — the override
          takes priority in all deal calculations.
        </div>
      )}

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
