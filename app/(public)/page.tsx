import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-3xl py-20 text-center">
      <Image
        src="/logos/datawise-logo-transparent.png"
        alt="DataWise"
        width={280}
        height={240}
        className="mx-auto"
        priority
      />

      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">
        DataWiseRE
      </h1>
      <p className="mt-3 text-base text-slate-600">
        Property-centric real estate analytics for serious decision making.
      </p>

      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/auth/sign-in"
          className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}
