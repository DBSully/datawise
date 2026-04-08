/**
 * Builds a frozen report snapshot from workstation data.
 * The snapshot is stored as content_json in analysis_reports.
 */

import type { WorkstationData, ReportContentJson } from "./types";

export function buildReportSnapshot(data: WorkstationData): ReportContentJson {
  // Extract selected comps with lat/lng for map
  const selectedComps = data.compModalData.compCandidates
    .filter((c) => Boolean(c.selected_yn))
    .map((c) => {
      const m = (c.metrics_json ?? {}) as Record<string, unknown>;
      return {
        address: String(m.address ?? "\u2014"),
        closePrice: (m.close_price as number) ?? null,
        ppsf: (m.ppsf as number) ?? null,
        sqft: (m.building_area_total_sqft as number) ?? null,
        distance: (c.distance_miles as number) ?? null,
        closeDate: m.close_date ? String(m.close_date).slice(0, 10) : null,
        latitude: (m.latitude as number) ?? null,
        longitude: (m.longitude as number) ?? null,
      };
    });

  // Only include public notes
  const publicNotes = data.notes
    .filter((n) => n.is_public)
    .map((n) => ({
      noteType: n.note_type,
      noteBody: n.note_body,
    }));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),

    property: data.property,

    physical: data.physical
      ? {
          propertyType: data.physical.propertyType,
          buildingSqft: data.physical.buildingSqft,
          aboveGradeSqft: data.physical.aboveGradeSqft,
          belowGradeTotalSqft: data.physical.belowGradeTotalSqft,
          belowGradeFinishedSqft: data.physical.belowGradeFinishedSqft,
          yearBuilt: data.physical.yearBuilt,
          bedroomsTotal: data.physical.bedroomsTotal,
          bathroomsTotal: data.physical.bathroomsTotal,
          garageSpaces: data.physical.garageSpaces,
          lotSizeSqft: data.physical.lotSizeSqft,
        }
      : null,

    listing: data.listing
      ? {
          listingId: data.listing.listingId,
          mlsStatus: data.listing.mlsStatus,
          listPrice: data.listing.listPrice,
        }
      : null,

    analysis: {
      scenarioName: data.analysis.scenarioName,
      strategyType: data.analysis.strategyType,
    },

    arv: {
      effective: data.arv.effective,
      selectedDetail: data.arv.selectedDetail,
    },

    rehab: {
      effective: data.rehab.effective,
      scope: data.rehab.scope,
      scopeMultiplier: data.rehab.scopeMultiplier,
      detail: data.rehab.detail,
      categoryScopes: data.rehab.categoryScopes,
      customItems: data.rehab.customItems,
    },

    holding: data.holding,
    transaction: data.transaction,
    financing: data.financing,
    dealMath: data.dealMath,

    cashRequired: data.cashRequired
      ? {
          purchasePrice: data.cashRequired.purchasePrice,
          downPayment: data.cashRequired.downPayment,
          rehabOutOfPocket: data.cashRequired.rehabOutOfPocket,
          totalCashRequired: data.cashRequired.totalCashRequired,
        }
      : null,

    selectedComps,

    compSummary: {
      selectedCount: data.compSummary.selectedCount,
      avgSelectedPrice: data.compSummary.avgSelectedPrice,
      avgSelectedPsf: data.compSummary.avgSelectedPsf,
      avgSelectedDist: data.compSummary.avgSelectedDist,
    },

    notes: publicNotes,
    staticMapUrl: null,
  };
}
