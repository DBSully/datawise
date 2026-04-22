"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailModal } from "@/components/workstation/detail-modal";
import { LocalTimestamp } from "@/components/common/local-timestamp";
import {
  loadDealEmailPreviewAction,
  loadRecentEmailSendsAction,
  sendDealEmailAction,
  type DealEmailPreview,
  type RecentEmailSend,
} from "@/lib/analysis/email-actions";
import { renderDealEmailHtml } from "@/lib/analysis/render-deal-email";

type Props = {
  analysisId: string;
  propertyId: string;
  onClose: () => void;
};

export function SendBasicEmailModal({
  analysisId,
  propertyId,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DealEmailPreview | null>(null);

  const [toEmail, setToEmail] = useState("");
  const [ccMe, setCcMe] = useState(true);
  const [ccEmail, setCcEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [comment, setComment] = useState("");

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);

  const [recentSends, setRecentSends] = useState<RecentEmailSend[]>([]);
  const refreshRecent = useCallback(async () => {
    const rows = await loadRecentEmailSendsAction(analysisId);
    setRecentSends(rows);
  }, [analysisId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [result, rows] = await Promise.all([
        loadDealEmailPreviewAction(analysisId, propertyId),
        loadRecentEmailSendsAction(analysisId),
      ]);
      if (!active) return;
      if (!result.ok) {
        setLoadError(result.error);
      } else {
        setPreview(result.data);
        setSubject(result.data.defaultSubject);
        setCcEmail(result.data.defaultCc);
      }
      setRecentSends(rows);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [analysisId, propertyId]);

  // Live preview HTML — re-rendered on every edit using the fetched report data.
  const previewHtml = useMemo(() => {
    if (!preview) return "";
    return renderDealEmailHtml({
      report: preview.report,
      analystComment: comment.trim() || null,
      analystName: preview.analystName,
      analystEmail: preview.analystEmail,
    });
  }, [preview, comment]);

  const handleSend = useCallback(async () => {
    if (!preview) return;
    setSending(true);
    setSendResult(null);
    const effectiveCc = ccMe ? ccEmail.trim() || null : null;
    const result = await sendDealEmailAction({
      analysisId,
      propertyId,
      toEmail,
      ccEmail: effectiveCc,
      subject,
      analystComment: comment.trim() || null,
    });
    setSending(false);
    setSendResult(result);
    if (result.ok) {
      refreshRecent();
    }
  }, [analysisId, propertyId, toEmail, ccMe, ccEmail, subject, comment, preview, refreshRecent]);

  const canSend =
    !!preview &&
    !sending &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail.trim()) &&
    subject.trim().length > 0 &&
    (!ccMe || ccEmail.trim().length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ccEmail.trim()));

  return (
    <DetailModal title="Send Basic Email" onClose={onClose}>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Loading analysis data…
        </p>
      ) : loadError ? (
        <p className="py-8 text-center text-sm text-red-600">{loadError}</p>
      ) : preview ? (
        <div className="space-y-3">
          {/* Form fields */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                To
              </label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => {
                  setToEmail(e.target.value);
                  setSendResult(null);
                }}
                placeholder="recipient@example.com"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <input
                  type="checkbox"
                  checked={ccMe}
                  onChange={(e) => setCcMe(e.target.checked)}
                  className="h-3 w-3"
                />
                CC
              </label>
              <input
                type="email"
                value={ccEmail}
                disabled={!ccMe}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Comment (optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add a note that appears at the top of the email…"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Preview */}
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Preview
            </div>
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              sandbox=""
              className="h-[420px] w-full rounded border border-slate-300 bg-white"
            />
          </div>

          {/* Send button + result */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px]">
              {sendResult?.ok ? (
                <span className="text-emerald-700">
                  Sent to {toEmail}
                  {ccMe && ccEmail.trim() ? ` (cc ${ccEmail.trim()})` : ""}.
                </span>
              ) : sendResult && !sendResult.ok ? (
                <span className="text-red-600">{sendResult.error}</span>
              ) : (
                <span className="text-slate-400">
                  Sends from analysis@datawisere.com. Logs the send for audit.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-[12px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>

          {/* Recent sends */}
          <div>
            <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Recent sends ({recentSends.length})
            </h3>
            {recentSends.length === 0 ? (
              <p className="py-3 text-center text-[11px] text-slate-400">
                No emails have been sent for this analysis yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {recentSends.map((s) => (
                  <div
                    key={s.id}
                    className="rounded border border-slate-200 bg-white px-3 py-2 text-[11px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-800">
                          {s.recipientEmail}
                          {s.ccEmail && (
                            <span className="ml-2 font-normal text-slate-500">
                              cc {s.ccEmail}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-slate-600">
                          {s.subject}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[10px] text-slate-500">
                        <LocalTimestamp value={s.sentAt} />
                        {s.senderName || s.senderEmail ? (
                          <div className="text-slate-400">
                            by {s.senderName ?? s.senderEmail}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {s.analystComment && (
                      <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] italic text-amber-900">
                        “{s.analystComment}”
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </DetailModal>
  );
}
