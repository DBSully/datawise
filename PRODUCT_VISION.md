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

## 2. The Feature Stack

Four layers of analytical intelligence, each building on the one below:

```
LAYER 4 — LEARNING
  Dashboard circles + accuracy scorecard
  "Was I right? What can I learn?"

LAYER 3 — PRIORITY + CONTEXT
  Urgency fuse + agent behavior + market conditions
  "What should I do next and why?"

LAYER 2 — SPATIAL AWARENESS
  Map views + close/list ratio + nearby analyses
  "Where are the opportunities?"

LAYER 1 — DEAL MATH (design polish in WORKSTATION_DESIGN_FOLLOWUPS.md)
  Waterfall cards + layout architecture + strip polish
  "What does the math say?"

FOUNDATION — Steps 1-4
  Workstation + Screening + Auto-persist + Partner Portal
```

Layer 1 items stay in `WORKSTATION_DESIGN_FOLLOWUPS.md` as design polish (entries #1-10, #12). Layers 2-4 are product features described below.

---

## 3. Layer 2 — Spatial Awareness

### 3.1 Map view for screening queue + Watch List

*(Moved from design followup #11)*

A map view toggle that plots deals geographically. Pins color-coded by a selectable metric (Gap/sqft or Offer%). Click a pin → opens the screening modal or navigates to the Workstation. Reuses the existing `<CompMap>` component.

- **Data:** `analysis_queue_v` and `watch_list_v` already have lat/lng, gap, offer%
- **Effort:** ~1-2 days (new shared `<DealMapView>` component + toggle state per page)

### 3.2 Close/list price ratio + DOM per comp — market health signal

*(Moved from design followup #15)*

The comp table shows what sold but not HOW it sold. Two comps at the same price tell different stories — one sold over ask on day 3 (hot), another closed after 2 price cuts on day 45 (soft). Add C/L% and DOM columns to the comp table. Aggregate into the Price Trend card as a market health indicator.

- **Data:** `mls_listings.list_price`, `close_price`, `listing_contract_date`, `purchase_contract_date` — likely already available
- **Effort:** ~1-2 days (check if list_price is in comp metrics_json; add table columns; aggregate for trend card)

### 3.3 Nearby Analyses — showing efficiency + cross-deal awareness

*(Moved from design followup #16)*

When viewing a property, surface other active analyses within 0.5mi. Groups showings into efficient routes. The `haversine()` function already exists in the codebase.

- **Data:** `real_properties` has lat/lng for all properties; `analyses` links to them
- **Effort:** ~half-day (proximity query + compact display in Workstation header or a mini-card)

---

## 4. Layer 3 — Priority + Context

### 4.1 Show Market Conditions — active/expired/withdrawn listing overlay

*(Moved from design followup #14)*

On-demand button in the comp workspace that overlays current market data: active listings (competition), expired (couldn't sell), withdrawn (pulled off market). Helps the analyst gauge whether a strong ARV gap is real or threatened by competition.

- **Data:** `mls_listings` filtered by non-closed statuses in the same geographic area as the comp search
- **Effort:** ~1-2 days (server action + CompMap extension + market conditions panel/tab)
- **Key insight from Dan:** "A good deal can turn bad if there is too much competition"

### 4.2 Layout evolution — separate deal-math cards from non-math cards

*(Moved from design followup #13)*

The 9 right-column cards mix four concerns: deal math (ARV/Rehab/Hold/Trans/Financing/Cash), market data (Price Trend), action/status (Pipeline), communication (Notes/Partner Sharing). The deal-math cards should visually mirror the offer price waterfall. Non-math cards belong in a separate region.

Future direction: the deal-math cards could become a single interactive waterfall where each line item is expandable in-place — the layout IS the math. Combined with design followup #4 (cards move to the left), the analyst's primary interaction surface becomes a vertical deal-math cascade on the left with the comp workspace on the right.

- **Effort:** Phase A (two card groups with divider) ~1 day; Phase B (interactive waterfall) ~3-5 days

### 4.3 Listing agent relationship tracking

*(Moved from design followup #17)*

Track agent interactions across deals: showings, offers, calls, responsiveness. Dan tracked this in detail in the legacy MS Access system — it's a known high-value workflow.

- **Schema:** new `agents` + `agent_interactions` tables
- **Features:** agent deduplication from MLS data, interaction logging UI, cross-deal relationship summary in the Workstation
- **Effort:** ~5-7 days as a dedicated feature branch

### 4.4 Deal urgency "fuse" — time-and-offer-sensitive priority management

*(Moved from design followup #18)*

A per-analysis urgency indicator combining time pressure (DOM + price reductions), offer positioning (how close the analyst's offer is to list), and agent behavior (does this agent sell fast at full price or routinely accept discounts?).

- **Urgency burns faster when:** DOM high + price reduced + offer% close to list + agent's listings sit
- **Urgency burns slower when:** just listed + offer far below + agent sells fast at full price
- **Display:** color-coded urgency column in Watch List (sortable); badge in Workstation header
- **Effort:** Phase A (simple DOM/price/offer score) ~1 day; Phase B (agent behavior query) ~2 days; Phase C (integrated formula) ~1-2 days
- **Key insight from Dan:** "My urgency is low if I can offer 82% on a house listed yesterday. But that fuse is burning."

---

## 5. Layer 4 — Learning (§1 above)

The circle-closing + accuracy scorecard described in §1. The most transformative layer — turns DataWise from a deal calculator into a system that makes the analyst better over time.

---

## 6. Partner Management Panel — cross-deal, cross-partner activity tracking

**Surfaced:** 2026-04-12

The Partner Sharing card in the Workstation is per-analysis: "who did I share THIS deal with, and what did they say?" The Partner Workspace dashboard at `/portal/` is per-partner: "what deals have been shared with ME?"

Neither surface answers the analyst's cross-cutting questions:
- **Which partners are most engaged?** Who responds quickly, who ghosts?
- **Who hasn't responded in 2 weeks?** Follow-up reminders.
- **Which partner always passes?** Maybe stop sharing certain deal types with them.
- **Who's my most active partner?** Relationship health across all deals.
- **What's the overall pipeline of shared deals?** How many are pending response vs. interested vs. passed?

### The feature

A **Partner Management Panel** — an analyst-side dashboard that aggregates partner activity across ALL analyses. Not tied to a single Workstation; lives as its own top-level section (maybe under `/admin/partners` or a new `/partners` route).

```
┌──────────────────────────────────────────────────────────┐
│ PARTNER MANAGEMENT                                       │
│                                                          │
│ ┌────────────────────────────────────────────────────┐   │
│ │ Partner         Shared  Viewed  Interested  Passed │   │
│ │ Mike Smith         12      10        4         6   │   │
│ │ Jane Kim            8       5        3         1   │   │
│ │ Tom Rodriguez       3       1        0         0   │   │
│ │   └─ 2 pending response (shared 5d + 8d ago)      │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ Recent activity:                                         │
│  Mike Smith marked Interested on 1005 Garfield · 2h ago  │
│  Jane Kim passed on 742 Pearl St · "too much rehab" · 1d │
│  Tom Rodriguez viewed 818 Grant St · 3d ago              │
└──────────────────────────────────────────────────────────┘
```

### Data

All the data already exists in the Step 4 tables:
- `analysis_shares` — every share, every partner, every analysis
- `partner_feedback` — every response with timestamps
- `partner_analysis_versions` — every adjustment the partner made
- `profiles` — partner names and emails

The panel is purely aggregation queries over existing data — no new schema needed.

### Implementation estimate

~2-3 days. A new route with a server component that aggregates partner activity + a client component with per-partner expandable rows showing their shared deals, response rates, and recent activity. Could integrate with Realtime for live updates (same pattern as the Partner Sharing card).

---

## 7. Implementation Priority (Dan to refine)

| Priority | What | Estimated effort |
|---|---|---|
| **Now** | Step 4 Partner Portal | In progress |
| **Next** | Design polish pass (WORKSTATION_DESIGN_FOLLOWUPS.md #1-10, #12) | 2-3 days |
| **Then** | Layer 2 (map views, C/L ratio, nearby analyses) | 3-5 days |
| **Then** | Layer 3 (market conditions, layout evolution, agents, urgency) | 2-4 weeks |
| **Future** | Layer 4 (circle closing, accuracy scorecard) | 2-4 weeks |

Each layer adds value independently. The full stack is where the product vision lives.

---

*Captured 2026-04-12 during product brainstorm session*
