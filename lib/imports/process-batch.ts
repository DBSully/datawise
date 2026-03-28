import "server-only";

import { createClient } from "@/lib/supabase/server";
import { recoloradoBasic50Profile } from "@/lib/imports/profiles/recolorado_basic_50";
import {
  buildAddressSlug,
  buildNormalizedAddressKey,
  deriveLevelClass,
  derivePropertyType,
  getText,
  parseBooleanYesNo,
  parseCurrency,
  parseDateToIsoDate,
  parseInteger,
  parseNumber,
  type RawImportRow,
} from "@/lib/imports/cleaners";

export type ProcessImportBatchResult = {
  batchId: string;
  rowsConsidered: number;
  rowsProcessed: number;
  rowErrors: number;
  listingsInserted: number;
  listingsUpdated: number;
  propertiesCreated: number;
  propertiesMatched: number;
  physicalUpserts: number;
  financialUpserts: number;
  warnings: string[];
  errors: string[];
};

type ImportBatchRowRecord = {
  id: string;
  import_batch_id: string;
  row_number: number;
  source_system: string | null;
  source_record_key: string | null;
  raw_row: RawImportRow | null;
  processing_status: string | null;
};

type BatchRecord = {
  id: string;
  source_system: string | null;
  import_profile: string | null;
  status: string | null;
  summary: Record<string, unknown> | null;
};

const ROW_PAGE_SIZE = 500;

function toRealPropertyPayload(row: RawImportRow) {
  const unparsedAddress = getText(row, "Address");
  const streetNumber = getText(row, "Street Number");
  const streetPreDirection = getText(row, "Street Dir Prefix");
  const streetName = getText(row, "Street Name");
  const streetPostDirection = getText(row, "Street Dir Suffix");
  const streetSuffix = getText(row, "Street Suffix");
  const unitNumber = getText(row, "Unit Number");
  const city = getText(row, "City");
  const county = getText(row, "County Or Parish");
  const postalCode = getText(row, "Postal Code");
  const latitude = parseNumber(row["Latitude"]);
  const longitude = parseNumber(row["Longitude"]);
  const lotSizeSqft = parseNumber(row["Lot Size Square Feet"]);
  const lotSizeAcres = parseNumber(row["Lot Size Acres"]);
  const parcelId = getText(row, "Parcel Number");

  const normalizedAddressKey = buildNormalizedAddressKey({
    unparsedAddress,
    streetNumber,
    streetPreDirection,
    streetName,
    streetSuffix,
    streetPostDirection,
    unitNumber,
    city,
    state: recoloradoBasic50Profile.defaultState,
    postalCode,
  });

  return {
    unparsed_address: unparsedAddress,
    street_number: streetNumber,
    street_pre_direction: streetPreDirection,
    street_name: streetName,
    street_post_direction: streetPostDirection,
    street_suffix: streetSuffix,
    unit_number: unitNumber,
    city,
    county,
    state: recoloradoBasic50Profile.defaultState,
    postal_code: postalCode,
    parcel_id: parcelId,
    latitude,
    longitude,
    lot_size_sqft: lotSizeSqft,
    lot_size_acres: lotSizeAcres,
    normalized_address_key: normalizedAddressKey,
    address_slug: buildAddressSlug({
      unparsedAddress,
      city,
      state: recoloradoBasic50Profile.defaultState,
      postalCode,
    }),
    geocode_source: latitude !== null && longitude !== null ? "mls" : null,
  };
}

function deriveBuildingFormStandardized(
  structureType: string | null,
): string | null {
  const value = (structureType ?? "").trim().toLowerCase();

  if (value.startsWith("high rise")) return "high_rise";
  if (value.startsWith("mid rise")) return "mid_rise";
  if (value.startsWith("low rise")) return "low_rise";
  if (value.startsWith("townhouse")) return "townhouse_style";
  if (value.startsWith("patio/cluster")) return "patio_cluster";
  if (value.startsWith("duplex")) return "duplex";
  if (value.startsWith("triplex")) return "triplex";
  if (value.startsWith("quadruplex")) return "quadruplex";
  if (value.startsWith("manufactured house")) return "manufactured_house";
  if (value.startsWith("house")) return "house";

  return null;
}

