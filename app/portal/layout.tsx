// Partner portal layout.
//
// Separate from the analyst workspace. Partners see a clean, minimal
// chrome with their own nav: My Deals, Profile, Sign Out.
// No auth check here — unauthenticated partners can VIEW shared deals
// without login (Decision 4.3). The share_token is the authorization
// boundary, verified in each page's server component.

import Link from "next/link";
import { PortalSignOutButton } from "./portal-sign-out-button";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/portal"
              className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900"
            >
              DataWise
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/portal" className="hover:text-slate-900">
                My Deals
              </Link>
              <Link href="/portal/profile" className="hover:text-slate-900">
                Profile
              </Link>
              <span className="mx-1 text-slate-300">|</span>
              <Link href="/offerings" className="hover:text-slate-900">
                Offerings
              </Link>
              <Link href="/methodology" className="hover:text-slate-900">
                Methodology
              </Link>
              <Link href="/contact" className="hover:text-slate-900">
                Contact
              </Link>
            </nav>
          </div>
          <PortalSignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
