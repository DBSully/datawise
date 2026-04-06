// ---------------------------------------------------------------------------
// Market Trend Engine — data-driven rolling trend rate from closed sales
//
// Replaces the fixed -5%/year time adjustment with an OLS regression on
// $/sqft vs. close date, blending local neighbourhood and metro tiers.
//
// Pure function — no DB dependencies. The bulk runner feeds it data.
// ---------------------------------------------------------------------------

import type { TrendConfig } from "./strategy-profiles";
import type { TrendResult, TrendCompStats, TrendSegment, TrendSaleInput, TrendDirection } from "./types";
import type { PropertyTypeKey } from "./types";
import { haversineMiles } from "@/lib/comparables/scoring";
import { resolvePropertyTypeKey } from "./strategy-profiles";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type CalculateTrendInput = {
  /** Subject property location. */
  subjectLat: number;
  subjectLon: number;
  /** Subject above-grade sqft (for similar-property filtering). */
  subjectAboveGradeSqft: number;
  /** Subject year built (for similar-property filtering). */
  subjectYearBuilt: number | null;
  /** Estimated subject value — list price or rough ARV (for price tier filtering). */
  subjectEstimatedValue: number;
  /** Subject property type key. */
  subjectPropertyType: PropertyTypeKey;
  /** All closed sales in the database (pre-loaded by bulk runner). */
  closedSales: TrendSaleInput[];
  /** Trend configuration from the strategy profile. */
  config: TrendConfig;
  /** Reference date (default: now). */
  referenceDate?: Date;
};

/**
 * Calculate a data-driven market trend rate for a subject property.
 *
 * Returns a TrendResult with the blended rate, per-tier stats, segment
 * trends, confidence level, and a plain-English summary.
 */