function toPropertyPhysicalPayload(row: RawImportRow) {
  const propertySubType = getText(row, "Property Sub Type");
  const structureType = getText(row, "Structure Type");
  const attached = parseBooleanYesNo(row["Attached Property"]);
  const levelsRaw = getText(row, "Levels");
  const belowGradeTotalSqft = parseNumber(row["Below Grade (SqFt) Total"]);
  const belowGradeFinishedSqft = parseNumber(row["Below Grade Finished Area"]);

  return {
    property_type: derivePropertyType({
      propertySubType,
      structureType,
      attached,
    }),
    property_sub_type: propertySubType,
    structure_type: structureType,
    property_attached_yn: attached,
    levels_raw: levelsRaw,
    level_class_standardized: deriveLevelClass(levelsRaw),
    building_form_standardized: deriveBuildingFormStandardized(structureType),
    year_built: parseInteger(row["Year Built"]),
    building_area_total_sqft: parseNumber(row["Building Area Total"]),
    living_area_sqft: null,
    above_grade_finished_area_sqft: parseNumber(
      row["Above Grade Finished Area"],
    ),
    below_grade_total_sqft: belowGradeTotalSqft,
    below_grade_finished_area_sqft: belowGradeFinishedSqft,
    below_grade_unfinished_area_sqft:
      belowGradeTotalSqft !== null && belowGradeFinishedSqft !== null
        ? Math.max(belowGradeTotalSqft - belowGradeFinishedSqft, 0)
        : null,
    basement_yn: belowGradeTotalSqft !== null ? belowGradeTotalSqft > 0 : null,
    bedrooms_total: parseInteger(row["Bedrooms Total"]),
    bathrooms_total: parseNumber(row["Bathrooms Total Integer"]),
    garage_spaces: parseNumber(row["Garage Spaces"]),
    number_of_units_total: null,
    main_level_bedrooms: parseInteger(row["Main Level Bedrooms"]),
    main_level_bathrooms: parseNumber(row["Main Level Bathrooms"]),
    upper_level_bedrooms: parseInteger(row["Upper Level Bedrooms"]),
    upper_level_bathrooms: parseNumber(row["Upper Level Bathrooms"]),
    basement_level_bedrooms: null,
    basement_level_bathrooms: null,
    lower_level_bedrooms: null,
    lower_level_bathrooms: null,
    architectural_style: null,
  };
}

function toPropertyFinancialsPayload(row: RawImportRow, listingId: string) {
  return {
    annual_property_tax: parseCurrency(row["Tax Annual Amount"]),
    annual_hoa_dues: parseCurrency(row["Association Fee Total Annual"]),
    source_system: recoloradoBasic50Profile.sourceSystem,
    source_record_id: listingId,
  };
}

function toMlsListingPayload(params: {
  row: RawImportRow;
  realPropertyId: string;
  batchId: string;
  listingId: string;
}) {
  const { row, realPropertyId, batchId, listingId } = params;

  return {
    source_system: recoloradoBasic50Profile.sourceSystem,
    listing_id: listingId,
    real_property_id: realPropertyId,
    mls_status: getText(row, "Mls Status"),
    mls_major_change_type: getText(row, "Mls Major Change Type"),
    property_condition_source: getText(row, "Property Condition"),
    original_list_price: parseCurrency(row["Original List Price"]),
    list_price: parseCurrency(row["List Price"]),
    close_price: parseCurrency(row["Close Price"]),
    concessions_amount: parseCurrency(row["Concessions Amount"]),
    listing_contract_date: parseDateToIsoDate(row["Listing Contract Date"]),
    purchase_contract_date: parseDateToIsoDate(row["Purchase Contract Date"]),
    close_date: parseDateToIsoDate(row["Close Date"]),
    subdivision_name: getText(row, "Subdivision Name"),
    ownership_raw: getText(row, "Ownership"),
    occupant_type: getText(row, "Occupant Type"),
    elementary_school: getText(row, "Elementary School"),
    list_agent_mls_id: getText(row, "List Agent Mls Id"),
    buyer_agent_mls_id: getText(row, "Buyer Agent Mls Id"),
    last_import_batch_id: batchId,
  };
}

function nonNullEntries<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );
}

