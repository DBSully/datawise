// ---------------------------------------------------------------------------
// ARV Engine — per-comp size-adjusted blended ARV with exponential decay
//
// Ports and improves the legacy Access ARV calculation:
// 1. Per-comp: size adjustments with dampening + time adjustment
// 2. Aggregate: exponential-decay weighted average of per-comp ARVs
// 3. Property-type-aware blending weights via strategy profile
// ---------------------------------------------------------------------------

import type { ArvConfig, ConfidenceTier } from "./strategy-profiles";
import type { CompArvInput, CompArvDetail, ArvResult } from "./types";
import type { PropertyTypeKey } from "./types";

type CalculateArvInput = {
  subjectBuildingSqft: number;
  subjectAboveGradeSqft: number;
  comps: CompArvInput[];
  config: ArvConfig;
  propertyType: PropertyTypeKey;
  /** Reference date for days-since-close calculation (default: now). */
  referenceDate?: Date;
};

function daysBetween(reference: Date, isoDate: string): number {
  const d = new Date(isoDate);
  return Math.max(0, Math.floor((reference.getTime() - d.getTime()) / 86_400_000));
}

function lookupConfidence(
  distanceMiles: number,
  tiers: ConfidenceTier[],
): number {
  for (const tier of tiers) {
    if (distanceMiles <= tier.maxDistanceMiles) return tier.confidence;
  }
  return 0.2;
}

/**
 * Calculate the ARV for a subject property from a set of comparable sales.
 *
 * Returns null fields if no usable comps are provided.
 */
export function calculateArv(input: CalculateArvInput): ArvResult | null {
  const {
    subjectBuildingSqft,
    subjectAboveGradeSqft,
    comps,
    config,
    propertyType,
    referenceDate = new Date(),
  } = input;

  if (comps.length === 0) return null;
  if (subjectBuildingSqft <= 0 && subjectAboveGradeSqft <= 0) return null;

  const blend = config.blendByPropertyType[propertyType];

  // Use above-grade sqft as fallback for building sqft and vice versa
  const effectiveSubjectBldg = subjectBuildingSqft > 0
    ? subjectBuildingSqft
    : subjectAboveGradeSqft;
  const effectiveSubjectAbove = subjectAboveGradeSqft > 0
    ? subjectAboveGradeSqft
    : subjectBuildingSqft;

  const details: CompArvDetail[] = [];

  for (const comp of comps) {
    const effectiveCompBldg = comp.compBuildingSqft > 0
      ? comp.compBuildingSqft
      : comp.compAboveGradeSqft;
    const effectiveCompAbove = comp.compAboveGradeSqft > 0
      ? comp.compAboveGradeSqft
      : comp.compBuildingSqft;

    if (effectiveCompBldg <= 0 || effectiveCompAbove <= 0) continue;
    if (comp.netSalePrice <= 0) continue;

    const psfBuilding = comp.netSalePrice / effectiveCompBldg;
    const psfAboveGrade = comp.netSalePrice / effectiveCompAbove;

    // Size-adjusted ARV per layer
    const arvBuilding =
      comp.netSalePrice +
      (effectiveSubjectBldg - effectiveCompBldg) *
        psfBuilding *
        blend.buildingDampening;

    const arvAboveGrade =
      comp.netSalePrice +
      (effectiveSubjectAbove - effectiveCompAbove) *
        psfAboveGrade *
        blend.aboveGradeDampening;

    // Blended ARV
    const arvBlended =
      arvBuilding * blend.buildingTotalWeight +
      arvAboveGrade * blend.aboveGradeWeight;

    // Time adjustment
    const daysSinceClose = daysBetween(referenceDate, comp.closeDateIso);
    const timeMultiplier =
      1 + config.timeAdjustmentAnnualRate * (daysSinceClose / 365);
    const timeAdjustment = arvBlended * (timeMultiplier - 1);
    const arvTimeAdjusted = arvBlended * timeMultiplier;

    // Confidence and decay weight
    const confidence = lookupConfidence(comp.distanceMiles, config.confidenceTiersByType[propertyType]);
    const decayWeight = Math.exp(-(daysSinceClose / 365));

    details.push({
      compListingRowId: comp.compListingRowId,
      compRealPropertyId: comp.compRealPropertyId,
      listingId: comp.listingId,
      address: comp.address,
      netSalePrice: comp.netSalePrice,
      closeDateIso: comp.closeDateIso,
      daysSinceClose,
      distanceMiles: comp.distanceMiles,
      compBuildingSqft: effectiveCompBldg,
      compAboveGradeSqft: effectiveCompAbove,
      psfBuilding: round(psfBuilding, 2),
      psfAboveGrade: round(psfAboveGrade, 2),
      arvBuilding: round(arvBuilding, 0),
      arvAboveGrade: round(arvAboveGrade, 0),
      arvBlended: round(arvBlended, 0),
      timeAdjustment: round(timeAdjustment, 0),
      arvTimeAdjusted: round(arvTimeAdjusted, 0),
      confidence,
      decayWeight: round(decayWeight, 6),
    });
  }

  if (details.length === 0) return null;

  // Exponential-decay weighted aggregate ARV
  let weightedSum = 0;
  let weightSum = 0;
  for (const d of details) {
    weightedSum += d.arvTimeAdjusted * d.decayWeight;
    weightSum += d.decayWeight;
  }

  const arvAggregate = weightSum > 0 ? round(weightedSum / weightSum, 0) : 0;
  const arvPerSqft =
    effectiveSubjectBldg > 0
      ? round(arvAggregate / effectiveSubjectBldg, 2)
      : 0;

  return {
    arvAggregate,
    arvPerSqft,
    compCount: details.length,
    perCompDetails: details,
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
