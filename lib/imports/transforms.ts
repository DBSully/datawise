export function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizedAddressKeyFromRow(input: {
  address: string;
  city: string;
  state: string;
  postalCode: string;
  unitNumber?: string | null;
}) {
  return [
    normalizeWhitespace(input.address),
    normalizeWhitespace(input.city),
    normalizeWhitespace(input.state),
    normalizeWhitespace(input.postalCode),
    normalizeWhitespace(input.unitNumber ?? "") ? `unit ${normalizeWhitespace(input.unitNumber ?? "")}` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
