import Link from "next/link";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex h-12 items-center justify-between px-4">
          <Link
            href="/"
            className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900"
          >
            DataWise
          </Link>

          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link href="/offerings" className="hover:text-slate-900">
              Offerings
            </Link>
            <Link href="/methodology" className="hover:text-slate-900">
              Methodology
            </Link>
            <Link href="/contact" className="hover:text-slate-900">
              Contact
            </Link>
            <Link
              href="/auth/sign-in"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-900 hover:bg-slate-100"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="px-4 py-10">{children}</main>
    </div>
  );
}
