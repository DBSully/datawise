// app/(public)/offerings/page.tsx

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offerings | DataWiseRE",
  description:
    "DataWiseRE partners with fix-and-flip investors, homeowners, and institutional buyers to deliver research-backed real estate analyses in the Denver metro.",
};

// ─── Data ────────────────────────────────────────────────────────────────────

const flipOfferings = [
  {
    number: "01",
    title: "Deal Sourcing & Screening",
    body: `We monitor the Denver MLS continuously. Every viable candidate is put through a full underwriting process — not a price filter, not a cap rate estimate, but a complete analysis: comp-based ARV, rehab budget, carrying costs, financing, and a maximum offer price.

Most properties don't survive the screen. That's the point. By the time a deal reaches you, it has already been measured against what the market will actually bear after renovation — and against what it will cost to get there.`,
  },
  {
    number: "02",
    title: "Comp-Driven Valuation",
    body: `Our ARV is a researched position, not an estimate pulled from an algorithm. Our analysts select comparable sales based on a structured evaluation across multiple similarity dimensions — geography, property type, size, age, condition, and more.

Each comp is adjusted for size difference and weighted by recency. The result is a single, defensible number you can take to a lender or a negotiation — with every comp, every adjustment, and every assumption visible behind it.`,
  },
  {
    number: "03",
    title: "Full Cost Underwriting",
    body: `A deal isn't just an ARV and a list price. Between those two numbers sits rehab, carrying costs, financing, title, commissions, and your required return. We account for all of it.

Rehab estimates are built from property-specific inputs: type, age, condition, and price tier. Holding costs are calibrated to property size — larger homes take longer. Financing reflects hard money market rates. The maximum offer is what remains after every cost is subtracted and your profit is reserved.`,
  },
  {
    number: "04",
    title: "Shared Analysis & Partner Portal",
    body: `When we bring you a deal, you receive the complete picture: property data, comp map, cost breakdown, and our offer recommendation. You can adjust your own assumptions — ARV, rehab budget, target return, timeline — and see how the numbers respond in real time.

Your adjustments stay yours. They don't affect our analysis. You're working with the same data, from your own position.`,
  },
  {
    number: "05",
    title: "Pipeline Tracking",
    body: `Every deal you're engaged with has a status: screening, showing, under offer, under contract, closed. You see where things stand without asking.

We track outcomes. What we offered, what it sold for, how long it took. That record makes every subsequent analysis more precise.`,
  },
];

