// ---------------------------------------------------------------------------
// Qualification Engine — Prime Candidate identification
//
// Ports the legacy "Bangers" logic: properties with enough nearby, recent
// comps showing a strong ARV-vs-list-price gap earn Prime Candidate status.
// ---------------------------------------------------------------------------

import type { QualificationConfig } from "./strategy-profiles";
import type { CompArvDetail, QualificationResult } from "./types";

type QualifyInput = {
  comps: CompArvDetail[];
  config: QualificationConfig;
  listPrice: number;
  buildingSqft: number;
  arv: number;
};

export function evaluateQualification(input: QualifyInput): QualificationResult {
  const { comps, config, listPrice, buildingSqft, arv } = input;

  if (comps.length === 0) {
    return {
      isPrimeCandidate: false,
      qualifyingCompCount: 0,
      reasons: [],
      disqualifiers: ["No comparable sales found"],
    };
  }

  if (buildingSqft <= 0 || listPrice <= 0) {
    return {
      isPrimeCandidate: false,
      qualifyingCompCount: 0,
      reasons: [],
      disqualifiers: ["Missing building sqft or list price"],
    };
  }

  // Overall gap check
  const overallGap = buildingSqft > 0 ? (arv - listPrice) / buildingSqft : 0;

  // Per-comp qualification: each comp must individually pass distance, recency,
  // and contribute to a per-comp gap that meets the threshold.
  let qualifyingCount = 0;
  const reasons: string[] = [];
  const disqualifiers: string[] = [];

  for (const comp of comps) {
    const compPassesDistance =
      comp.distanceMiles <= config.maxCompDistanceMiles;
    const compPassesRecency =
      comp.daysSinceClose <= config.maxCompAgeDays;

    // Per-comp gap: how much does THIS comp's adjusted ARV exceed list price?
    const compGap =
      buildingSqft > 0
        ? (comp.arvTimeAdjusted - listPrice) / buildingSqft
        : 0;
    const compPassesGap = compGap >= config.minEstGapPerSqft;

    if (compPassesDistance && compPassesRecency && compPassesGap) {
      qualifyingCount++;
    }
  }

  const isPrimeCandidate =
    qualifyingCount >= config.minQualifyingComps;

  // Build human-readable reasons
  if (isPrimeCandidate) {
    reasons.push(
      `${qualifyingCount} comp(s) within ${config.maxCompDistanceMiles}mi, ` +
        `closed in last ${config.maxCompAgeDays} days, ` +
        `with gap ≥ $${config.minEstGapPerSqft}/sqft`,
    );
    reasons.push(
      `Overall ARV gap: $${Math.round(overallGap)}/sqft ($${Math.round(arv - listPrice)} total)`,
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
