// Phase 1 Step 4E — Realtime subscription hook for the Partner Sharing card.
//
// Subscribes to Supabase Realtime events on analysis_shares and
// partner_feedback for a specific analysis_id. When an event arrives
// (partner viewed, partner submitted feedback, share created/revoked),
// the onUpdate callback fires so the Workstation can refresh its
// share data and update the Partner Sharing card headline + modal.
//
// Per Decision 9 (WORKSTATION_CARD_SPEC.md): the Partner Sharing card
// auto-refreshes via Supabase Realtime channel subscriptions. New
// feedback, new views, and partner adjustments appear live without the
// analyst having to refresh anything.
//
// Subscribe on Workstation mount, unsubscribe on unmount.
// Falls back gracefully if Realtime is unavailable — the card still
// works via manual refresh (close/reopen the modal).

"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type UseShareRealtimeOptions = {
  analysisId: string;
  /** Called when any Realtime event arrives. The Workstation uses
   *  this to reload shareData from the server. */
  onUpdate: () => void;
  /** Whether the subscription is active. Pass false to disable
   *  (e.g., when the Workstation unmounts or the analysis changes). */
  enabled?: boolean;
};

export function useShareRealtime({
  analysisId,
  onUpdate,
  enabled = true,
}: UseShareRealtimeOptions) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled || !analysisId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`workstation-shares:${analysisId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "analysis_shares",
          filter: `analysis_id=eq.${analysisId}`,
        },
        () => {
          onUpdateRef.current();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "partner_feedback",
        },
        (payload) => {
          // partner_feedback doesn't have analysis_id directly —
          // it's linked via analysis_shares. For MVP, we trigger on
          // ALL partner_feedback inserts and let the data reload
          // filter to the current analysis. This is acceptable at
          // MVP scale (few feedback events total). A more targeted
          // approach would join through analysis_shares in a DB
          // function, but that's over-engineering for now.
          onUpdateRef.current();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          // eslint-disable-next-line no-console
          console.warn(
            "[Realtime] Channel error for workstation-shares. " +
              "Live updates may not work. The card still refreshes on manual open.",
          );
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [analysisId, enabled]);
}