const comingSoon = [
  {
    audience: "Homeowners",
    headline: "Know what your home is actually worth — and what it could be.",
    body: `Most homeowners make the largest financial decision of their lives with a Zestimate and an agent's opinion. We're building a homeowner offering that applies the same research standard we use for investors: comp-driven valuation, renovation cost analysis, and a clear picture of what improvements move the needle and which ones don't.

Coming to DataWiseRE. If you want to be notified when it's available, get in touch.`,
  },
  {
    audience: "Institutional Partners",
    headline: "Portfolio-scale deal flow, underwritten to your criteria.",
    body: `Hedge funds and institutional buyers operating in residential real estate need more than access to listings. They need screened, underwritten deal flow sized to their acquisition criteria — delivered consistently, at volume.

We're developing an institutional offering built around custom strategy profiles, portfolio-level reporting, and direct analyst access. If you're deploying capital in the Denver metro at scale, we'd like to talk.`,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function OfferingsPage() {
  return (
    <div>
      {/* ── HERO SLOT ──────────────────────────────────────────────────────
          Replace the comment below with your photo, video, or animation.
          The overlay gradient and headline sit on top of whatever you place
          there. Min-height reserves the space until your asset is ready.
          Suggested: aerial Denver cityscape, or a subtle property data
          visualization. Different from Methodology hero if possible.
      ─────────────────────────────────────────────────────────────────── */}
      <div className="relative w-full min-h-[420px] bg-slate-900 overflow-hidden">
        {/* YOUR HERO ASSET GOES HERE */}

        {/* Gradient overlay + headline — always on top */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/75 flex flex-col justify-end px-6 pb-16 md:px-16 lg:px-24">
          <p className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-3">
            What we do
          </p>
          <h1 className="text-4xl md:text-5xl font-semibold text-white leading-tight max-w-2xl">
            We do the research.
            <br />
            You make the call.
          </h1>
          <p className="mt-4 text-lg text-white/70 max-w-xl leading-relaxed">
            DataWiseRE partners with investors, homeowners, and institutions to
            deliver research-backed real estate analyses in the Denver metro.
          </p>
        </div>
      </div>
      {/* ── END HERO SLOT ─────────────────────────────────────────────── */}

      {/* ── Partner intro strip ───────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-14">
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-4">
            The Partner model
          </p>
          <p className="text-base md:text-lg text-slate-600 leading-relaxed max-w-3xl">
            Every client relationship at DataWiseRE works the same way: you tell
            us your goals, and our analysts go to work. We don't sell a software
            subscription. We deliver finished research — deal analyses built for
            your criteria, your market, and your required return.
          </p>
          <p className="text-base md:text-lg text-slate-600 leading-relaxed max-w-3xl mt-4">
            Whether you're a fix-and-flip investor evaluating your next
            acquisition, a homeowner weighing a renovation, or an institutional
            buyer deploying capital at scale — becoming a DataWiseRE Partner
            means our team is working toward your outcome.
          </p>
        </div>
      </div>

      {/* ── Fix-and-flip section header ───────────────────────────────── */}
      <div className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-2">
              Current offering
            </p>
            <h2 className="text-3xl font-semibold text-slate-900">
              Fix-and-Flip Partners
            </h2>
          </div>
          <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
            Our full analytical capability is available today for fix-and-flip
            investors operating in the Denver metro.
          </p>
        </div>
      </div>

      {/* ── Fix-and-flip offering sections ───────────────────────────── */}
      <div>
        {flipOfferings.map((item, i) => (
          <div
            key={item.number}
            className={`border-b border-slate-200 ${
              i % 2 === 0 ? "bg-white" : "bg-slate-50"
            }`}
          >
            <div className="max-w-5xl mx-auto px-6 md:px-12 py-16 grid grid-cols-1 md:grid-cols-[140px_1fr] gap-8 md:gap-16">
              {/* Section label */}
              <div>
                <span className="block text-5xl font-semibold text-slate-200 leading-none select-none mb-2">
                  {item.number}
                </span>
                <p className="text-xs font-semibold tracking-wider uppercase text-slate-400">
                  {item.title}
                </p>
              </div>

              {/* Section body */}
              <div>
                <h3 className="text-2xl font-semibold text-slate-900 mb-5">
                  {item.title}
                </h3>
                <div className="space-y-4">
                  {item.body
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

      {/* ── Coming soon: future audiences ─────────────────────────────── */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 md:px-12 pt-16 pb-4">
          <p className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-2">
            Expanding coverage
          </p>
          <h2 className="text-3xl font-semibold text-white leading-snug max-w-xl">
            More partners. More use cases. Same standard of work.
          </h2>
        </div>

        {comingSoon.map((item, i) => (
          <div
            key={item.audience}
            className={`border-t border-white/10 ${
              i === comingSoon.length - 1 ? "border-b border-white/10" : ""
            }`}
          >
            <div className="max-w-5xl mx-auto px-6 md:px-12 py-14 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 md:gap-16">
              {/* Audience label */}
              <div className="flex flex-col justify-start gap-3">
                <p className="text-xs font-semibold tracking-wider uppercase text-white/40">
                  {item.audience}
                </p>
                <span className="inline-flex items-center self-start px-2.5 py-1 rounded text-xs font-semibold tracking-wide uppercase bg-white/10 text-white/50">
                  Coming soon
                </span>
              </div>

              {/* Content */}
              <div>
                <h3 className="text-xl font-semibold text-white mb-4 leading-snug">
                  {item.headline}
                </h3>
                <div className="space-y-4">
                  {item.body
                    .trim()
                    .split("\n\n")
                    .map((para, j) => (
                      <p
                        key={j}
                        className="text-base text-slate-400 leading-relaxed"
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

      {/* ── CTA strip ─────────────────────────────────────────────────── */}
      <div className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-14 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="text-lg font-semibold text-slate-900">
              Ready to become a Partner?
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Sign in to request access, or contact us to discuss your
              investment criteria before getting started.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <a
              href="/auth/sign-in"
              className="inline-flex items-center px-6 py-3 bg-slate-900 text-white text-sm font-semibold rounded hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              Sign in / Request access
            </a>
            <a
              href="/contact"
              className="inline-flex items-center px-6 py-3 border border-slate-300 text-slate-700 text-sm font-semibold rounded hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              Get in touch
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