export function calculateTrend(input: CalculateTrendInput): TrendResult {
  const {
    subjectLat,
    subjectLon,
    subjectAboveGradeSqft,
    subjectYearBuilt,
    subjectEstimatedValue,
    subjectPropertyType,
    closedSales,
    config,
    referenceDate = new Date(),
  } = input;

  const windowCutoff = new Date(referenceDate);
  windowCutoff.setMonth(windowCutoff.getMonth() - config.windowMonths);

  // -----------------------------------------------------------------------
  // Step 1: Filter to similar properties within rolling window
  // -----------------------------------------------------------------------

  const sqftLo = subjectAboveGradeSqft * (1 - config.sqftTolerancePct);
  const sqftHi = subjectAboveGradeSqft * (1 + config.sqftTolerancePct);
  const priceLo = subjectEstimatedValue * (1 - config.priceTierTolerancePct);
  const priceHi = subjectEstimatedValue * (1 + config.priceTierTolerancePct);
  const yearLo = subjectYearBuilt != null
    ? subjectYearBuilt - config.yearBuiltToleranceYears
    : -Infinity;
  const yearHi = subjectYearBuilt != null
    ? subjectYearBuilt + config.yearBuiltToleranceYears
    : Infinity;

  type EnrichedSale = TrendSaleInput & {
    distanceMiles: number;
    psfBuilding: number;
    psfAboveGrade: number;
    daysSinceWindowStart: number;
  };

  const localComps: EnrichedSale[] = [];
  const metroComps: EnrichedSale[] = [];

  const windowStartMs = windowCutoff.getTime();

  for (const sale of closedSales) {
    // Time filter
    const closeMs = new Date(sale.closeDateIso).getTime();
    if (closeMs < windowStartMs || closeMs > referenceDate.getTime()) continue;

    // Property type filter
    if (resolvePropertyTypeKey(sale.propertyType) !== subjectPropertyType) continue;

    // Size filter
    const saleSqft = sale.aboveGradeSqft > 0 ? sale.aboveGradeSqft : sale.buildingSqft;
    if (saleSqft <= 0) continue;
    if (saleSqft < sqftLo || saleSqft > sqftHi) continue;

    // Price filter
    if (sale.closePrice < priceLo || sale.closePrice > priceHi) continue;

    // Year built filter
    if (sale.yearBuilt != null && (sale.yearBuilt < yearLo || sale.yearBuilt > yearHi)) continue;

    // Distance
    const dist = haversineMiles(subjectLat, subjectLon, sale.latitude, sale.longitude);
    if (dist > config.metroRadiusMiles) continue;

    const bldgSqft = sale.buildingSqft > 0 ? sale.buildingSqft : sale.aboveGradeSqft;

    const enriched: EnrichedSale = {
      ...sale,
      distanceMiles: dist,
      psfBuilding: bldgSqft > 0 ? sale.closePrice / bldgSqft : 0,
      psfAboveGrade: saleSqft > 0 ? sale.closePrice / saleSqft : 0,
      daysSinceWindowStart: Math.max(0, (closeMs - windowStartMs) / 86_400_000),
    };

    if (dist <= config.localRadiusMiles) {
      localComps.push(enriched);
    }
    metroComps.push(enriched); // metro includes local
  }

  // -----------------------------------------------------------------------
  // Step 2: OLS regression per tier
  // -----------------------------------------------------------------------

  const localRate = localComps.length >= config.minComps
    ? olsAnnualRate(localComps)
    : null;

  const metroRate = metroComps.length >= config.minComps
    ? olsAnnualRate(metroComps)
    : null;

  // -----------------------------------------------------------------------
  // Step 3: Blend and clamp
  // -----------------------------------------------------------------------

  let blendedRate: number;
  let isFallback = false;

  if (localRate != null && metroRate != null) {
    blendedRate = config.localWeight * localRate + config.metroWeight * metroRate;
  } else if (localRate != null) {
    blendedRate = localRate;
  } else if (metroRate != null) {
    blendedRate = metroRate;
  } else {
    blendedRate = config.fallbackRate;
    isFallback = true;
  }

  const clampedRate = Math.max(config.clampMin, Math.min(config.clampMax, blendedRate));

  // -----------------------------------------------------------------------
  // Step 4: Confidence
  // -----------------------------------------------------------------------

  const totalComps = metroComps.length; // metro is the superset
  let confidenceLevel: TrendResult["confidenceLevel"];
  if (isFallback) {
    confidenceLevel = "fallback";
  } else if (totalComps < config.lowConfidenceThreshold) {
    confidenceLevel = "low";
  } else {
    confidenceLevel = "high";
  }

  // -----------------------------------------------------------------------
  // Step 5: Build stats with per-tier segments
  // -----------------------------------------------------------------------

  const localStats = buildStats(localComps, config.localRadiusMiles, config);
  const metroStats = buildStats(metroComps, config.metroRadiusMiles, config);

  // Combined segment trends (from best available pool for top-level fields)
  const bestPool = metroComps.length >= config.minComps ? metroStats : localStats;
  const lowEndTrendRate = bestPool.lowEnd.rate;
  const highEndTrendRate = bestPool.highEnd.rate;

  // -----------------------------------------------------------------------
  // Step 6: Direction and summary
  // -----------------------------------------------------------------------

  const direction = classifyDirection(clampedRate);

  const summary = buildSummary(
    clampedRate,
    isFallback,
    localStats,
    metroStats,
    config,
    confidenceLevel,
    direction,
  );

  return {
    blendedAnnualRate: round(clampedRate, 5),
    rawLocalRate: localRate != null ? round(localRate, 5) : null,
    rawMetroRate: metroRate != null ? round(metroRate, 5) : null,
    localStats,
    metroStats,
    windowMonths: config.windowMonths,
    lowEndTrendRate: lowEndTrendRate != null ? round(lowEndTrendRate, 5) : null,
    highEndTrendRate: highEndTrendRate != null ? round(highEndTrendRate, 5) : null,
    direction,
    isFallback,
    confidenceLevel,
    summary,
  };
}

// ---------------------------------------------------------------------------
// OLS regression: annualized $/sqft rate of change
// ---------------------------------------------------------------------------

type RegressionInput = {
  psfAboveGrade: number;
  daysSinceWindowStart: number;
};

/**
 * Simple OLS regression of $/sqft on days-since-window-start.
 * Returns an annualized percentage rate of change.
 *
 * slope = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)
 * annualRate = (slope × 365) / meanPsf
 */
