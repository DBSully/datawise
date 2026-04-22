export type FilePreview = {
  fileName: string;
  rowCount: number;
  uniqueListingCount: number;
  uniquePropertyCount: number;
  duplicateListingCount: number;
  missingHeaders: string[];
  rowErrorCount: number;
  rowWarningCount: number;
};

export type ImportPreviewState = {
  status: "idle" | "error" | "ready";
  message: string | null;
  batchId: string | null;
  screeningBatchId: string | null;
  sourceSystem: string | null;
  importProfile: string | null;
  totalFiles: number;
  totalRows: number;
  uniqueListingCount: number;
  uniquePropertyCount: number;
  importedToday: number;
  importedRolling30: number;
  crossFileDuplicateCount: number;
  fileSummaries: FilePreview[];
  errors: string[];
  warnings: string[];
};

export const initialImportPreviewState: ImportPreviewState = {
  status: "idle",
  message: null,
  batchId: null,
  screeningBatchId: null,
  sourceSystem: null,
  importProfile: null,
  totalFiles: 0,
  totalRows: 0,
  uniqueListingCount: 0,
  uniquePropertyCount: 0,
  importedToday: 0,
  importedRolling30: 0,
  crossFileDuplicateCount: 0,
  fileSummaries: [],
  errors: [],
  warnings: [],
};
