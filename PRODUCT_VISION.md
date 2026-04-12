# Product Vision — Beyond the Current Roadmap

Ideas that are bigger than design tweaks and broader than a single step's implementation plan. These represent the long-term direction of DataWise as a product — the analytical intelligence layer that makes the analyst better over time.

Captured during a brainstorm session on 2026-04-12 between Dan and Claude. The design followups file (`WORKSTATION_DESIGN_FOLLOWUPS.md`) captures UI polish and feature additions; this file captures the **product-level vision** that those features build toward.

---

## 1. The Dashboard as a Living Analytical Surface

**The core insight:** the dashboard shouldn't just show today's status ("3 unreviewed primes, 5 in pipeline"). It should be **constantly surfacing opportunities** (what needs attention NOW) and **closing circles** (what happened to properties you analyzed but didn't act on).

### Surfacing opportunities (forward-looking)

The dashboard synthesizes signals from across the platform into actionable urgency:

- **Urgency fuse** (WORKSTATION_DESIGN_FOLLOWUPS.md #18) — which Watch List deals need action today? Sort by urgency, not just by when they were promoted.
- **Market conditions alerts** (#14) — a property you're watching just had 3 competing actives expire. The competition thinned. Time to act?
- **Agent behavior signals** (#17, #18) — the listing agent on your top deal just reduced price on a different listing. Pattern: this agent capitulates after 30 days. Your deal is on day 28.
- **Nearby clustering** (#16) — you have 3 showings scheduled this week, all within 0.5mi of each other. The dashboard groups them into a route.
- **Price drop alerts** — a property you passed on during screening just dropped $25K. Re-evaluate?

### Closing circles (backward-looking)

The most powerful analytical tool is **knowing whether you were right.** DataWise should automatically track what happened to every property the analyst touched:

**Circle type 1: "You were right, but didn't act."**
```
┌──────────────────────────────────────────────────────┐
│ 🔄 Closed Circle: 123 Main Street                    │
│                                                      │
│ You analyzed this on 4/12 and determined an offer     │
│ price of $510,000. You never saw the property or      │
│ made an offer.                                        │
│                                                      │
│ Today it sold for $514,000.                           │
│                                                      │
│ Your analysis was within 0.8% of the actual sale.     │
│ → Consider: what prevented you from acting?           │
└──────────────────────────────────────────────────────┘
```

**Circle type 2: "Here's how your ARV estimate held up."**
```
┌──────────────────────────────────────────────────────┐
│ 🔄 Closed Circle: 123 Main Street (8 months later)   │
│                                                      │
│ The property was rehabbed and resold for $765,000.    │
│ You estimated an ARV of $744,000.                     │
│                                                      │
│ Your ARV was within 2.7% of the actual resale.        │
│ (Rehab scope appeared moderate — you estimated        │
│  $71K rehab; actual unknown but property shows        │
│  full interior renovation in new listing photos.)     │
│                                                      │
│ → Your comp selection and ARV methodology are          │
│   calibrated well for this property type/area.        │
└──────────────────────────────────────────────────────┘
```

**Circle type 3: "You acted — here's how it played out."**
```
┌──────────────────────────────────────────────────────┐
│ ✅ Closed Circle: 456 Oak Avenue                      │
│                                                      │
│ You purchased at $485,000 (your max offer was         │
│ $492,000). Rehab cost $68,000 (you estimated $65K).   │
│ Sold for $738,000 (your ARV was $725,000).            │
│                                                      │
│ Actual profit: $142,000. You estimated: $135,000.     │
│ ARV accuracy: +1.8%. Rehab accuracy: +4.6%.           │
│                                                      │
│ → Strong execution. Rehab slightly over budget;       │
│   ARV slightly conservative. Net result better        │
│   than projected.                                     │
└──────────────────────────────────────────────────────┘
```

### How circles close automatically

The data to close circles already flows through the MLS import pipeline:

1. **At analysis time:** the analyst's offer price, ARV estimate, rehab estimate, and all deal math are recorded in `analyses` + `manual_analysis` + `screening_results`.

2. **When the property sells:** the MLS import pipeline picks up the closed sale (status change to Closed, close_price populated). DataWise can match this back to the original analysis via `real_property_id`.

3. **When the property resells (ARV validation):** months later, if the same property appears in the MLS again as a new listing or closed sale, DataWise can match it back to the original analysis and compare the resale price to the analyst's ARV estimate.

**Implementation sketch:**
- A background job (or a triggered check during MLS import) that watches for status changes on properties the analyst has analyzed
- When a match is found: create a "circle closure" event with the comparison data
- Surface circle closures on the dashboard as cards — sorted by recency, with the accuracy metrics prominently displayed
- Over time, aggregate circle closures into an **analyst accuracy scorecard**: "Your ARV estimates average +/- 3.2% vs actual resale price across 47 closed circles."

### The analyst accuracy scorecard

The ultimate expression of circle-closing: a running accuracy track record.

```
┌──────────────────────────────────────────────────────┐
│ 📊 Your Accuracy (last 12 months, 47 circles)        │
│                                                      │
│ ARV accuracy:     ±3.2% avg  (best: 0.3%, worst: 11%)│
│ Offer accuracy:   ±2.8% avg  (vs actual sale price)  │
│ Rehab accuracy:   ±8.1% avg  (when known)             │
│ Prime Candidate hit rate: 34% acted on, 78% profitable│
│                                                      │
│ Your accuracy improves when:                          │
│  • Property is detached, 1-story, built after 1960    │
│  • ≥4 comps within 0.3mi                              │
│  • Comp recency <90 days                              │
│                                                      │
│ Your accuracy weakens when:                           │
│  • Property is multi-level or has unusual layout       │
│  • Below-grade SF >40% of total                       │
│  • <3 comps available                                 │
└──────────────────────────────────────────────────────┘
```

This scorecard turns DataWise from a deal calculator into a **learning system** — the analyst sees where they're calibrated well, where they're systematically off, and what property types need more careful evaluation. Over time, the platform makes the analyst better.

---

## 2. The Feature Stack That Builds Toward This Vision

The design followups from `WORKSTATION_DESIGN_FOLLOWUPS.md` aren't isolated ideas — they're layers of a coherent analytical intelligence stack:

```
LAYER 4 — LEARNING (this document)
  Dashboard circles + accuracy scorecard
  "Was I right? What can I learn?"
    ↑ feeds from
LAYER 3 — PRIORITY + CONTEXT (followups #14, #17, #18)
  Urgency fuse + agent behavior + market conditions
  "What should I do next and why?"
    ↑ feeds from
LAYER 2 — SPATIAL AWARENESS (followups #11, #15, #16)
  Map views + close/list ratio + nearby analyses
  "Where are the opportunities?"
    ↑ feeds from
LAYER 1 — DEAL MATH (followups #9, #10, #12, #13)
  Waterfall cards + copy MLS + layout architecture
  "What does the math say?"
    ↑ feeds from
FOUNDATION — the Workstation + Screening + Auto-persist (Steps 1-4)
  The infrastructure that captures every analysis decision
```

Each layer builds on the one below. The foundation (Steps 1-4) captures the data. Layer 1 computes the math. Layer 2 adds spatial context. Layer 3 adds urgency and relationship intelligence. Layer 4 closes the feedback loop and makes the analyst better over time.

---

## 3. Implementation Priority (Dan to refine)

| Priority | What | Why | Estimated effort |
|---|---|---|---|
| **Now** | Step 4 Partner Portal | Phase 1 #1 deliverable | In progress |
| **Next** | Design polish pass (followups #1-12) | Analyst UX quality | 2-3 days |
| **Then** | Layer 2 features (#11 map, #15 C/L ratio, #16 nearby) | Quick wins, existing data | 3-5 days |
| **Then** | Layer 3 features (#14 market conditions, #17 agents, #18 urgency) | High analytical value | 2-3 weeks |
| **Future** | Layer 4 (circle closing, accuracy scorecard) | Transformative — makes DataWise a learning system | 2-4 weeks |

The exact ordering is Dan's call. The stack is designed so each layer adds value independently — you don't need Layer 4 to benefit from Layer 2. But the full stack is where the product vision lives.

---

*Captured 2026-04-12 during product brainstorm session*