async function fetchNextValidatedRowPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
): Promise<ImportBatchRowRecord[]> {
  const { data, error } = await supabase
    .from("import_batch_rows")
    .select(
      `
      id,
      import_batch_id,
      row_number,
      source_system,
      source_record_key,
      raw_row,
      processing_status
    `,
    )
    .eq("import_batch_id", batchId)
    .eq("processing_status", "validated")
    .order("row_number", { ascending: true })
    .range(0, ROW_PAGE_SIZE - 1);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ImportBatchRowRecord[];
}

async function countRowsByStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
  status: string,
) {
  const { count, error } = await supabase
    .from("import_batch_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_batch_id", batchId)
    .eq("processing_status", status);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function processImportBatch(
  batchId: string,
): Promise<ProcessImportBatchResult> {
  const supabase = await createClient();

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id,source_system,import_profile,status,summary")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Import batch not found.");
  }

  const batchRecord = batch as BatchRecord;

  const rowsConsidered = await countRowsByStatus(
    supabase,
    batchId,
    "validated",
  );

  const result: ProcessImportBatchResult = {
    batchId,
    rowsConsidered,
    rowsProcessed: 0,
    rowErrors: 0,
    listingsInserted: 0,
    listingsUpdated: 0,
    propertiesCreated: 0,
    propertiesMatched: 0,
    physicalUpserts: 0,
    financialUpserts: 0,
    warnings: [],
    errors: [],
  };

  while (true) {
    const stagedRows = await fetchNextValidatedRowPage(supabase, batchId);

    if (stagedRows.length === 0) {
      break;
    }

    for (const stagedRow of stagedRows) {
      const row = (stagedRow.raw_row ?? {}) as RawImportRow;

      try {
        const listingId =
          stagedRow.source_record_key ?? getText(row, "Listing ID");

        if (!listingId) {
          throw new Error(`Row ${stagedRow.row_number}: missing Listing ID.`);
        }

        const realPropertyPayload = toRealPropertyPayload(row);

        if (
          !realPropertyPayload.unparsed_address ||
          !realPropertyPayload.city ||
          !realPropertyPayload.state
        ) {
          throw new Error(
            `Row ${stagedRow.row_number}: missing required property fields (Address/City/State).`,
          );
        }

        const { data: existingPropertyRows, error: existingPropertyError } =
          await supabase
            .from("real_properties")
            .select("id,parcel_id")
            .eq(
              "normalized_address_key",
              realPropertyPayload.normalized_address_key,
            )
            .limit(1);

        if (existingPropertyError) {
          throw new Error(existingPropertyError.message);
        }

        const existingProperty = existingPropertyRows?.[0] ?? null;
        let realPropertyId: string;

        if (existingProperty) {
          realPropertyId = existingProperty.id;
          result.propertiesMatched += 1;

          const incomingParcelId = realPropertyPayload.parcel_id;
          if (
            existingProperty.parcel_id &&
            incomingParcelId &&
            existingProperty.parcel_id !== incomingParcelId
          ) {
            result.warnings.push(
              `Parcel mismatch for ${realPropertyPayload.unparsed_address}: existing ${existingProperty.parcel_id}, incoming ${incomingParcelId}.`,
            );
          }

          const updatePayload = nonNullEntries(realPropertyPayload);

          const { error: updatePropertyError } = await supabase
            .from("real_properties")
            .update(updatePayload)
            .eq("id", realPropertyId);

          if (updatePropertyError) {
            throw new Error(updatePropertyError.message);
          }
        } else {
          const { data: insertedProperty, error: insertPropertyError } =
            await supabase
              .from("real_properties")
              .insert(realPropertyPayload)
              .select("id")
              .single();

          if (insertPropertyError || !insertedProperty) {
            throw new Error(
              insertPropertyError?.message ??
                "Failed to insert real_properties row.",
            );
          }

          realPropertyId = insertedProperty.id;
          result.propertiesCreated += 1;
        }

        const physicalPayload = nonNullEntries({
          real_property_id: realPropertyId,
          ...toPropertyPhysicalPayload(row),
        });

        const { error: propertyPhysicalError } = await supabase
          .from("property_physical")
          .upsert(physicalPayload, { onConflict: "real_property_id" });

        if (propertyPhysicalError) {
          throw new Error(propertyPhysicalError.message);
        }

        result.physicalUpserts += 1;

        const financialPayload = nonNullEntries({
          real_property_id: realPropertyId,
          ...toPropertyFinancialsPayload(row, listingId),
        });

        const hasFinancialValues =
          "annual_property_tax" in financialPayload ||
          "annual_hoa_dues" in financialPayload;

        if (hasFinancialValues) {
          const { error: propertyFinancialError } = await supabase
            .from("property_financials")
            .upsert(financialPayload, { onConflict: "real_property_id" });

          if (propertyFinancialError) {
            throw new Error(propertyFinancialError.message);
          }

          result.financialUpserts += 1;
        }

        const { data: existingListingRows, error: existingListingError } =
          await supabase
            .from("mls_listings")
            .select("id")
            .eq("source_system", recoloradoBasic50Profile.sourceSystem)
            .eq("listing_id", listingId)
            .limit(1);

        if (existingListingError) {
          throw new Error(existingListingError.message);
        }

        const listingExisted = (existingListingRows?.length ?? 0) > 0;

        const mlsListingPayload = nonNullEntries(
          toMlsListingPayload({
            row,
            realPropertyId,
            batchId,
            listingId,
          }),
        );

        const { error: mlsListingError } = await supabase
          .from("mls_listings")
          .upsert(mlsListingPayload, {
            onConflict: "source_system,listing_id",
          });

        if (mlsListingError) {
          throw new Error(mlsListingError.message);
        }

        if (listingExisted) {
          result.listingsUpdated += 1;
        } else {
          result.listingsInserted += 1;
        }

        const { error: markProcessedError } = await supabase
          .from("import_batch_rows")
          .update({
            processing_status: "processed",
            error_message: null,
          })
          .eq("id", stagedRow.id);

        if (markProcessedError) {
          throw new Error(markProcessedError.message);
        }

        result.rowsProcessed += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown row processing error.";

        result.rowErrors += 1;
        result.errors.push(message);

        await supabase
          .from("import_batch_rows")
          .update({
            processing_status: "processing_error",
            error_message: message,
          })
          .eq("id", stagedRow.id);
      }
    }
  }

  const remainingValidatedRows = await countRowsByStatus(
    supabase,
    batchId,
    "validated",
  );
  const processingErrorRows = await countRowsByStatus(
    supabase,
    batchId,
    "processing_error",
  );
  const validationErrorRows = await countRowsByStatus(
    supabase,
    batchId,
    "validation_error",
  );
  const processedRowsTotal = await countRowsByStatus(
    supabase,
    batchId,
    "processed",
  );

  const nextBatchStatus =
    remainingValidatedRows > 0
      ? "staged"
      : processingErrorRows > 0 || validationErrorRows > 0
        ? "processed_with_errors"
        : "processed";

  const completedAt =
    nextBatchStatus === "staged" ? null : new Date().toISOString();

  const existingSummary =
    batchRecord.summary && typeof batchRecord.summary === "object"
      ? batchRecord.summary
      : {};

  const nextSummary = {
    ...existingSummary,
    processedAt: completedAt,
    rowsConsidered: result.rowsConsidered,
    rowsProcessedThisRun: result.rowsProcessed,
    rowsProcessedTotal: processedRowsTotal,
    rowErrorsThisRun: result.rowErrors,
    processingErrorRows,
    remainingValidatedRows,
    validationErrorRows,
    listingsInsertedThisRun: result.listingsInserted,
    listingsUpdatedThisRun: result.listingsUpdated,
    propertiesCreatedThisRun: result.propertiesCreated,
    propertiesMatchedThisRun: result.propertiesMatched,
    physicalUpsertsThisRun: result.physicalUpserts,
    financialUpsertsThisRun: result.financialUpserts,
    warningsThisRun: result.warnings.slice(0, 50),
    errorsThisRun: result.errors.slice(0, 50),
  };

  const { error: completeBatchError } = await supabase
    .from("import_batches")
    .update({
      status: nextBatchStatus,
      completed_at: completedAt,
      summary: nextSummary,
    })
    .eq("id", batchId);

  if (completeBatchError) {
    throw new Error(completeBatchError.message);
  }

  return result;
}