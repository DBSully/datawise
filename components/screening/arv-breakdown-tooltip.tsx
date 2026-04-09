"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ArvCompBreakdown } from "@/lib/reports/types";

const $n = (v: number | null | undefined, dec = 0) =>
  v != null ? v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "—";
const $c = (v: number | null | undefined) => v != null ? "$" + $n(v) : "—";

/**
 * Hover tooltip showing the full ARV calculation breakdown for a single comp.
 * Renders via portal so it escapes overflow:auto containers.
 * Parent element must be the `<td>` wrapping the Imp ARV value.
 */
export function ArvBreakdownTooltip({ d }: { d: ArvCompBreakdown }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!show || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const tooltipW = 260;
    const tooltipH = 340; // approximate height
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    // Horizontal: open toward screen center
    let left = rect.left + rect.width / 2 < cx
      ? rect.right + 4              // cell is left of center → open right
      : rect.left - tooltipW - 4;   // cell is right of center → open left
    if (left < 8) left = 8;
    if (left + tooltipW > window.innerWidth - 8) left = window.innerWidth - tooltipW - 8;

    // Vertical: open toward screen center
    let top = rect.top + rect.height / 2 < cy
      ? rect.bottom + 4             // cell is above center → open below
      : rect.top - tooltipH - 4;    // cell is below center → open above
    if (top < 8) top = 8;
    if (top + tooltipH > window.innerHeight - 8) top = window.innerHeight - tooltipH - 8;

    setPos({ top, left });
  }, [show]);

  return (
    <>
      <span
        ref={ref}
        className="absolute inset-0"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && pos && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-[260px] rounded-lg border border-slate-300 bg-white p-2.5 text-left text-[10px] shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Implied ARV Breakdown
          </div>
          <table className="w-full">
            <tbody className="text-slate-700">
              <tr><td className="py-0.5 text-slate-500">Net Sale Price</td><td className="py-0.5 text-right font-mono">{$c(d.netSalePrice)}</td></tr>
              <tr><td className="py-0.5 text-slate-500">Comp Bldg SF</td><td className="py-0.5 text-right font-mono">{$n(d.compBuildingSqft)}</td></tr>
              <tr><td className="py-0.5 text-slate-500">Comp AG SF</td><td className="py-0.5 text-right font-mono">{$n(d.compAboveGradeSqft)}</td></tr>
              <tr className="border-t border-slate-100"><td className="py-0.5 text-slate-500">PSF Bldg</td><td className="py-0.5 text-right font-mono">${$n(d.psfBuilding, 2)}</td></tr>
              <tr><td className="py-0.5 text-slate-500">PSF Above Grade</td><td className="py-0.5 text-right font-mono">${$n(d.psfAboveGrade, 2)}</td></tr>
              <tr className="border-t border-slate-100"><td className="py-0.5 text-slate-500">ARV Bldg (size adj)</td><td className="py-0.5 text-right font-mono">{$c(d.arvBuilding)}</td></tr>
              <tr><td className="py-0.5 text-slate-500">ARV AG (size adj)</td><td className="py-0.5 text-right font-mono">{$c(d.arvAboveGrade)}</td></tr>
              <tr><td className="py-0.5 text-slate-500">ARV Blended</td><td className="py-0.5 text-right font-mono">{$c(d.arvBlended)}</td></tr>
              <tr className="border-t border-slate-100"><td className="py-0.5 text-slate-500">Days Since Close</td><td className="py-0.5 text-right font-mono">{$n(d.daysSinceClose)}</td></tr>
              <tr><td className="py-0.5 text-slate-500">Time Adjustment</td><td className="py-0.5 text-right font-mono">{d.timeAdjustment >= 0 ? "+" : ""}{$c(d.timeAdjustment)}</td></tr>
              <tr className="border-t border-slate-200 font-semibold text-slate-900"><td className="py-0.5">Implied ARV</td><td className="py-0.5 text-right font-mono">{$c(d.arv)}</td></tr>
              <tr className="border-t border-slate-100 text-[9px]"><td className="py-0.5 text-slate-400">Confidence</td><td className="py-0.5 text-right font-mono text-slate-400">{$n(d.confidence, 2)}</td></tr>
              <tr className="text-[9px]"><td className="py-0.5 text-slate-400">Decay Weight</td><td className="py-0.5 text-right font-mono text-slate-400">{$n(d.weight, 4)}</td></tr>
            </tbody>
          </table>
        </div>,
        document.body,
      )}
    </>
  );
}
