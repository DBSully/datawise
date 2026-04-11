// Phase 1 Step 3B Task 3 — thin re-export wrapper.
//
// The canonical Pipeline view now lives at app/(workspace)/action/page.tsx
// (default ?status=active). This file is a one-line wrapper so the legacy
// /deals/pipeline URL continues to work during the side-by-side transition
// (3B-3E). Both URLs render identical UI from the same component.
//
// In Phase 1 Step 3F, this file becomes a redirect() to /action.

export { default } from "@/app/(workspace)/action/page";
