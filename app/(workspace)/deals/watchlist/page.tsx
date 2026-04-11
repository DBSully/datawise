// Phase 1 Step 3B Task 1 — thin re-export wrapper.
//
// The canonical Watch List implementation now lives at
// app/(workspace)/analysis/page.tsx. This file is a one-line
// wrapper so the legacy /deals/watchlist URL continues to work
// during the side-by-side transition (3B-3E). Both URLs render
// identical UI from the same component.
//
// In Phase 1 Step 3F, this file becomes a redirect() call:
//   import { redirect } from "next/navigation";
//   export default function() { redirect("/analysis"); }
// At that point, the /deals/watchlist URL stops serving content
// directly and starts redirecting to /analysis.

export { default } from "@/app/(workspace)/analysis/page";
