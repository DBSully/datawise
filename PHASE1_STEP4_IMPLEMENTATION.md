# Phase 1 — Step 4 — Partner Portal MVP

> **Goal:** Build the complete analyst-shares-with-partner → partner-views-and-adjusts → analyst-sees-feedback-in-real-time loop. This is Phase 1's #1 priority feature per `DataWiseRE_Restructure_Plan.md` §3.
> **Status:** READY TO EXECUTE — all 6 decisions locked
> **Authority:** `WORKSTATION_CARD_SPEC.md` §5.9 (Partner Sharing Card) + §7 (Partner View Compatibility) + `DataWiseRE_Restructure_Plan.md` §3 (Partner Portal detailed spec) + Decisions 1, 8, 9, 10, 11
> **Date:** 2026-04-11
> **Risk level:** High — new tables, new auth flow, email integration, Realtime subscriptions, a brand-new partner-facing route. More moving parts than any prior step.
> **Estimated scope:** 4-6 SQL migrations, ~20-30 new files, ~15-25 commits across 6 sub-steps

---

## 1. What Step 4 Accomplishes

The complete share → view → adjust → feedback loop:

```
ANALYST                           PARTNER
  │                                  │
  ├─ Opens Workstation               │
  ├─ Clicks "Share" on header        │
  │  or opens Partner Sharing card   │
  ├─ Selects partner (or invites     │
  │  new partner by email)           │
  ├─ System sends email via Resend ──┤
  │                                  ├─ Receives email with link
  │                                  ├─ Opens /portal/deals/[shareToken]
  │                                  ├─ Creates account (if new)
  │                                  ├─ Views property + comps + ARV
  │                                  ├─ Adjusts ARV / rehab / profit
  │                                  │  in private sandbox (auto-persist)
  │                                  ├─ Clicks "I'm Interested" or "Pass"
  │                                  │  with reason
  ├─ Realtime: sees feedback live ◄──┤
  ├─ Partner Sharing card updates    │
  ├─ Header pill shows new feedback  │
  └─ Reviews partner's adjustments   └─
```

**Definition of Done (from the restructure plan):** Analyst completes analysis → shares with partner → partner opens link → creates account → adjusts numbers → submits feedback → analyst sees it in real time.

---

## 2. Sub-Step Decomposition

Six sub-steps, executed sequentially:

### 4A — Schema + RLS (foundation)

**New tables:**

