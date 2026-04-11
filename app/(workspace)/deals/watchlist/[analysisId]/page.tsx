// Phase 1 Step 3B Task 2 — thin re-export wrapper.
//
// The canonical Workstation route now lives at
// app/(workspace)/analysis/[analysisId]/page.tsx. This file is a
// one-line wrapper so the legacy /deals/watchlist/[analysisId] URL
// continues to work during the side-by-side transition (3B-3E).
// Both URLs render identical UI from the same component.
//
// In Phase 1 Step 3F, this file becomes a redirect() to
// /analysis/[analysisId].

export { default } from "@/app/(workspace)/analysis/[analysisId]/page";
