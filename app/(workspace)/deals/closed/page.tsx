// Phase 1 Step 3B Task 3 — thin wrapper that delegates to /action with
// ?status=closed.
//
// The canonical Closed Deals view now lives at app/(workspace)/action/page.tsx
// (?status=closed branch). This file is a tiny wrapper so the legacy
// /deals/closed URL continues to work during the side-by-side transition
// (3B-3E). Both URLs render identical UI from the same component.
//
// Unlike a straight `export { default } from ...` re-export, this wrapper
// has to inject the status query param so the canonical page renders the
// closed-deals branch instead of the active pipeline branch.
//
// In Phase 1 Step 3F, this file becomes a redirect() to /action?status=closed.

import ActionPage from "@/app/(workspace)/action/page";

export const dynamic = "force-dynamic";

export default async function ClosedDealsLegacyWrapper() {
  return ActionPage({ searchParams: Promise.resolve({ status: "closed" }) });
}
