import Link from "next/link";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-5xl">
      <div className="grid gap-10 py-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            DataWise
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
            Property-centric real estate analytics for serious decision making.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-slate-600">
            DataWise is being built to unify property facts, source data,
            underwriting logic, and client-facing reporting into one scalable
            platform.
          </p>

          <div className="mt-6 flex gap-3">
            <Link href="/offerings" className="dw-button-primary">
              View offerings
            </Link>
            <Link href="/auth/sign-in" className="dw-button-secondary">
              Sign in
            </Link>
          </div>
        </div>

        <div className="dw-card">
          <h2 className="text-lg font-semibold text-slate-900">
            Current focus
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            Building the analysis foundation: canonical property records, MLS
            intake, underwriting workflows, and report delivery.
          </p>
        </div>
      </div>
    </section>
  );
}
