import type { ReportContentJson } from "@/lib/reports/types";
import { fmt, fmtNum, fmtPct } from "@/lib/reports/format";

// Table-based layout with all styles inlined: required by Gmail/Outlook.
// No external stylesheets, no <style> blocks, no flexbox/grid.

const BODY_WIDTH = 640;

const colors = {
  text: "#1e293b",
  muted: "#64748b",
  subtle: "#94a3b8",
  border: "#e2e8f0",
  thickBorder: "#cbd5e1",
  accent: "#047857",
  negative: "#dc2626",
  headerBg: "#f8fafc",
  amberBg: "#fef3c7",
  amberBorder: "#fcd34d",
};

const baseFont =
  `"Segoe UI",Arial,Helvetica,sans-serif`;

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sectionTitle(label: string): string {
  return `
    <tr><td style="padding:18px 0 6px 0;border-bottom:1px solid ${colors.thickBorder};">
      <div style="font-family:${baseFont};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${colors.muted};">${esc(label)}</div>
    </td></tr>`;
}

function row(
  label: string,
  value: string,
  opts: { bold?: boolean; negative?: boolean; thick?: boolean } = {},
): string {
  const labelStyle = `font-family:${baseFont};font-size:13px;color:${colors.muted};${opts.bold ? "font-weight:700;" : ""}`;
  const valueColor = opts.negative ? colors.negative : colors.text;
  const valueStyle = `font-family:"SFMono-Regular",Consolas,Menlo,monospace;font-size:13px;color:${valueColor};text-align:right;${opts.bold ? "font-weight:700;" : ""}`;
  const borderTop = opts.thick
    ? `border-top:2px solid ${colors.thickBorder};`
    : "";
  const padTop = opts.thick ? "padding-top:6px;" : "";
  return `<tr>
    <td style="${borderTop}${padTop}padding-bottom:3px;${labelStyle}">${esc(label)}</td>
    <td style="${borderTop}${padTop}padding-bottom:3px;${valueStyle}">${value}</td>
  </tr>`;
}

function fmtCurrency(n: number | null | undefined): string {
  return esc(fmt(n));
}

function fmtNeg(n: number | null | undefined): string {
  if (n == null) return esc(fmt(null));
  // Minus sign (U+2212) instead of parens — cleaner right-edge alignment
  // across signed and unsigned rows in the waterfall.
  return `−${esc(fmt(n))}`;
}

// Empty-row spacer used to mark a visual break between the Deal Math
// waterfall conclusion (Maximum Offer) and the derived-metrics rows that
// follow. Rendered as a plain <tr> row so it participates in the same
// table alignment.
const SPACER_ROW = `<tr><td colspan="2" style="height:14px;"></td></tr>`;

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export type DealEmailInput = {
  report: ReportContentJson;
  analystComment: string | null;
  analystName: string | null;
  analystEmail: string | null;
};

export function renderDealEmailSubject(report: ReportContentJson): string {
  return `Deal Analysis - ${report.property.address}`;
}

