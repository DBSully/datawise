"use client";

import { useActionState } from "react";
import { previewImportAction } from "@/app/(workspace)/intake/imports/actions";
import { initialImportPreviewState } from "@/lib/imports/import-preview-state";

export function ImportUploadPanel() {
  const [state, formAction, isPending] = useActionState(
    previewImportAction,
    initialImportPreviewState,
  );

  const safeState = state ?? initialImportPreviewState;

  return (
    <div className="dw-section-stack">
      <form action={formAction} className="dw-card space-y-4">
        <div>
          <label className="dw-label">Import profile</label>
          <input
            className="dw-input bg-slate-100"
            value="recolorado_basic_50"
            readOnly
          />
        </div>

        <div>
          <label className="dw-label">CSV files</label>
          <input
            type="file"
            name="files"
            accept=".csv"
            multiple
            className="dw-input"
            required
          />
          <p className="mt-2 text-xs text-slate-500">
            You can upload one or more files in the same session. Repeated file
            names such as recolorado_basic_50 (1).csv are supported.
          </p>
        </div>

        <div>
          <label className="dw-label">Import notes (optional)</label>
          <textarea
            name="import_notes"
            className="dw-textarea min-h-24"
            placeholder="Example: Denver active listings for Client A"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="dw-button-primary"
            disabled={isPending}
          >
            {isPending ? "Importing, processing, and screening..." : "Import"}
          </button>
          <span className="text-xs text-slate-500">
            Uploads, validates, processes into core tables, and auto-screens
            in one step.
          </span>
        </div>
      </form>

      {safeState.message ? (
        <div
          className={`dw-card-tight text-sm ${
            state.status === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {safeState.message}
        </div>
      ) : null}

      {(safeState.totalFiles > 0 || safeState.errors.length > 0) && (
        <div className="dw-card space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Files
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {safeState.totalFiles}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Total Rows
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {safeState.totalRows}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Unique Listings
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {safeState.uniqueListingCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Unique Properties
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {safeState.uniquePropertyCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Imported Today
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {safeState.importedToday}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Rolling 30 Days
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {safeState.importedRolling30}
              </p>
            </div>
          </div>

          {safeState.batchId ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Batch ID:{" "}
              <span className="font-mono text-slate-900">
                {safeState.batchId}
              </span>
            </div>
          ) : null}

          {safeState.errors.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Errors</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                {safeState.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {safeState.warnings.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Warnings</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
                {safeState.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {safeState.fileSummaries.length > 0 ? (
            <div className="dw-table-wrap">
              <table className="dw-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Rows</th>
                    <th>Unique Listings</th>
                    <th>Unique Properties</th>
                    <th>Duplicate Listings</th>
                    <th>Row Errors</th>
                    <th>Row Warnings</th>
                    <th>Missing Headers</th>
                  </tr>
                </thead>
                <tbody>
                  {safeState.fileSummaries.map((fileSummary) => (
                    <tr key={fileSummary.fileName}>
                      <td>{fileSummary.fileName}</td>
                      <td>{fileSummary.rowCount}</td>
                      <td>{fileSummary.uniqueListingCount}</td>
                      <td>{fileSummary.uniquePropertyCount}</td>
                      <td>{fileSummary.duplicateListingCount}</td>
                      <td>{fileSummary.rowErrorCount}</td>
                      <td>{fileSummary.rowWarningCount}</td>
                      <td>
                        {fileSummary.missingHeaders.length > 0
                          ? fileSummary.missingHeaders.join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
