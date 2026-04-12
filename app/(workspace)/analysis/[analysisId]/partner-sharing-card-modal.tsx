// Phase 1 Step 4C — PartnerSharingCardModal (full implementation).
//
// The Partner Sharing card's detail modal per WORKSTATION_CARD_SPEC.md §5.9.
// Replaces the "Full Partner Sharing arrives in Step 4" stub.
//
// Three sections:
//   1. Add new share — email input + optional message + Send Share button
//   2. Active shares list — per-row partner info + view count + feedback
//   3. Revoke button per share
//
// Loads share data client-side on mount via loadAnalysisSharesAction.
// Uses createAnalysisShareAction and revokeAnalysisShareAction from 4B.

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DetailModal } from "@/components/workstation/detail-modal";
import {
  createAnalysisShareAction,
  revokeAnalysisShareAction,
  loadAnalysisSharesAction,
  type AnalysisShareRow,
  type PartnerFeedbackRow,
} from "@/lib/partner-portal/share-actions";

type PartnerSharingCardModalProps = {
  analysisId: string;
  onClose: () => void;
};

export function PartnerSharingCardModal({
  analysisId,
  onClose,
}: PartnerSharingCardModalProps) {
  const router = useRouter();

  // ── Share data state ─────────────────────────────────────────────
  const [shares, setShares] = useState<AnalysisShareRow[]>([]);
  const [feedback, setFeedback] = useState<PartnerFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await loadAnalysisSharesAction(analysisId);
    setShares(data.shares);
    setFeedback(data.feedback);
    setLoading(false);
  }, [analysisId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Add share form state ─────────────────────────────────────────
  const [partnerEmail, setPartnerEmail] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    message: string;
    shareUrl?: string;
  } | null>(null);

  const handleSendShare = useCallback(async () => {
    if (!partnerEmail.trim()) return;
    setIsSending(true);
    setSendResult(null);
    const result = await createAnalysisShareAction({
      analysisId,
      partnerEmail: partnerEmail.trim(),
      message: shareMessage.trim() || undefined,
    });
    setIsSending(false);
    if (result.ok) {
      setSendResult({
        ok: true,
        message: `Shared with ${partnerEmail}`,
        shareUrl: result.shareUrl,
      });
      setPartnerEmail("");
      setShareMessage("");
      loadData();
      router.refresh();
    } else {
      setSendResult({ ok: false, message: result.error ?? "Failed to share." });
    }
  }, [analysisId, partnerEmail, shareMessage, loadData, router]);

  // ── Revoke handler ───────────────────────────────────────────────
  const handleRevoke = useCallback(
    async (shareId: string) => {
      if (!window.confirm("Revoke this share? The partner will lose access."))
        return;
      await revokeAnalysisShareAction({ shareId, analysisId });
      loadData();
      router.refresh();
    },
    [analysisId, loadData, router],
  );

  // ── Helpers ──────────────────────────────────────────────────────
  const activeShares = shares.filter((s) => s.is_active);
  const getFeedbackForShare = (shareId: string) =>
    feedback.filter((f) => f.analysis_share_id === shareId);

  return (
    <DetailModal title="Partner Sharing" onClose={onClose}>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Loading share data...
        </p>
      ) : (
        <div className="space-y-4">
          {/* ── Add new share ── */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Share this analysis
            </h3>
            <div className="flex gap-2">
              <input
                type="email"
                value={partnerEmail}
                onChange={(e) => {
                  setPartnerEmail(e.target.value);
                  setSendResult(null);
                }}
                placeholder="Partner email address"
                className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
              <button
                type="button"
                onClick={handleSendShare}
                disabled={isSending || !partnerEmail.trim()}
                className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {isSending ? "Sending..." : "Send Share"}
              </button>
            </div>
            <textarea
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              rows={2}
              placeholder="Optional message to include (visible to partner)..."
              className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            {sendResult && (
              <div
                className={`mt-2 text-[11px] ${
                  sendResult.ok ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {sendResult.message}
                {sendResult.shareUrl && (
                  <div className="mt-1">
                    <span className="text-slate-500">Share link: </span>
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-700 select-all">
                      {sendResult.shareUrl}
                    </code>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Active shares list ── */}
          <div>
            <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Active shares ({activeShares.length})
            </h3>
            {activeShares.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                No active shares yet. Share this analysis with a partner above.
              </p>
            ) : (
              <div className="space-y-1.5">
                {activeShares.map((share) => {
                  const fb = getFeedbackForShare(share.id);
                  const latestFb = fb[0] ?? null;
                  const hasUnread =
                    latestFb &&
                    (!share.last_viewed_by_analyst_at ||
                      latestFb.submitted_at > share.last_viewed_by_analyst_at);

                  return (
                    <div
                      key={share.id}
                      className="rounded border border-slate-200 bg-white px-3 py-2 text-[11px]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            {share.shared_with_email}
                          </span>
                          {share.shared_with_user_id && (
                            <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-700">
                              Registered
                            </span>
                          )}
                          {hasUnread && (
                            <span className="inline-block h-2 w-2 rounded-full bg-red-500" title="New feedback" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <CopyLinkButton shareToken={share.share_token} />
                          <button
                            type="button"
                            onClick={() => handleRevoke(share.id)}
                            className="text-[10px] text-slate-400 hover:text-red-600"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>

                      <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
                        <span>
                          Sent {new Date(share.sent_at).toLocaleDateString()}
                        </span>
                        <span>
                          {share.view_count} view
                          {share.view_count !== 1 ? "s" : ""}
                        </span>
                        {share.first_viewed_at && (
                          <span>
                            First viewed{" "}
                            {new Date(
                              share.first_viewed_at,
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {/* Feedback */}
                      {fb.length > 0 && (
                        <div className="mt-1.5 border-t border-slate-100 pt-1.5">
                          {fb.map((f) => (
                            <div
                              key={f.id}
                              className="flex items-center gap-2"
                            >
                              <span
                                className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${
                                  f.action === "interested"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : f.action === "pass"
                                      ? "bg-red-100 text-red-700"
                                      : f.action === "showing_request"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {f.action.replace(/_/g, " ")}
                              </span>
                              {f.pass_reason && (
                                <span className="text-[10px] text-slate-500">
                                  — {f.pass_reason}
                                </span>
                              )}
                              {f.notes && (
                                <span className="text-[10px] text-slate-500">
                                  — {f.notes}
                                </span>
                              )}
                              <span className="ml-auto text-[9px] text-slate-400">
                                {new Date(
                                  f.submitted_at,
                                ).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Revoked shares (collapsed) */}
          {shares.filter((s) => !s.is_active).length > 0 && (
            <div className="text-[10px] text-slate-400">
              {shares.filter((s) => !s.is_active).length} revoked share
              {shares.filter((s) => !s.is_active).length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </DetailModal>
  );
}

// ── Copy Link button for each active share row ──────────────────────

function CopyLinkButton({ shareToken }: { shareToken: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const baseUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000";
    const url = `${baseUrl}/portal/deals/${shareToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [shareToken]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-[10px] text-blue-600 hover:text-blue-800"
    >
      {copied ? "Copied!" : "Copy Link"}
    </button>
  );
}
