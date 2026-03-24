import "server-only";

export type RawImportRow = Record<string, unknown>;

export function getText(row: RawImportRow, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  let text = String(value).trim();
  if (!text) return null;

  const isNegative = text.startsWith("(") && text.endsWith(")");
  text = text.replace(/[,$]/g, "").replace(/[()]/g, "").trim();

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return isNegative ? -parsed : parsed;
}

export function parseInteger(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return Math.trunc(parsed);
}

export function parseCurrency(value: unknown): number | null {
  return parseNumber(value);
}

export function parseBooleanYesNo(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(normalized)) return true;
  if (["n", "no", "false", "0"].includes(normalized)) return false;
  return null;
}

export function parseDateToIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const datePart = raw.split(" ")[0];
  const slashParts = datePart.split("/");
  if (slashParts.length === 3) {
    const [monthRaw, dayRaw, yearRaw] = slashParts;
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    let year = Number(yearRaw);

    if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) {
      return null;
    }

    if (yearRaw.length === 2) {
      year += 2000;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeKeyPart(value: string | null): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildNormalizedAddressKey(params: {
  unparsedAddress: string | null;
  streetNumber: string | null;
  streetPreDirection: string | null;
  streetName: string | null;
  streetSuffix: string | null;
  streetPostDirection: string | null;
  unitNumber: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string {
  const streetParts = [
    params.streetNumber,
    params.streetPreDirection,
    params.streetName,
    params.streetSuffix,
    params.streetPostDirection,
  ]
    .map(normalizeKeyPart)
    .filter(Boolean);

  const baseAddress =
    streetParts.length > 0
      ? streetParts.join(" ")
      : normalizeKeyPart(params.unparsedAddress) ?? "";

  const parts = [
    baseAddress,
    params.unitNumber ? `unit ${normalizeKeyPart(params.unitNumber)}` : null,
    normalizeKeyPart(params.city),
    normalizeKeyPart(params.state),
    normalizeKeyPart(params.postalCode),
  ].filter(Boolean);

  return parts.join(" ").trim();
}

export function buildAddressSlug(params: {
  unparsedAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string | null {
  const combined = [params.unparsedAddress, params.city, params.state, params.postalCode]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!combined) return null;

  const slug = combined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || null;
}

export function derivePropertyType(params: {
  propertySubType: string | null;
  structureType: string | null;
  attached: boolean | null;
}): string | null {
  const haystack = `${params.propertySubType ?? ""} ${params.structureType ?? ""}`
    .toLowerCase()
    .trim();

  if (!haystack && params.attached === null) return null;

  if (haystack.includes("condo") || haystack.includes("condominium")) return "Condo";
  if (haystack.includes("townhome") || haystack.includes("townhouse")) return "Townhome";
  if (
    haystack.includes("duplex") ||
    haystack.includes("triplex") ||
    haystack.includes("quad") ||
    haystack.includes("fourplex") ||
    haystack.includes("multi")
  ) {
    return "Multi-Family";
  }
  if (haystack.includes("manufactured") || haystack.includes("mobile")) return "Manufactured";
  if (haystack.includes("single family") || haystack.includes("detached")) return "Detached";
  if (params.attached === true) return "Attached";
  if (params.attached === false) return "Detached";

  const fallback = params.propertySubType ?? params.structureType;
  return fallback ? fallback.trim() : null;
}

export function deriveLevelClass(levelsRaw: string | null): string | null {
  if (!levelsRaw) return null;
  const value = levelsRaw.toLowerCase().trim();

  if (value.includes("tri") || value.includes("split") || value.includes("multi")) {
    return "Multi-Level";
  }
  if (value.includes("bi")) return "Bi-Level";
  if (value.includes("three") || value.includes("3")) return "Three+ Story";
  if (value.includes("two") || value.includes("2")) return "Two Story";
  if (value.includes("one") || value.includes("1") || value.includes("single") || value.includes("ranch")) {
    return "One Story";
  }

  return levelsRaw;
}