1. **`analysis_shares`** — one row per partner per analysis
   - `id` uuid PK
   - `analysis_id` uuid FK → analyses
   - `shared_with_user_id` uuid FK → profiles (nullable — null for pre-registration email invites)
   - `shared_with_email` text (the email address, always populated)
   - `share_token` text UNIQUE (the URL token for /portal/deals/[shareToken])
   - `message` text (optional message from analyst included in the email)
   - `is_active` boolean DEFAULT true
   - `sent_at` timestamptz
   - `first_viewed_at` timestamptz
   - `last_viewed_at` timestamptz
   - `view_count` integer DEFAULT 0
   - `last_viewed_by_analyst_at` timestamptz (tracks when analyst last reviewed this share's feedback)
   - `organization_id` uuid FK → organizations (RLS + DEFAULT from current_user_organization_id())
   - timestamps

2. **`partner_analysis_versions`** — partner's private sandbox per shared analysis (Decision 11)
   - `id` uuid PK
   - `analysis_share_id` uuid FK → analysis_shares
   - `arv_override` numeric
   - `rehab_override` numeric
   - `target_profit_override` numeric
   - `days_held_override` integer
   - `selected_comp_ids` uuid[] (partner's private comp selection set)
   - `notes` text (partner's private notes)
   - `last_viewed_at` timestamptz
   - `archived_at` timestamptz
   - `organization_id` uuid FK → organizations
   - timestamps

3. **`partner_feedback`** — partner's action responses
   - `id` uuid PK
   - `analysis_share_id` uuid FK → analysis_shares
   - `action` text CHECK ('interested', 'pass', 'showing_request', 'discussion_request')
   - `pass_reason` text
   - `notes` text
   - `submitted_at` timestamptz
   - `organization_id` uuid FK → organizations
   - timestamps

**RLS policies:** Org-scoped for analyst access (same pattern as Step 2). Partner access policies are more nuanced:
- Partners can SELECT their own `analysis_shares` rows (where `shared_with_user_id = auth.uid()` or matched by email)
- Partners can SELECT/UPDATE their own `partner_analysis_versions` rows
- Partners can INSERT their own `partner_feedback` rows
- Partners CANNOT see other partners' data

**`share_forwards` table deferred to Phase 2** per the restructure plan. Second-degree sharing is out of scope for the MVP.

### 4B — Email integration (Resend)

- Set up Resend SDK (`@resend/node` or the Next.js-compatible package)
- Environment variables: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Share invitation email template (HTML): property address, analyst message, "View Analysis" CTA button linking to `/portal/deals/[shareToken]`
- `createAnalysisShareAction` server action: generates share_token (crypto.randomUUID or nanoid), creates `analysis_shares` row, sends email via Resend, revalidates the Workstation
- `revokeAnalysisShareAction` server action: sets `is_active = false`

### 4C — Partner Sharing card (analyst side)

Replace the current stub with the full implementation per spec §5.9:

- **Collapsed card:** dynamic headline (`Not shared` / `Shared with N partners` / `N shared · M viewed · K interested`), context line (most recent action), live-updating from Realtime
- **Expanded modal:**
  - Add new share section: partner email input (with autocomplete from registered partners), optional message, "Send Share" button
  - Active shares list: per-row partner name/email + sent date + view count + last action + chevron for detail expansion
  - Per-share detail expansion: partner's adjustments (ARV/rehab/days/profit), feedback action, pass reason, notes
  - Revoke button per share
- **Header share pill** (Decision 10): small inline pill showing share count + feedback count, click to open the Partner Sharing card modal
- Wire the "Share" header button to open the same modal

### 4D — Partner-facing route (`/portal/deals/[shareToken]`)

The partner experience — a stripped-down Workstation view:

- **Route:** `app/(portal)/deals/[shareToken]/page.tsx` (new route group `(portal)` with its own layout, separate from the workspace layout)
- **Auth:** the share link works WITHOUT login. The partner sees a read-only view immediately. If they want to adjust values or submit feedback, they're prompted to sign in / create an account. The account creation flow auto-links the `analysis_shares` row to their new profile.
- **Reuses Workstation components** with `viewMode: "partner"` prop gating (per spec §7):
  - Header (limited — no Mark Complete, no Generate Report, no Share, no active share pill)
  - Property Physical tile (with bed/bath grid)
  - Quick Analysis tile (partner's own private values, auto-persist to `partner_analysis_versions`)
  - Deal Stat Strip (live-recalculated from partner's Quick Analysis values)
  - Comp Workspace (read-only map + table; comp picking persists to `partner_analysis_versions.selected_comp_ids`)
  - ARV card (read-only)
  - Rehab card (with partner's override)
  - Price Trend card (read-only)
- **Partner-only elements:**
  - Action Buttons card: "I'm Interested" / "Schedule Showing" / "Request Discussion" / "Pass" (with reason prompt)
  - Partner notes section
- **NOT shown to partners** (per spec §7): MLS Info tile, Quick Status tile, Holding & Trans card, Financing card, Cash Required card, Pipeline card, Notes card (except visibility-filtered notes per Decision 8), Partner Sharing card

### 4E — Realtime subscriptions (Decision 9)

Wire Supabase Realtime into the Workstation's Partner Sharing card:

```typescript
const channel = supabase
  .channel(`workstation:${analysisId}`)
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'analysis_shares',
    filter: `analysis_id=eq.${analysisId}`
  }, handleShareChange)
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'partner_feedback',
    filter: `analysis_id=eq.${analysisId}`
  }, handleNewFeedback)
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'partner_analysis_versions'
  }, handlePartnerVersionChange)
  .subscribe();
```

- Subscribe on Workstation mount, unsubscribe on unmount
- Handle errors with fallback to manual "↻ Refresh" button
- New feedback: red unread badge on the Partner Sharing card + header pill pulse
- View count updates: headline number refreshes

**Requires Supabase Realtime to be enabled** for the relevant tables. This is a Supabase dashboard configuration step.

### 4F — Partner auth flow + Partner Workspace

The partner experience should feel like a **workspace they return to daily**, not a notification inbox of one-off email links. When a partner logs in, they see their deal flow — organized, actionable, and live-updating. The database foundation from 4A already supports this with zero additional schema work.

**Partner registration + auto-link:**
- Registration: email + password (or magic link) via Supabase Auth
- Auto-link: when a partner registers with an email that matches a `shared_with_email` in `analysis_shares`, the `shared_with_user_id` is automatically set to their new profile ID. All previously-shared analyses instantly appear in their dashboard.
- Role: `profiles.role = 'partner'` (the role column was added in Step 2; becomes operational here)

**Partner Workspace at `/portal/` — the partner's home:**

```
┌─────────────────────────────────────────────────────────────────┐
│  PARTNER WORKSPACE                              Dan's Deals     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tabs: [ New (3) ] [ Watching (5) ] [ Interested (2) ]  │   │
│  │        [ Passed (8) ] [ All (18) ]                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 🔴 NEW  1005 Garfield St, Denver CO 80206               │    │
│  │ ARV $1,125,000 · Max Offer $620,000 · 88.6%             │    │
│  │ "Take a look at this one — strong ARV gap"               │    │
│  │ Shared 2h ago · Not yet viewed                           │    │
│  │                    [ I'm Interested ] [ Pass ] [ Open → ]│    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 📋 WATCHING  742 Pearl St, Denver CO 80203              │    │
│  │ ARV $890,000 · Max Offer $510,000 · 91.2%               │    │
│  │ Your ARV: $920,000 · Your Rehab: $65,000                │    │
│  │ Shared 3 days ago · Viewed 2x · Last viewed yesterday   │    │
│  │                                              [ Open → ]  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Status lanes (tabs):**

| Lane | Filter logic | Purpose |
|---|---|---|
| **New** | `analysis_shares.is_active = true` AND no `partner_feedback` row AND `partner_analysis_versions.last_viewed_at IS NULL` | Deals the partner hasn't opened yet. The "inbox" — new opportunities from analysts. Badge count in the tab. |
| **Watching** | `is_active = true` AND partner has viewed (`last_viewed_at IS NOT NULL`) but has NOT submitted final feedback (interested/pass) | Deals the partner is actively evaluating — they've looked, maybe adjusted numbers, but haven't committed. |
| **Interested** | `partner_feedback.action = 'interested'` (or `showing_request` or `discussion_request`) | Deals the partner wants to pursue. Their "active pipeline." |
| **Passed** | `partner_feedback.action = 'pass'` | Deals the partner declined. Historical reference. Can be re-opened if the analyst re-shares or the partner changes their mind. |
| **All** | Everything shared with this partner (active or revoked) | Full history. |

**Per-deal summary card on the dashboard:**
- Property address + city/state
- Key deal stats: ARV, Max Offer, Offer% (from the analyst's analysis)
- Partner's own adjustments if any (their ARV override, rehab override)
- Analyst's message (from the share)
- Timing: when shared, view count, last viewed
- **"New" badge** on unviewed deals (pulsing dot, same as the analyst's unread indicator)
- **Quick actions** directly from the dashboard card:
  - "I'm Interested" / "Pass" buttons (submit feedback without opening the full analysis)
  - "Open →" link to `/portal/deals/[shareToken]` for the full view
- Deals with new analyst activity (re-shared, updated analysis) get a subtle highlight

**Live updates via Realtime (from 4E):**
- When the analyst shares a new deal, it appears in the partner's "New" tab immediately (Realtime pushes the new `analysis_shares` row)
- When the analyst updates an analysis the partner is watching, the card refreshes with new numbers
- When the partner submits feedback, the card moves to the appropriate lane

**Partner profile at `/portal/profile`:**
- Name, email, phone (optional)
- Notification preferences (email frequency: immediate / daily digest / none)
- Connected analysts (list of analysts who have shared deals with this partner)
- Account settings (password change, etc.)

**Why this matters (Dan's insight):** the partner should feel that they have a place to go where they watch deals and find new ones, rather than just a one-off email interaction. The workspace model turns partners into **repeat users with their own workflow** — they check their dashboard, review new deals, track the ones they're interested in, and build a relationship with the analyst through the platform. This is the foundation for long-term partner engagement and the future "partner self-reconciliation" feature from Decision 11.

---

## 3. Decisions to Lock

🟡 **4.1 — Portal route group structure.**

**(a) `(portal)` route group** with its own layout (no workspace nav, partner-focused chrome). Partners never see the analyst workspace layout.

**(b) Nested under `(workspace)`** with a `viewMode` check. Simpler routing but mixes analyst and partner layouts.

**Recommendation: (a).** Clean separation.

🟡 **4.2 — Share token format.**

**(a) UUID v4** (`crypto.randomUUID()`). 36 chars, globally unique, no branding. URL: `/portal/deals/550e8400-e29b-41d4-a716-446655440000`

**(b) nanoid** (21 chars, URL-safe). Shorter URLs. URL: `/portal/deals/V1StGXR8_Z5jdHi6B-myT`

**(c) Custom slug** (e.g., `1005-garfield-abc123`). Human-readable but more complex generation.

**Recommendation: (a) UUID.** Simplest, no extra dependency, globally unique, matches our existing ID pattern.

🟡 **4.3 — Partner auth requirement for viewing vs. acting.**

**(a) View without login, act with login.** Partners click the share link and immediately see the analysis. To adjust values or submit feedback, they're prompted to sign in. Lowest friction for first impressions.

**(b) Login required for everything.** Even viewing requires an account. Higher friction but simpler auth model.

**(c) View without login, adjust without login (session-only), act with login.** Partners can adjust values in a transient session (not saved to DB). Feedback requires login. Interesting but complex.

**Recommendation: (a).** The restructure plan explicitly says "partner opens link without login" for viewing. Acting requires a persistent identity.

🟡 **4.4 — Email service.**

**(a) Resend.** Modern, developer-friendly, good Next.js integration. Dan mentioned Resend in earlier discussions.

**(b) Supabase Auth emails only.** Limited to auth flows; not suitable for transactional share emails.

**(c) Postmark.** Enterprise-focused, excellent deliverability.

**Recommendation: (a) Resend.** Already discussed; good fit for the MVP.

🟡 **4.5 — Execution order: analyst-side first or partner-side first?**

**(a) Schema → Email → Analyst card → Partner route → Realtime → Auth.** Build the analyst's sharing surface first; the partner route comes after. Analyst can share before partners can view (email goes out, partner route isn't built yet — but the link in the email would 404 until 4D ships).

**(b) Schema → Partner route (read-only) → Email → Analyst card → Realtime → Auth.** Build the partner view first so the share link works as soon as emails go out.

**(c) Schema → Email + Analyst card + Partner route together → Realtime → Auth.** Build both sides in parallel for the fastest end-to-end demo.

**Recommendation: (a) with a caveat.** Build analyst-side first because it's simpler (no new route group, no partner auth). BUT hold off on actually sending emails until 4D (partner route) is at least partially functional so the link in the email doesn't 404. In practice: 4A (schema) → 4B (email infra, but don't send yet) → 4C (analyst card, with a "share link copied" flow instead of email for testing) → 4D (partner route) → wire email sending → 4E (Realtime) → 4F (partner auth).

🟡 **4.6 — Supabase Realtime: enable via dashboard or migration?**

Supabase Realtime requires enabling `publication` for each table. This is typically done via the Supabase dashboard (Project Settings → Realtime → enable tables). Alternatively, it can be done via SQL:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE analysis_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE partner_feedback;
ALTER PUBLICATION supabase_realtime ADD TABLE partner_analysis_versions;
```

**(a) Dashboard.** Quick, no migration needed. But not reproducible from migrations.

**(b) Migration.** Reproducible, checked into git. Preferred for infrastructure-as-code.

**Recommendation: (b) migration.** Same principle as all our other schema changes.

---

## 4. Estimated Task Breakdown

| Sub-step | Commits | Key deliverables |
|---|---|---|
| 4A | 2-3 | 3 tables + RLS policies + Realtime publication |
| 4B | 2 | Resend setup + createAnalysisShareAction + revokeAnalysisShareAction |
| 4C | 3-4 | Partner Sharing card modal + header pill + Share button wiring |
| 4D | 5-8 | Partner-facing route + layout + component gating + action buttons + partner Quick Analysis |
| 4E | 2-3 | Realtime subscriptions + live card updates + unread indicators |
| 4F | 4-6 | Partner registration + auto-link + Partner Workspace dashboard (status lanes, deal cards, quick actions) + profile |
| **Total** | **~18-26** | |

---

## 5. What Step 4 Builds On

From Step 3:
- The Workstation has a Partner Sharing card stub → 4C fills it in
- `DetailCard` + `DetailModal` wrappers → partner route reuses them
- `SubjectTileRow`, `DealStatStrip`, `CompWorkspace`, `QuickAnalysisTile` → partner route reuses with `viewMode` gating
- Auto-persist infrastructure (`useDebouncedSave`, `SaveStatusDot`, `saveManualAnalysisFieldAction`) → partner Quick Analysis persists to `partner_analysis_versions` using the same pattern
- Notes visibility model (3-tier) → partner-side note queries filter by `visibility`
- `profiles` table with `role` field → partner role becomes operational
- Org-scoped RLS → partner policies extend the pattern

---

## 6. Decisions — RESOLVED

🟢 **4.1 — DECIDED: (a) separate `(portal)` route group.** Clean separation — partners never see the analyst workspace layout. The portal gets its own layout with partner-focused chrome.

🟢 **4.2 — DECIDED: (a) UUID v4.** Simplest, no extra dependency, globally unique, matches the existing ID pattern across the codebase.

🟢 **4.3 — DECIDED: (a) view without login, act with login.** Partners click the share link and immediately see the analysis. Adjusting values or submitting feedback requires signing in. Lowest friction for first impressions, per the restructure plan's "partner opens link without login" requirement.

🟢 **4.4 — DECIDED: (a) Resend.** Modern, developer-friendly, good Next.js integration. Already discussed in earlier planning sessions.

🟢 **4.5 — DECIDED: (a) analyst-side first.** Schema → email infra → analyst card → partner route → Realtime → auth. Email sending held until the partner route is functional so the link in the email doesn't 404.

🟢 **4.6 — DECIDED: (b) migration.** Enable Supabase Realtime publication for the 3 new tables via SQL migration (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`). Reproducible, checked into git — same infrastructure-as-code principle as all other schema changes.

All decisions locked 2026-04-11. Ready to execute.

---

*Drafted by Claude Opus | 2026-04-11 | Awaiting Dan's review before execution*
