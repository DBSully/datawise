"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReportContentJson } from "@/lib/reports/types";
import type { MapPin } from "@/components/properties/comp-map";
import { ReportDocument } from "@/components/reports/report-document";
import {
  deleteReportAction,
  regenerateReportAction,
} from "@/app/(workspace)/reports/actions";

const CompMap = dynamic(
  () => import("@/components/properties/comp-map").then((m) => m.CompMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[350px] items-center justify-center bg-slate-50 text-xs text-slate-400">
        Loading map...
      </div>
    ),
  },
);

type Props = {
  reportId: string;
  title: string;
  content: ReportContentJson;
  createdAt: string;
};

export function ReportViewer({ reportId, title, content, createdAt }: Props) {
  const router = useRouter();
  const r = content;
  const [regenPending, startRegen] = useTransition();
  const [regenError, setRegenError] = useState<string | null>(null);

  function handlePrint() {
    window.print();
  }

  async function handleDelete() {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    const fd = new FormData();
    fd.set("report_id", reportId);
    await deleteReportAction(fd);
  }

  function handleRegenerate() {
    if (
      !confirm(
        "Regenerate this report from the current analysis? Snapshot numbers will be replaced with today's live values.",
      )
    )
      return;
    setRegenError(null);
    startRegen(async () => {
      try {
        const fd = new FormData();
        fd.set("report_id", reportId);
        await regenerateReportAction(fd);
        router.refresh();
      } catch (err) {
        setRegenError(err instanceof Error ? err.message : "Regenerate failed");
      }
    });
  }

  // Build map pins from snapshot data
  const mapPins = useMemo<MapPin[]>(() => {
    const pins: MapPin[] = [];

    // Subject pin
    if (r.property.latitude && r.property.longitude) {
      pins.push({
        id: "subject",
        lat: r.property.latitude,
        lng: r.property.longitude,
        label: r.property.address,
        tooltipData: {
          listPrice: r.listing?.listPrice ?? null,
          sqft: r.physical?.buildingSqft ?? null,
          gapPerSqft: r.dealMath?.estGapPerSqft ?? null,
        },
        type: "subject",
      });
    }

    // Selected comp pins — numbered to match the table rows
    const subjectSqft = r.physical?.buildingSqft ?? 0;
    const subjectListPrice = r.listing?.listPrice ?? 0;

    for (let i = 0; i < r.selectedComps.length; i++) {
      const comp = r.selectedComps[i];
      if (!comp.latitude || !comp.longitude) continue;
      if (!Number.isFinite(comp.latitude) || !Number.isFinite(comp.longitude)) continue;

      const sqftDelta = comp.sqft && subjectSqft ? subjectSqft - comp.sqft : null;
      const sqftDeltaPct = comp.sqft && subjectSqft ? (subjectSqft - comp.sqft) / subjectSqft : null;
      const gapPerSqft =
        subjectSqft > 0 && (comp.netSalePrice ?? 0) > 0 && subjectListPrice > 0
          ? Math.round(((comp.netSalePrice ?? 0) - subjectListPrice) / subjectSqft)
          : null;

      pins.push({
        id: `comp-${i}`,
        lat: comp.latitude,
        lng: comp.longitude,
        label: comp.address,
        pinLabel: String(i + 1),
        tooltipData: {
          closePrice: comp.netSalePrice,
          closeDate: comp.closeDate,
          sqft: comp.sqft,
          sqftDelta,
          sqftDeltaPct,
          ppsf: comp.ppsf,
          distance: comp.distance,
          gapPerSqft,
        },
        type: "selected",
      });
    }

    return pins;
  }, [r]);

  const hasMap = mapPins.length >= 2;

  const mapElement = hasMap ? (
    <CompMap
      pins={mapPins}
      height={350}
      subjectLat={r.property.latitude}
      subjectLng={r.property.longitude}
      showDistanceCircles
    />
  ) : null;

  return (
    <div>
      {/* Action bar (hidden on print) */}
      <div className="report-actions mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/reports"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            &larr; Report Library
          </Link>
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {regenError && (
            <span className="text-xs text-red-600" title={regenError}>
              {regenError}
            </span>
          )}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenPending}
            className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          >
            {regenPending ? "Regenerating…" : "Regenerate"}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            Print / Save PDF
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Report content */}
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <ReportDocument report={content} title={title} mapSlot={mapElement} />
      </div>
    </div>
  );
}
