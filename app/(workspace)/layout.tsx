import { Suspense } from "react";
import { AppChrome } from "@/components/layout/app-chrome";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Suspense boundary required because AppChrome uses useSearchParams()
  // (added in Step 3B Task 5 for the Action tab matching). Without it,
  // Next.js production builds fail on static page generation with
  // "useSearchParams() should be wrapped in a suspense boundary".
  return (
    <Suspense>
      <AppChrome>{children}</AppChrome>
    </Suspense>
  );
}
