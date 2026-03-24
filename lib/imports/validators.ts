import type { ParsedCsv } from "@/lib/imports/csv";
import type { ImportProfile } from "@/lib/imports/profiles/recolorado_basic_50";
import { normalizedAddressKeyFromRow } from "@/lib/imports/transforms";

export type FileValidationSummary = {
  fileName: string;
  rowCount: number;
  uniqueListingCount: number;
  uniquePropertyCount: number;
  duplicateListingCount: number;
  missingHeaders: string[];
  rowErrorCount: number;
  rowWarningCount: number;
};

export type RowValidation = {
  rowNumber: number;
  sourceRecordKey: string | null;
  validationErrors: string[];
  warningMessages: string[];
  rawRow: Record<string, string>;
};

export type ValidatedFile = {
  summary: FileValidationSummary;
  rowValidations: RowValidation[];
};

export function validateParsedFile(params: {
  fileName: string;
  parsedCsv: ParsedCsv;
  profile: ImportProfile;
}) : ValidatedFile {
  const { fileName, parsedCsv, profile } = params;

  const missingHeaders = profile.requiredHeaders.filter(
    (header) => !parsedCsv.headers.includes(header)
  );

  const listingIdCounts = new Map<string, number>();
  const propertyKeys = new Set<string>();
  const rowValidations: RowValidation[] = [];

  parsedCsv.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const validationErrors: string[] = [];
    const warningMessages: string[] = [];

    const listingId = (row["Listing ID"] ?? "").trim() || null;
    const address = (row["Address"] ?? "").trim();
    const city = (row["City"] ?? "").trim();
    const postalCode = (row["Postal Code"] ?? "").trim();
    const unitNumber = (row["Unit Number"] ?? "").trim();

    profile.requiredRowFields.forEach((field) => {
      if (!(row[field] ?? "").trim()) {
        validationErrors.push(`Missing required value: ${field}`);
      }
    });

    if (!(row["Latitude"] ?? "").trim() || !(row["Longitude"] ?? "").trim()) {
      warningMessages.push("Missing latitude/longitude");
    }

    if (!(row["Parcel Number"] ?? "").trim()) {
      warningMessages.push("Missing parcel number");
    }

    if (listingId) {
      listingIdCounts.set(listingId, (listingIdCounts.get(listingId) ?? 0) + 1);
    }

    if (address && city) {
      propertyKeys.add(
        normalizedAddressKeyFromRow({
          address,
          city,
          state: profile.defaultState,
          postalCode,
          unitNumber,
        })
      );
    }

    rowValidations.push({
      rowNumber,
      sourceRecordKey: listingId,
      validationErrors,
      warningMessages,
      rawRow: row,
    });
  });

  let rowErrorCount = 0;
  let rowWarningCount = 0;

  rowValidations.forEach((rowValidation) => {
    if (rowValidation.sourceRecordKey && (listingIdCounts.get(rowValidation.sourceRecordKey) ?? 0) > 1) {
      rowValidation.warningMessages.push("Duplicate Listing ID within this file");
    }

    if (rowValidation.validationErrors.length > 0) {
      rowErrorCount += 1;
    }

    if (rowValidation.warningMessages.length > 0) {
      rowWarningCount += 1;
    }
  });

  const duplicateListingCount = Array.from(listingIdCounts.values()).reduce(
    (total, count) => total + (count > 1 ? count - 1 : 0),
    0
  );

  return {
    summary: {
      fileName,
      rowCount: parsedCsv.rows.length,
      uniqueListingCount: listingIdCounts.size,
      uniquePropertyCount: propertyKeys.size,
      duplicateListingCount,
      missingHeaders,
      rowErrorCount,
      rowWarningCount,
    },
    rowValidations,
  };
}
