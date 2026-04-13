// app/(public)/methodology/page.tsx

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology | DataWiseRE",
  description:
    "How DataWiseRE builds its deal analyses — comparable selection, ARV, rehab, holding costs, and deal math.",
};

// ─── Data ────────────────────────────────────────────────────────────────────

const sections = [
  {
    number: "01",
    title: "Comparable Selection",
    body: `Every analysis begins with the comparable sales our analysts pull from recent closed transactions. Candidates are filtered by geography, property type, size, age, and bedroom and bathroom count — then evaluated across multiple similarity dimensions before a final set is confirmed.

Proximity matters, but it isn't the only thing that matters. A comp three blocks away in a materially different neighborhood carries less weight than one half a mile out that matches on every relevant dimension. Our process accounts for that. The analyst reviews the candidate pool and makes the final selection for each subject property.

The result is a comp set that reflects what a well-informed buyer would actually look at — not a mechanical radius pull.`,
  },
  {
    number: "02",
    title: "After Repair Value",
    body: `ARV is calculated from the confirmed comp set using a size-adjusted, recency-weighted methodology. Each comparable produces its own implied value for the subject property, adjusted for the size difference between the two homes. Those individual estimates are then blended into a single aggregate figure, with recent sales carrying more weight than older ones.

We use a nonlinear weighting structure — a comp that closed last month has significantly more influence than one that closed eight months ago, not just proportionally more. This reflects how markets actually move.

Three confidence tiers are assigned based on comp count, proximity, and recency. A high-confidence ARV is supported by multiple recent, nearby sales. A lower-confidence ARV is flagged for additional analyst scrutiny before any offer recommendation is made.`,
  },
  {
    number: "03",
    title: "Rehab Budget",
    body: `Rehab estimates are built from base per-square-foot rates adjusted for property type, age, condition, and price tier. These four dimensions are treated independently — each contributes a multiplier that is combined into a single composite adjustment applied to the base rates.

A 1920s detached home in fixer condition at a $350,000 list price carries a very different cost profile than a 2008 townhome in average condition at $550,000. The system reflects that. Interior, exterior, landscaping, and systems costs are calculated separately by property type — condos, for instance, carry no exterior or landscaping line.

Analysts can refine any component. These estimates are an informed starting point, not a fixed output.`,
  },
  {
    number: "04",
    title: "Holding & Transaction Costs",
    body: `Holding costs account for property tax, insurance, HOA, and utilities across the estimated renovation and sale period. The hold timeline itself is calibrated by property size — larger homes take longer to renovate and sell, and the model reflects that with a size-adjusted days-held calculation subject to a minimum floor.

Where actual tax and HOA data is available from the MLS, we use it. Where it is not, we apply market-calibrated fallback rates rather than zeroing the line.

Transaction costs cover title and closing fees on both the acquisition and disposition side, plus disposition commissions. All rates are documented and adjustable per deal.`,
  },
  {
    number: "05",
    title: "Financing",
    body: `For fix-and-flip analyses, financing costs reflect a hard money loan structure — interest-only carry over the hold period plus an upfront origination fee. The loan is sized against ARV rather than purchase price, which is how hard money lenders actually underwrite and which avoids a circular dependency in the calculation.

Default parameters reflect current Denver hard money market rates. Analysts can override the interest rate, origination points, and LTV for any deal to model different financing scenarios or reflect a specific lender relationship.`,
  },
  {
    number: "06",
    title: "Deal Math",
    body: `The maximum offer price is the residual: ARV minus all costs (rehab, holding, transaction, financing) minus the target profit. It is the highest price you can pay and still achieve your required return.

We also report spread — the gap between ARV and list price — and gap per square foot, which normalizes the opportunity across properties of different sizes and price points. A $70,000 spread on a 1,200 square foot home and a $70,000 spread on a 2,800 square foot home are not the same deal. Gap per square foot makes that comparison honest.

Target profit is configurable per deal. Partners who receive a shared analysis can adjust their own assumptions — ARV, rehab, target profit, timeline — and see how the numbers move, without affecting the analyst's version.`,
  },
];

