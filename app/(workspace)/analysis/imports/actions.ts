"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { parseCsvText } from "@/lib/imports/csv";
import {
  normalizeFilenameBase,
  recoloradoBasic50Profile,
} from "@/lib/imports/profiles/recolorado_basic_50";
import { validateParsedFile } from "@/lib/imports/validators";
import {
  initialImportPreviewState,
  type ImportPreviewState,
} from "@/lib/imports/import-preview-state";
import { processImportBatch } from "@/lib/imports/process-batch";

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function isoStartOfUtcDay(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

function isoRollingThirtyDayStart(date: Date) {
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - 29);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function previewImportAction(
  _previousState: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ...initialImportPreviewState,
      status: "error",
      message: "You must be signed in to upload import files.",
      errors: ["Authentication required."],
    };
  }

  const importNotesValue = formData.get("import_notes");
  const importNotes =
    typeof importNotesValue === "string" ? importNotesValue.trim() : null;

  const uploadedFiles = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (uploadedFiles.length === 0) {
    return {
      ...initialImportPreviewState,
      status: "error",
      message: "Select one or more CSV files before uploading.",
      errors: ["No files were selected."],
    };
  }

  const fileAnalyses: Array<{
    file: File;
    fileHash: string;
    validated: ReturnType<typeof validateParsedFile>;
  }> = [];

  for (const file of uploadedFiles) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return {
        ...initialImportPreviewState,
        status: "error",
        message: `The file ${file.name} is not a CSV file.`,
        errors: [`Only CSV uploads are supported. Invalid file: ${file.name}`],
      };
    }

    const fileText = await file.text();
    const fileHash = createHash("sha256").update(fileText).digest("hex");
    const parsedCsv = parseCsvText(fileText);
    const validated = validateParsedFile({
      fileName: file.name,
      parsedCsv,
      profile: recoloradoBasic50Profile,
    });

    fileAnalyses.push({ file, fileHash, validated });
  }

  const headerErrors = fileAnalyses.flatMap(({ validated }) =>
    validated.summary.missingHeaders.map(
      (header) =>
        `${validated.summary.fileName}: missing required header "${header}"`,
    ),
  );

  if (headerErrors.length > 0) {
    return {
      ...initialImportPreviewState,
      status: "error",
      message: "One or more files are missing required headers.",
      fileSummaries: fileAnalyses.map(({ validated }) => validated.summary),
      errors: headerErrors,
    };
  }

  const allListingIds = fileAnalyses.flatMap(({ validated }) =>
    validated.rowValidations
      .map((rowValidation) => rowValidation.sourceRecordKey)
      .filter((value): value is string => Boolean(value)),
  );

  const listingIdCounts = new Map<string, number>();
  allListingIds.forEach((listingId) => {
    listingIdCounts.set(listingId, (listingIdCounts.get(listingId) ?? 0) + 1);
  });

  const crossFileDuplicateCount = Array.from(listingIdCounts.values()).reduce(
    (total, count) => total + (count > 1 ? count - 1 : 0),
    0,
  );

  const totalRows = fileAnalyses.reduce(
    (total, { validated }) => total + validated.summary.rowCount,
    0,
  );

  const uniqueListingCount = listingIdCounts.size;

  const uniquePropertyKeys = new Set<string>();
  fileAnalyses.forEach(({ validated }) => {
    validated.rowValidations.forEach((rowValidation) => {
      const address = rowValidation.rawRow["Address"] ?? "";
      const city = rowValidation.rawRow["City"] ?? "";
      const postalCode = rowValidation.rawRow["Postal Code"] ?? "";
      const unitNumber = rowValidation.rawRow["Unit Number"] ?? "";

      if (String(address).trim() && String(city).trim()) {
        uniquePropertyKeys.add(
          `${address}|${city}|${recoloradoBasic50Profile.defaultState}|${postalCode}|${unitNumber}`.toLowerCase(),
        );
      }
    });
  });

  const uniquePropertyCount = uniquePropertyKeys.size;

  const summaryWarnings: string[] = [];
  if (crossFileDuplicateCount > 0) {
    summaryWarnings.push(
      `This upload contains ${crossFileDuplicateCount} duplicate listing record(s) across the selected file set.`,
    );
  }

  const primaryFileName =
    uploadedFiles.length === 1
      ? uploadedFiles[0].name
      : `${normalizeFilenameBase(uploadedFiles[0].name)} (+${uploadedFiles.length - 1} more)`;

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      source_system: recoloradoBasic50Profile.sourceSystem,
      import_profile: recoloradoBasic50Profile.id,
      file_name: primaryFileName,
      uploaded_by_user_id: user.id,
      row_count: totalRows,
      total_row_count: totalRows,
      unique_listing_count: uniqueListingCount,
      unique_property_count: uniquePropertyCount,
      file_count: uploadedFiles.length,
      import_notes: importNotes,
      status: "staged",
      summary: {
        profile: recoloradoBasic50Profile.id,
        totalFiles: uploadedFiles.length,
        totalRows,
        uniqueListingCount,
        uniquePropertyCount,
        crossFileDuplicateCount,
      },
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return {
      ...initialImportPreviewState,
      status: "error",
      message: batchError?.message ?? "Failed to create import batch.",
      errors: [batchError?.message ?? "Failed to create import batch."],
    };
  }

  for (const { file, fileHash, validated } of fileAnalyses) {
    const { data: batchFile, error: batchFileError } = await supabase
      .from("import_batch_files")
      .insert({
        import_batch_id: batch.id,
        source_system: recoloradoBasic50Profile.sourceSystem,
        original_filename: file.name,
        normalized_filename_base: normalizeFilenameBase(file.name),
        file_size_bytes: file.size,
        row_count: validated.summary.rowCount,
        unique_listing_count: validated.summary.uniqueListingCount,
        content_hash: fileHash,
      })
      .select("id")
      .single();

    if (batchFileError || !batchFile) {
      return {
        ...initialImportPreviewState,
        status: "error",
        message:
          batchFileError?.message ??
          `Failed to save metadata for ${file.name}.`,
        errors: [
          batchFileError?.message ??
            `Failed to save metadata for ${file.name}.`,
        ],
      };
    }

    const rowPayloads = validated.rowValidations.map((rowValidation) => ({
      import_batch_id: batch.id,
      import_batch_file_id: batchFile.id,
      row_number: rowValidation.rowNumber,
      source_system: recoloradoBasic50Profile.sourceSystem,
      source_record_key: rowValidation.sourceRecordKey,
      raw_row: rowValidation.rawRow,
      processing_status:
        rowValidation.validationErrors.length > 0
          ? "validation_error"
          : "validated",
      error_message:
        rowValidation.validationErrors.length > 0
          ? rowValidation.validationErrors.join(" | ")
          : null,
      validation_errors:
        rowValidation.validationErrors.length > 0 ||
        rowValidation.warningMessages.length > 0
          ? {
              errors: rowValidation.validationErrors,
              warnings: rowValidation.warningMessages,
            }
          : null,
    }));

    for (const chunk of chunkArray(rowPayloads, 200)) {
      const { error: rowInsertError } = await supabase
        .from("import_batch_rows")
        .insert(chunk);

      if (rowInsertError) {
        return {
          ...initialImportPreviewState,
          status: "error",
          message: rowInsertError.message,
          errors: [rowInsertError.message],
        };
      }
    }
  }

  const now = new Date();
  const todayStartIso = isoStartOfUtcDay(now);
  const rollingThirtyStartIso = isoRollingThirtyDayStart(now);

  const { data: recentBatches } = await supabase
    .from("import_batches")
    .select("created_at,total_row_count")
    .eq("source_system", recoloradoBasic50Profile.sourceSystem)
    .gte("created_at", rollingThirtyStartIso)
    .order("created_at", { ascending: false });

  const importedToday = (recentBatches ?? [])
    .filter((row) => row.created_at >= todayStartIso)
    .reduce((total, row) => total + (row.total_row_count ?? 0), 0);

  const importedRolling30 = (recentBatches ?? []).reduce(
    (total, row) => total + (row.total_row_count ?? 0),
    0,
  );

  return {
    status: "ready",
    message:
      "Upload staged successfully. The batch is stored and ready for processing.",
    batchId: batch.id,
    sourceSystem: recoloradoBasic50Profile.sourceSystem,
    importProfile: recoloradoBasic50Profile.id,
    totalFiles: uploadedFiles.length,
    totalRows,
    uniqueListingCount,
    uniquePropertyCount,
    importedToday,
    importedRolling30,
    crossFileDuplicateCount,
    fileSummaries: fileAnalyses.map(({ validated }) => validated.summary),
    errors: [],
    warnings: summaryWarnings,
  };
}

export async function processImportBatchAction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const batchIdValue = formData.get("batch_id");
  const batchId = typeof batchIdValue === "string" ? batchIdValue.trim() : "";

  if (!batchId) {
    redirect("/analysis/imports?process_error=Missing%20batch%20id");
  }

  let redirectUrl = `/analysis/imports?processed=1&batch=${encodeURIComponent(batchId)}`;

  try {
    await processImportBatch(batchId);
    revalidatePath("/analysis/imports");
    revalidatePath("/analysis/properties");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process import batch.";
    redirectUrl = `/analysis/imports?process_error=${encodeURIComponent(message)}`;
  }

  redirect(redirectUrl);
}