function olsAnnualRate(comps: RegressionInput[]): number {
  const n = comps.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  for (const c of comps) {
    sumX += c.daysSinceWindowStart;
    sumY += c.psfAboveGrade;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denominator = 0;
  for (const c of comps) {
    const dx = c.daysSinceWindowStart - meanX;
    const dy = c.psfAboveGrade - meanY;
    numerator += dx * dy;
    denominator += dx * dx;
  }

  if (denominator === 0 || meanY === 0) return 0;

  const slopePerDay = numerator / denominator;
  const slopePerYear = slopePerDay * 365;
  return slopePerYear / meanY;
}

// ---------------------------------------------------------------------------
// Stats builder
// ---------------------------------------------------------------------------

type EnrichedForStats = {
  closePrice: number;
  psfBuilding: number;
  psfAboveGrade: number;
  daysSinceWindowStart: number;
};

function buildStats(
  comps: EnrichedForStats[],
  radiusMiles: number,
  config: TrendConfig,
): TrendCompStats {
  const emptySegment: TrendSegment = { rate: null, compCount: 0 };

  if (comps.length === 0) {
    return {
      compCount: 0,
      radiusMiles,
      salePriceLow: null, salePriceHigh: null,
      psfBuildingLow: null, psfBuildingHigh: null,
      psfAboveGradeLow: null, psfAboveGradeHigh: null,
      lowEnd: emptySegment,
      highEnd: emptySegment,
    };
  }

  let priceLo = Infinity, priceHi = -Infinity;
  let psfBldgLo = Infinity, psfBldgHi = -Infinity;
  let psfAboveLo = Infinity, psfAboveHi = -Infinity;

  for (const c of comps) {
    if (c.closePrice < priceLo) priceLo = c.closePrice;
    if (c.closePrice > priceHi) priceHi = c.closePrice;
    if (c.psfBuilding > 0) {
      if (c.psfBuilding < psfBldgLo) psfBldgLo = c.psfBuilding;
      if (c.psfBuilding > psfBldgHi) psfBldgHi = c.psfBuilding;
    }
    if (c.psfAboveGrade > 0) {
      if (c.psfAboveGrade < psfAboveLo) psfAboveLo = c.psfAboveGrade;
      if (c.psfAboveGrade > psfAboveHi) psfAboveHi = c.psfAboveGrade;
    }
  }

  // Per-tier segment trends
  let lowEnd: TrendSegment = emptySegment;
  let highEnd: TrendSegment = emptySegment;

  if (comps.length >= config.minComps) {
    const sorted = [...comps].sort((a, b) => a.psfAboveGrade - b.psfAboveGrade);
    const lowCut = Math.floor(sorted.length * (config.lowEndPercentile / 100));
    const highCut = Math.ceil(sorted.length * (config.highEndPercentile / 100));

    const lowSlice = sorted.slice(0, Math.max(1, lowCut));
    const highSlice = sorted.slice(highCut);

    lowEnd = {
      rate: lowSlice.length >= 3 ? round(olsAnnualRate(lowSlice), 5) : null,
      compCount: lowSlice.length,
    };
    highEnd = {
      rate: highSlice.length >= 3 ? round(olsAnnualRate(highSlice), 5) : null,
      compCount: highSlice.length,
    };
  }

  return {
    compCount: comps.length,
    radiusMiles,
    salePriceLow: priceLo === Infinity ? null : round(priceLo, 0),
    salePriceHigh: priceHi === -Infinity ? null : round(priceHi, 0),
    psfBuildingLow: psfBldgLo === Infinity ? null : round(psfBldgLo, 2),
    psfBuildingHigh: psfBldgHi === -Infinity ? null : round(psfBldgHi, 2),
    psfAboveGradeLow: psfAboveLo === Infinity ? null : round(psfAboveLo, 2),
    psfAboveGradeHigh: psfAboveHi === -Infinity ? null : round(psfAboveHi, 2),
    lowEnd,
    highEnd,
  };
}

// ---------------------------------------------------------------------------
// Direction classifier
// ---------------------------------------------------------------------------

function classifyDirection(rate: number): TrendDirection {
  if (rate >= 0.05) return "strong_appreciation";
  if (rate >= 0.02) return "appreciating";
  if (rate >= -0.02) return "flat";
  if (rate >= -0.05) return "softening";
  if (rate >= -0.10) return "declining";
  return "sharp_decline";
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

const DIRECTION_LABELS: Record<TrendDirection, string> = {
  strong_appreciation: "strongly appreciating",
  appreciating: "appreciating",
  flat: "flat",
  softening: "softening",
  declining: "declining",
  sharp_decline: "sharply declining",
};

function buildSummary(
  rate: number,
  isFallback: boolean,
  localStats: TrendCompStats,
  metroStats: TrendCompStats,
  config: TrendConfig,
  confidence: TrendResult["confidenceLevel"],
  direction: TrendDirection,
): string {
  if (isFallback) {
    return `Insufficient market data (${metroStats.compCount} similar sales within ${config.metroRadiusMiles} mi). Using fixed ${fmtPct(config.fallbackRate)}/year fallback rate.`;
  }

  const totalComps = metroStats.compCount;
  const radiusUsed = localStats.compCount >= config.minComps
    ? config.localRadiusMiles
    : config.metroRadiusMiles;

  let text = `Based on ${totalComps} similar sales within ${radiusUsed} mi over ${config.windowMonths} months, this submarket is ${DIRECTION_LABELS[direction]} at ${fmtPct(rate)}/year.`;

  if (confidence === "low") {
    text += ` (Low confidence — only ${totalComps} comps.)`;
  }

  return text;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function fmtPct(rate: number): string {
  const pct = (rate * 100).toFixed(1);
  return rate >= 0 ? `+${pct}%` : `${pct}%`;
}
