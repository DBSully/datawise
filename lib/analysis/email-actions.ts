"use server";

import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { loadWorkstationData } from "@/lib/analysis/load-workstation-data";
import { buildReportSnapshot } from "@/lib/reports/snapshot";
import {
  renderDealEmailHtml,
  renderDealEmailSubject,
} from "@/lib/analysis/render-deal-email";
import type { ReportContentJson } from "@/lib/reports/types";

const FROM_ADDRESS = "DataWise <analysis@datawisere.com>";

export type DealEmailPreview = {
  report: ReportContentJson;
  defaultSubject: string;
  defaultCc: string;
  analystName: string | null;
  analystEmail: string | null;
};

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function loadDealEmailPreviewAction(
  analysisId: string,
  propertyId: string,
): Promise<{ ok: true; data: DealEmailPreview } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not authenticated." };

  const data = await loadWorkstationData(
    supabase,
    user.id,
    propertyId,
    analysisId,
  );
  if (!data) return { ok: false, error: "Analysis not found." };

  const report = buildReportSnapshot(data);

  // Analyst display name — best-effort from profile if available, else email local part.
  let analystName: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profile) analystName = (profile as { full_name: string | null }).full_name;
  if (!analystName && user.email) analystName = user.email.split("@")[0];

  return {
    ok: true,
    data: {
      report,
      defaultSubject: renderDealEmailSubject(report),
      defaultCc: user.email ?? "",
      analystName,
      analystEmail: user.email ?? null,
    },
  };
}

export type RecentEmailSend = {
  id: string;
  recipientEmail: string;
  ccEmail: string | null;
  subject: string;
  analystComment: string | null;
  sentAt: string;
  senderName: string | null;
  senderEmail: string | null;
};

export async function loadRecentEmailSendsAction(
  analysisId: string,
): Promise<RecentEmailSend[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: sends } = await supabase
    .from("analysis_email_sends")
    .select(
      "id, sent_by_user_id, recipient_email, cc_email, subject, analyst_comment, sent_at",
    )
    .eq("analysis_id", analysisId)
    .order("sent_at", { ascending: false })
    .limit(20);

  if (!sends || sends.length === 0) return [];

  const senderIds = Array.from(new Set(sends.map((s) => s.sent_by_user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", senderIds);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as { full_name: string | null; email: string }]),
  );

  return sends.map((s) => {
    const prof = profileById.get(s.sent_by_user_id);
    return {
      id: s.id,
      recipientEmail: s.recipient_email,
      ccEmail: s.cc_email,
      subject: s.subject,
      analystComment: s.analyst_comment,
      sentAt: s.sent_at,
      senderName: prof?.full_name ?? null,
      senderEmail: prof?.email ?? null,
    };
  });
}

export type SendDealEmailInput = {
  analysisId: string;
  propertyId: string;
  toEmail: string;
  ccEmail: string | null;
  subject: string;
  analystComment: string | null;
};

export async function sendDealEmailAction(
  input: SendDealEmailInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not authenticated." };

  const toEmail = input.toEmail.trim();
  if (!isValidEmail(toEmail)) {
    return { ok: false, error: "Recipient email is invalid." };
  }
  const ccEmail = input.ccEmail?.trim() || null;
  if (ccEmail && !isValidEmail(ccEmail)) {
    return { ok: false, error: "CC email is invalid." };
  }

  const subject = input.subject.trim();
  if (!subject) return { ok: false, error: "Subject is required." };

  // Re-render server-side from fresh data so the sent body can't be
  // tampered with via the client payload.
  const data = await loadWorkstationData(
    supabase,
    user.id,
    input.propertyId,
    input.analysisId,
  );
  if (!data) return { ok: false, error: "Analysis not found." };
  const report = buildReportSnapshot(data);

  let analystName: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profile) analystName = (profile as { full_name: string | null }).full_name;
  if (!analystName && user.email) analystName = user.email.split("@")[0];

  const bodyHtml = renderDealEmailHtml({
    report,
    analystComment: input.analystComment?.trim() || null,
    analystName,
    analystEmail: user.email ?? null,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data: sendResult, error: sendError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    cc: ccEmail ? [ccEmail] : undefined,
    subject,
    html: bodyHtml,
    replyTo: user.email ?? undefined,
  });

  if (sendError) {
    return { ok: false, error: sendError.message };
  }

  // Log metadata only (no body_html) per product decision.
  await supabase.from("analysis_email_sends").insert({
    analysis_id: input.analysisId,
    sent_by_user_id: user.id,
    recipient_email: toEmail,
    cc_email: ccEmail,
    subject,
    analyst_comment: input.analystComment?.trim() || null,
    resend_message_id: sendResult?.id ?? null,
  });

  return { ok: true };
}
