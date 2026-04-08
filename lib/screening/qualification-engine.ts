// ---------------------------------------------------------------------------
// Qualification Engine — Prime Candidate identification
//
// Ports the legacy "Bangers" logic: properties with enough nearby, recent
// comps showing a strong ARV-vs-price gap earn Prime Candidate status.
//
// When list price is null (off-market), qualification uses maxOffer as the
// price anchor. The question shifts from "is the gap big enough?" to
// "does the ARV support a profitable deal?"
// ---------------------------------------------------------------------------

import type { QualificationConfig } from "./strategy-profiles";
import type { CompArvDetail, QualificationResult, PropertyTypeKey } from "./types";

type QualifyInput = {
  comps: CompArvDetail[];
  config: QualificationConfig;
  propertyType: PropertyTypeKey;
  /** List price when available, null for off-market. */
  listPrice: number | null;
  buildingSqft: number;
  arv: number;
  /** Max offer from deal math — used as price anchor when no list price. */
  maxOffer: number;
};

export function evaluateQualification(input: QualifyInput): QualificationResult {
  const { comps, config, propertyType, listPrice, buildingSqft, arv, maxOffer } = input;

  if (comps.length === 0) {
    return {
      isPrimeCandidate: false,
      qualifyingCompCount: 0,
      reasons: [],
      disqualifiers: ["No comparable sales found"],
    };
  }

  if (buildingSqft <= 0) {
    return {
      isPrimeCandidate: false,
      qualifyingCompCount: 0,
      reasons: [],
      disqualifiers: ["Missing building sqft"],
    };
  }

  // Use list price when available, otherwise use maxOffer as the price anchor
  const hasListPrice = listPrice !== null && listPrice > 0;
  const priceAnchor = hasListPrice ? listPrice : maxOffer;

  if (priceAnchor <= 0) {
    return {
      isPrimeCandidate: false,
      qualifyingCompCount: 0,
      reasons: [],
      disqualifiers: ["No viable price anchor (list price or max offer)"],
    };
  }

  // Overall gap check
  const overallGap = (arv - priceAnchor) / buildingSqft;

  // Per-comp qualification: each comp must individually pass distance, recency,
  // and contribute to a per-comp gap that meets the threshold.
  let qualifyingCount = 0;
  const reasons: string[] = [];
  const disqualifiers: string[] = [];

  for (const comp of comps) {
    const maxCompDist = config.maxCompDistanceMilesByType[propertyType];
    const compPassesDistance =
      comp.distanceMiles <= maxCompDist;
    const compPassesRecency =
      comp.daysSinceClose <= config.maxCompAgeDays;

    // Per-comp gap: how much does THIS comp's adjusted ARV exceed the price anchor?
    const compGap = (comp.arvTimeAdjusted - priceAnchor) / buildingSqft;
    const compPassesGap = compGap >= config.minEstGapPerSqft;

    if (compPassesDistance && compPassesRecency && compPassesGap) {
      qualifyingCount++;
    }
  }

  const isPrimeCandidate =
    qualifyingCount >= config.minQualifyingComps;

  // Build human-readable reasons
  const anchorLabel = hasListPrice ? "list price" : "max offer";

  if (isPrimeCandidate) {
    reasons.push(
      `${qualifyingCount} comp(s) within ${config.maxCompDistanceMilesByType[propertyType]}mi, ` +
        `closed in last ${config.maxCompAgeDays} days, ` +
        `with gap ≥ $${config.minEstGapPerSqft}/sqft`,
    );
    reasons.push(
      `Overall ARV gap vs ${anchorLabel}: $${Math.round(overallGap)}/sqft ($${Math.round(arv - priceAnchor)} total)`,
    );
  } else {
    if (qualifyingCount === 0) {
      disqualifiers.push(
        "No comps meet all qualification criteria (distance, recency, gap)",
      );
    } else {
      disqualifiers.push(
        `Only ${qualifyingCount} qualifying comp(s), need ${config.minQualifyingComps}`,
      );
    }
    if (overallGap < config.minEstGapPerSqft) {
      disqualifiers.push(
        `Overall gap $${Math.round(overallGap)}/sqft below $${config.minEstGapPerSqft}/sqft threshold`,
      );
    }
  }

  return {
    isPrimeCandidate,
    qualifyingCompCount: qualifyingCount,
    reasons,
    disqualifiers,
  };
}