const caveats = [
  "We do not inspect properties. Condition assessments are based on available MLS data and analyst judgment.",
  "Rehab estimates are starting points. Scope can vary significantly from what a contractor finds on site.",
  "Market conditions can move faster than any analysis reflects. ARV is an estimate of value today, not a guarantee of sale price tomorrow.",
  "The analysis is a disciplined input to an investment decision — not a substitute for due diligence.",
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function MethodologyPage() {
  return (
    <div>
      {/* ── HERO SLOT ──────────────────────────────────────────────────────
          Replace the comment below with your photo, video, or animation.
          The overlay gradient and headline sit on top of whatever you place
          there. Min-height reserves the space until your asset is ready.
          Suggested: Next.js <Image> with fill + object-cover, or a <video>
          with autoPlay muted loop playsInline.
      ─────────────────────────────────────────────────────────────────── */}
      <div className="relative w-full min-h-[420px] bg-slate-900 overflow-hidden">
        {/* YOUR HERO ASSET GOES HERE */}

        {/* Gradient overlay + headline — always on top */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/75 flex flex-col justify-end px-6 pb-16 md:px-16 lg:px-24">
          <p className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-3">
            How we work
          </p>
          <h1 className="text-4xl md:text-5xl font-semibold text-white leading-tight max-w-2xl">
            The numbers don't come from nowhere.
          </h1>
          <p className="mt-4 text-lg text-white/70 max-w-xl leading-relaxed">
            Every analysis we deliver is the product of a structured research
            process. Here's what goes into each number, and why.
          </p>
        </div>
      </div>
      {/* ── END HERO SLOT ─────────────────────────────────────────────── */}

      {/* ── Intro strip ───────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-14">
          <p className="text-base md:text-lg text-slate-600 leading-relaxed max-w-3xl">
            Our deal analyses are built for a specific market, a specific
            strategy, and a specific standard of evidence. The methodology below
            applies to our fix-and-flip work in the Denver metro. Every number
            is traceable to a specific input. Every assumption is documented.
            Nothing is averaged arbitrarily.
          </p>
        </div>
      </div>

      {/* ── Methodology sections ──────────────────────────────────────── */}
      <div>
        {sections.map((section, i) => (
          <div
            key={section.number}
            className={`border-b border-slate-200 ${
              i % 2 === 1 ? "bg-slate-50" : "bg-white"
            }`}
          >
            <div className="max-w-5xl mx-auto px-6 md:px-12 py-16 grid grid-cols-1 md:grid-cols-[140px_1fr] gap-8 md:gap-16">
              {/* Section label */}
              <div>
                <span className="block text-5xl font-semibold text-slate-200 leading-none select-none mb-2">
                  {section.number}
                </span>
                <p className="text-xs font-semibold tracking-wider uppercase text-slate-400">
                  {section.title}
                </p>
              </div>

              {/* Section body */}
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-5">
                  {section.title}
                </h2>
                <div className="space-y-4">
                  {section.body
                    .trim()
                    .split("\n\n")
                    .map((para, j) => (
                      <p
                        key={j}
                        className="text-base text-slate-600 leading-relaxed"
                      >
                        {para}
                      </p>
                    ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Deal waterfall callout ─────────────────────────────────────── */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-16 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-start">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-4">
              The calculation
            </p>
            <h2 className="text-3xl font-semibold leading-snug mb-5">
              Every cost is accounted for before we name a price.
            </h2>
            <p className="text-slate-400 leading-relaxed text-base">
              The maximum offer is not a rule of thumb. It is the result of a
              full cost waterfall — every dollar between ARV and purchase price
              is allocated before we arrive at a number.
            </p>
          </div>

          <div className="font-mono text-sm">
            <div className="border-b border-white/10 pb-3 mb-3">
              <span className="text-white/40 text-xs uppercase tracking-widest block mb-3">
                Deal waterfall — example
              </span>
              <WaterfallRow
                label="After Repair Value"
                value="$450,000"
                positive
              />
            </div>
            <div className="space-y-2 border-b border-white/10 pb-3 mb-3">
              <WaterfallRow label="— Rehab" value="$62,000" />
              <WaterfallRow label="— Holding costs" value="$8,500" />
              <WaterfallRow label="— Transaction costs" value="$19,800" />
              <WaterfallRow label="— Financing" value="$24,214" />
              <WaterfallRow label="— Target profit" value="$40,000" />
            </div>
            <WaterfallRow label="= Max offer" value="$295,486" total />
            <div className="mt-5 pt-4 border-t border-white/10 space-y-1.5 text-white/35 text-xs">
              <p>Spread (ARV − list) &nbsp;&nbsp; $65,000</p>
              <p>
                Gap / sqft
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                $36.11
              </p>
              <p>
                Offer %
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                76.7%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Limitations section ───────────────────────────────────────── */}
      <div className="bg-white border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-16 grid grid-cols-1 md:grid-cols-[140px_1fr] gap-8 md:gap-16">
          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-slate-400 mt-1">
              Limitations
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-slate-900 mb-3">
              What our numbers don't do.
            </h2>
            <p className="text-base text-slate-600 leading-relaxed mb-8 max-w-2xl">
              Our analyses are a rigorous starting point — not a substitute for
              due diligence. We are direct about the boundaries.
            </p>
            <ul className="space-y-4">
              {caveats.map((caveat, i) => (
                <li
                  key={i}
                  className="flex gap-4 items-start text-base text-slate-600 leading-relaxed"
                >
                  <span
                    className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-slate-300"
                    aria-hidden="true"
                  />
                  {caveat}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── CTA strip ─────────────────────────────────────────────────── */}
      <div className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-14 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="text-lg font-semibold text-slate-900">
              Ready to see a deal analysis?
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Contact us to discuss how DataWiseRE can work for your investment
              criteria.
            </p>
          </div>
          <a
            href="/contact"
            className="inline-flex items-center px-6 py-3 bg-slate-900 text-white text-sm font-semibold rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            Get in touch
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WaterfallRow({
  label,
  value,
  positive = false,
  total = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  total?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-baseline gap-4 ${total ? "pt-1" : ""}`}
    >
      <span
        className={
          total
            ? "text-white font-semibold"
            : positive
              ? "text-white/80"
              : "text-white/50"
        }
      >
        {label}
      </span>
      <span
        className={
          total
            ? "text-white font-semibold"
            : positive
              ? "text-white/90"
              : "text-white/50"
        }
      >
        {value}
      </span>
    </div>
  );
}
