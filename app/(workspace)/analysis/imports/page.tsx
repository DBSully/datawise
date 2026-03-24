import { ImportUploadPanel } from "@/components/imports/import-upload-panel";

export default function ImportsPage() {
  return (
    <section className="dw-section-stack">
      <div>
        <h1 className="dw-page-title">Imports</h1>
        <p className="dw-page-copy">
          Upload one or more REcolorado CSV files, validate them, and stage them for processing.
        </p>
      </div>

      <ImportUploadPanel />
    </section>
  );
}
