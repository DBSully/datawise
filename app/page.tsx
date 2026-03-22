import Link from "next/link";

const cards = [
  {
    href: "/properties",
    title: "Properties",
    description: "Browse the canonical real property records that DataWise owns.",
  },
  {
    href: "/properties/new",
    title: "New Property",
    description: "Create a property manually when MLS or public-record data is missing.",
  },
  {
    href: "/imports",
    title: "Imports",
    description: "Track MLS, public-record, and manual ingestion workflows.",
  },
  {
    href: "/analyses",
    title: "Analyses",
    description: "View saved analyses that will sit on top of core property records.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">DataWise</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
          Property-first analytics platform
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-slate-600">
          Start with canonical real property records. Everything else—physical facts,
          listings, overrides, analyses, and sharing—builds on top of that foundation.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h2 className="text-xl font-medium text-slate-900">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