export function renderDealEmailHtml(input: DealEmailInput): string {
  const { report, analystComment, analystName, analystEmail } = input;
  const p = report.physical;
  const dm = report.dealMath;
  const listing = report.listing;

  // --- Subject Property ---
  const subjectRows: string[] = [];
  subjectRows.push(
    row("Address", esc(`${report.property.address}, ${report.property.city}, ${report.property.state} ${report.property.postalCode ?? ""}`.trim())),
  );
  if (listing?.listingId) {
    subjectRows.push(row("MLS #", esc(listing.listingId)));
  }
  if (listing?.mlsStatus) {
    subjectRows.push(row("MLS Status", esc(listing.mlsStatus)));
  }
  if (listing?.listPrice) {
    subjectRows.push(row("List Price", fmtCurrency(listing.listPrice)));
  }
  if (listing?.listingContractDate) {
    subjectRows.push(row("List Date", esc(listing.listingContractDate.slice(0, 10))));
  }
  if (p) {
    const sizeParts: string[] = [];
    if (p.buildingSqft) sizeParts.push(`${fmtNum(p.buildingSqft)} sqft`);
    if (p.bedroomsTotal != null) sizeParts.push(`${p.bedroomsTotal} bd`);
    if (p.bathroomsTotal != null) sizeParts.push(`${fmtNum(p.bathroomsTotal, 1)} ba`);
    if (p.yearBuilt) sizeParts.push(`built ${p.yearBuilt}`);
    if (p.lotSizeSqft) sizeParts.push(`${fmtNum(p.lotSizeSqft)} sqft lot`);
    if (p.propertyType) sizeParts.push(esc(p.propertyType));
    if (sizeParts.length > 0) {
      subjectRows.push(row("Property", sizeParts.join(" · ")));
    }
  }

  // --- Deal Math (mirror of PDF order) ---
  const dealMathRows: string[] = [];
  if (dm) {
    dealMathRows.push(row("After Repair Value (ARV)", fmtCurrency(dm.arv), { bold: true }));
    dealMathRows.push(row("Rehab Budget", fmtNeg(dm.rehabTotal), { negative: true, thick: true }));
    dealMathRows.push(row("Holding Costs", fmtNeg(dm.holdTotal), { negative: true }));
    dealMathRows.push(row("Transaction Costs", fmtNeg(dm.transactionTotal), { negative: true }));
    if (dm.financingTotal > 0) {
      dealMathRows.push(row("Financing Costs", fmtNeg(dm.financingTotal), { negative: true }));
    }
    dealMathRows.push(row("Target Profit", fmtNeg(dm.targetProfit), { negative: true }));
    dealMathRows.push(row("Maximum Offer", fmtCurrency(dm.maxOffer), { bold: true, thick: true }));
    dealMathRows.push(SPACER_ROW);
    if (dm.offerPct != null) {
      dealMathRows.push(row("Offer as % of List", esc(fmtPct(dm.offerPct))));
    }
    if (dm.spread != null) {
      dealMathRows.push(row("Spread (ARV − Max Offer)", fmtCurrency(dm.spread)));
    }
    if (dm.negotiationGap != null) {
      dealMathRows.push(row("Negotiation Gap (Max Offer − List)", fmtCurrency(dm.negotiationGap)));
    }
  }

  // --- Holding & Transaction ---
  const holdingRows: string[] = [];
  if (report.holding) {
    const h = report.holding;
    holdingRows.push(row(`Property Tax (${h.daysHeld} days)`, fmtCurrency(h.holdTax)));
    holdingRows.push(row("Insurance", fmtCurrency(h.holdInsurance)));
    holdingRows.push(row("HOA", fmtCurrency(h.holdHoa)));
    holdingRows.push(row("Utilities", fmtCurrency(h.holdUtilities)));
    holdingRows.push(row("Total Holding", fmtCurrency(h.total), { bold: true, thick: true }));
  }
  const txnRows: string[] = [];
  if (report.transaction) {
    const t = report.transaction;
    txnRows.push(row("Acquisition Title", fmtCurrency(t.acquisitionTitle)));
    txnRows.push(row("Disposition Title", fmtCurrency(t.dispositionTitle)));
    txnRows.push(row("Dispo Commission — Buyer", fmtCurrency(t.dispositionCommissionBuyer)));
    txnRows.push(row("Dispo Commission — Seller", fmtCurrency(t.dispositionCommissionSeller)));
    txnRows.push(row("Total Transaction", fmtCurrency(t.total), { bold: true, thick: true }));
  }

  // --- Comps table ---
  const compsHeader = `<tr style="background:${colors.headerBg};">
    ${["MLS #","Address","Close Price","$/SqFt","SqFt","Distance","Close Date"]
      .map((h,i) => `<th style="font-family:${baseFont};font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.muted};text-align:${i>=2 ? "right" : "left"};padding:6px 8px;border-bottom:1px solid ${colors.border};">${esc(h)}</th>`)
      .join("")}
  </tr>`;
  const compsRows = report.selectedComps.map((c) => {
    const tdL = `font-family:${baseFont};font-size:12px;color:${colors.text};padding:5px 8px;border-bottom:1px solid ${colors.border};`;
    const tdR = `font-family:"SFMono-Regular",Consolas,Menlo,monospace;font-size:12px;color:${colors.text};text-align:right;padding:5px 8px;border-bottom:1px solid ${colors.border};`;
    return `<tr>
      <td style="${tdL}font-family:'SFMono-Regular',Consolas,Menlo,monospace;">${esc(c.mlsNumber ?? "—")}</td>
      <td style="${tdL}">${esc(c.address)}</td>
      <td style="${tdR}">${esc(fmt(c.netSalePrice))}</td>
      <td style="${tdR}">${c.ppsf != null ? `$${esc(fmtNum(c.ppsf))}` : "—"}</td>
      <td style="${tdR}">${c.sqft != null ? esc(fmtNum(c.sqft)) : "—"}</td>
      <td style="${tdR}">${c.distance != null ? `${esc(fmtNum(c.distance, 2))} mi` : "—"}</td>
      <td style="${tdR}">${esc(c.closeDate ?? "—")}</td>
    </tr>`;
  }).join("");

  // --- Public notes ---
  const notesRows = report.notes
    .map((n) => `<tr><td style="padding:4px 0;">
      <div style="font-family:${baseFont};font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${colors.muted};">${esc(n.noteType)}</div>
      <div style="font-family:${baseFont};font-size:13px;color:${colors.text};white-space:pre-wrap;">${esc(n.noteBody)}</div>
    </td></tr>`)
    .join("");

  // --- Analyst comment block ---
  const commentBlock = analystComment && analystComment.trim().length > 0
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${colors.amberBg};border:1px solid ${colors.amberBorder};border-radius:4px;margin:16px 0;"><tr><td style="padding:12px;">
        <div style="font-family:${baseFont};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${colors.muted};margin-bottom:4px;">Analyst Comment${analystName ? ` — ${esc(analystName)}` : ""}</div>
        <div style="font-family:${baseFont};font-size:13px;color:${colors.text};white-space:pre-wrap;">${esc(analystComment)}</div>
      </td></tr></table>`
    : "";

  const compCount = report.selectedComps.length;
  const compsSection = compCount > 0 ? `
    ${sectionTitle(`Comparable Sales (${compCount} Selected)`)}
    <tr><td style="padding:8px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid ${colors.border};">
        <thead>${compsHeader}</thead>
        <tbody>${compsRows}</tbody>
      </table>
    </td></tr>` : "";

  const holdingSection = (holdingRows.length > 0 || txnRows.length > 0) ? `
    ${sectionTitle("Holding & Transaction Costs")}
    <tr><td style="padding:8px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="50%" style="vertical-align:top;padding-right:8px;">
            ${holdingRows.length > 0 ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${holdingRows.join("")}</table>` : ""}
          </td>
          <td width="50%" style="vertical-align:top;padding-left:8px;">
            ${txnRows.length > 0 ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${txnRows.join("")}</table>` : ""}
          </td>
        </tr>
      </table>
    </td></tr>` : "";

  const notesSection = notesRows ? `
    ${sectionTitle("Analysis Notes")}
    <tr><td style="padding:8px 0 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${notesRows}</table>
    </td></tr>` : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Deal Analysis</title>
</head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:${baseFont};color:${colors.text};">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="${BODY_WIDTH}" style="background:#ffffff;max-width:${BODY_WIDTH}px;width:100%;border:1px solid ${colors.border};border-radius:6px;">
        <tr><td style="padding:20px 24px 0 24px;">
          <div style="font-family:${baseFont};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${colors.muted};">DataWise Real Estate</div>
          <h1 style="font-family:${baseFont};font-size:20px;font-weight:700;color:${colors.text};margin:6px 0 0 0;">Deal Analysis</h1>
          ${analystName || analystEmail ? `<div style="font-family:${baseFont};font-size:12px;color:${colors.muted};margin-top:4px;">From ${esc(analystName ?? "")}${analystEmail ? ` &lt;${esc(analystEmail)}&gt;` : ""}</div>` : ""}
        </td></tr>

        ${commentBlock ? `<tr><td style="padding:0 24px;">${commentBlock}</td></tr>` : ""}

        <tr><td style="padding:0 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            ${sectionTitle("Subject Property")}
            <tr><td style="padding:8px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${subjectRows.join("")}</table>
            </td></tr>

            ${dealMathRows.length > 0 ? `${sectionTitle("Deal Math")}
            <tr><td style="padding:8px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${dealMathRows.join("")}</table>
            </td></tr>` : ""}

            ${holdingSection}
            ${compsSection}
            ${notesSection}
          </table>
        </td></tr>

        <tr><td style="padding:20px 24px;">
          <div style="font-family:${baseFont};font-size:11px;color:${colors.subtle};border-top:1px solid ${colors.border};padding-top:10px;">
            Generated ${esc(new Date(report.generatedAt).toLocaleString("en-US"))}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
