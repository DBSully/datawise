// Phase 1 Step 4D — Partner portal layout.
//
// Separate route group from the analyst workspace. Partners never see
// the analyst's AppChrome navigation. This layout provides a minimal
// partner-focused chrome: clean white background, no nav bar, just
// the content. Per Decision 4.1 (separate portal route group).
//
// No auth check here — partners can VIEW without login (Decision 4.3).
// The share_token is the authorization boundary, verified in the page's
// server component.

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
