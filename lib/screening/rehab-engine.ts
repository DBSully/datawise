// ---------------------------------------------------------------------------
// Rehab Budget Engine — multiplier-based estimation by property type
//
// Ports the legacy Access rehab calculation with improvements:
// - All rates and multiplier tiers are driven by the strategy profile
// - Property type intelligence via keyed rates (no if/else chains)
// - Fixed the Access bug where the ≥900k price tier was unreachable
// ---------------------------------------------------------------------------

import type { RehabConfig, RehabRates, RehabMultiplierConfig } from "./strategy-profiles";
import type { PropertyTypeKey, RehabResult } from "./types";

type CalculateRehabInput = {
  propertyType: PropertyTypeKey;
  aboveGradeSqft: number;
  belowGradeFinishedSqft: number;
  belowGradeUnfinishedSqft: number;
  buildingSqft: number;
  listPrice: number;
  yearBuilt: number | null;
  condition: string | null;
  config: RehabConfig;
};

// ---------------------------------------------------------------------------
// Multiplier resolution
// ---------------------------------------------------------------------------

function resolveConditionMultiplier(
  condition: string | null,
  multipliers: RehabMultiplierConfig,
): number {
  if (!condition) return multipliers.conditionDefault;
  const key = condition.toLowerCase().trim();
  if (key in multipliers.condition) return multipliers.condition[key];
  return multipliers.conditionDefault;
}

function resolvePriceMultiplier(
  listPrice: number,
  multipliers: RehabMultiplierConfig,
): number {
  for (const tier of multipliers.priceTiers) {
    if (tier.maxPrice !== undefined && listPrice <= tier.maxPrice) {
      return tier.multiplier;
    }
    if (tier.minPrice !== undefined && listPrice >= tier.minPrice) {
      return tier.multiplier;
    }
  }
  return multipliers.priceDefault;
}

function resolveAgeMultiplier(
  yearBuilt: number | null,
  multipliers: RehabMultiplierConfig,
): number {
  if (yearBuilt === null) return multipliers.ageDefault;
  for (const tier of multipliers.ageTiers) {
    if (tier.beforeYear !== undefined && yearBuilt < tier.beforeYear) {
      return tier.multiplier;
    }
    if (tier.afterYear !== undefined && yearBuilt > tier.afterYear) {
      return tier.multiplier;
    }
  }
  return multipliers.ageDefault;
}

// ---------------------------------------------------------------------------
// Systems cost
// ---------------------------------------------------------------------------

function calculateSystems(
  rates: RehabRates,
  buildingSqft: number,
  compositeMultiplier: number,
): number {
  if ("flatAmount" in rates.systems) {
    return rates.systems.flatAmount * compositeMultiplier;
  }
  return buildingSqft * rates.systems.perBuildingSqft * compositeMultiplier;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function calculateRehab(input: CalculateRehabInput): RehabResult {
  const {
    propertyType,
    aboveGradeSqft,
    belowGradeFinishedSqft,
    belowGradeUnfinishedSqft,
    buildingSqft,
    listPrice,
    yearBuilt,
    condition,
    config,
  } = input;

  const rates = config.ratesByPropertyType[propertyType];
  const multipliers = config.multipliers;

  // Individual multipliers
  const typeMultiplier = multipliers.type[propertyType];
  const conditionMultiplier = resolveConditionMultiplier(condition, multipliers);
  const priceMultiplier = resolvePriceMultiplier(listPrice, multipliers);
  const ageMultiplier = resolveAgeMultiplier(yearBuilt, multipliers);

  const compositeMultiplier =
    typeMultiplier * conditionMultiplier * priceMultiplier * ageMultiplier;

  // If condition multiplier is 0 (new construction), total rehab is $0
  if (compositeMultiplier === 0) {
    return {
      compositeMultiplier: 0,
      typeMultiplier,
      conditionMultiplier,
      priceMultiplier,
      ageMultiplier,
      aboveGrade: 0,
      belowGradeFinished: 0,
      belowGradeUnfinished: 0,
      belowGradeTotal: 0,
      interior: 0,
      exterior: 0,
      landscaping: 0,
      systems: 0,
      total: 0,
      perSqftBuilding: 0,
      perSqftAboveGrade: 0,
    };
  }

  // Line items
  const aboveGrade = round(
    aboveGradeSqft * rates.aboveGradeInteriorPerSqft * compositeMultiplier,
  );
  const belowGradeFinished = round(
    belowGradeFinishedSqft * rates.belowGradeFinishedPerSqft * compositeMultiplier,
  );
  const belowGradeUnfinished = round(
    belowGradeUnfinishedSqft * rates.belowGradeUnfinishedPerSqft * compositeMultiplier,
  );
  const belowGradeTotal = belowGradeFinished + belowGradeUnfinished;
  const interior = aboveGrade + belowGradeTotal;

  const exterior = round(
    aboveGradeSqft * rates.exteriorPerAboveSqft * compositeMultiplier,
  );
  const landscaping = round(
    aboveGradeSqft * rates.landscapingPerAboveSqft * compositeMultiplier,
  );
  const systems = round(calculateSystems(rates, buildingSqft, compositeMultiplier));

  const total = interior + exterior + landscaping + systems;

  return {
    compositeMultiplier: roundTo(compositeMultiplier, 4),
    typeMultiplier,
    conditionMultiplier,
    priceMultiplier,
    ageMultiplier,
    aboveGrade,
    belowGradeFinished,
    belowGradeUnfinished,
    belowGradeTotal,
    interior,
    exterior,
    landscaping,
    systems,
    total,
    perSqftBuilding: buildingSqft > 0 ? roundTo(total / buildingSqft, 2) : 0,
    perSqftAboveGrade: aboveGradeSqft > 0 ? roundTo(total / aboveGradeSqft, 2) : 0,
  };
}

function round(value: number): number {
  return Math.round(value);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
