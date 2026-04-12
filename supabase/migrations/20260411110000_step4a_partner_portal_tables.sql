-- Phase 1 Step 4A — Partner Portal foundation tables.
--
-- Three new tables for the analyst → partner → feedback loop:
--
-- 1. analysis_shares      — one row per partner per shared analysis
-- 2. partner_analysis_versions — partner's private sandbox (Decision 11)
-- 3. partner_feedback     — partner's action responses
--
-- All three follow the Step 2 pattern: org-scoped RLS with
-- current_user_organization_id() DEFAULT on the organization_id column.
--
-- Additionally, analyst policies use the standard org-scoped check.
-- Partner policies are more nuanced — partners can only access rows
-- associated with their own user ID via the analysis_shares linkage.
--
-- Realtime publication is enabled via ALTER PUBLICATION so Supabase
-- Realtime can push live updates to the Workstation's Partner Sharing
-- card (Decision 9, per Decision 4.6 — migration, not dashboard).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. analysis_shares
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.analysis_shares (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id              uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  shared_with_user_id      uuid REFERENCES public.profiles(id),  -- nullable for pre-registration invites
  shared_with_email        text NOT NULL,
  share_token              text NOT NULL UNIQUE,
  message                  text,
  is_active                boolean NOT NULL DEFAULT true,
  sent_at                  timestamptz NOT NULL DEFAULT now(),
  first_viewed_at          timestamptz,
  last_viewed_at           timestamptz,
  view_count               integer NOT NULL DEFAULT 0,
  last_viewed_by_analyst_at timestamptz,
  organization_id          uuid NOT NULL DEFAULT public.current_user_organization_id()
                           REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_analysis_shares_analysis_id ON public.analysis_shares (analysis_id);
CREATE INDEX ix_analysis_shares_share_token ON public.analysis_shares (share_token);
CREATE INDEX ix_analysis_shares_shared_with_user_id ON public.analysis_shares (shared_with_user_id);
CREATE INDEX ix_analysis_shares_organization_id ON public.analysis_shares (organization_id);

ALTER TABLE public.analysis_shares ENABLE ROW LEVEL SECURITY;

-- Analyst policies (org-scoped, same as Step 2 pattern)
CREATE POLICY "analysis_shares_org_select" ON public.analysis_shares
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_shares_org_insert" ON public.analysis_shares
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_shares_org_update" ON public.analysis_shares
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_shares_org_delete" ON public.analysis_shares
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- Partner policy: partners can SELECT their own shares (where they are
-- the shared_with_user_id). This is additive to the org-scoped policies
-- above — a partner who is also in the same org gets both paths.
CREATE POLICY "analysis_shares_partner_select" ON public.analysis_shares
  FOR SELECT TO authenticated
  USING (shared_with_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 2. partner_analysis_versions
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.partner_analysis_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_share_id     uuid NOT NULL REFERENCES public.analysis_shares(id) ON DELETE CASCADE,
  arv_override          numeric,
  rehab_override        numeric,
  target_profit_override numeric,
  days_held_override    integer,
  selected_comp_ids     uuid[],
  notes                 text,
  last_viewed_at        timestamptz,
  archived_at           timestamptz,
  organization_id       uuid NOT NULL DEFAULT public.current_user_organization_id()
                        REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_partner_analysis_versions_share_id ON public.partner_analysis_versions (analysis_share_id);
CREATE INDEX ix_partner_analysis_versions_organization_id ON public.partner_analysis_versions (organization_id);

ALTER TABLE public.partner_analysis_versions ENABLE ROW LEVEL SECURITY;

-- Analyst policies (org-scoped)
CREATE POLICY "partner_analysis_versions_org_select" ON public.partner_analysis_versions
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "partner_analysis_versions_org_insert" ON public.partner_analysis_versions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "partner_analysis_versions_org_update" ON public.partner_analysis_versions
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "partner_analysis_versions_org_delete" ON public.partner_analysis_versions
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- Partner policy: partners can SELECT and UPDATE their own version rows.
-- The join through analysis_shares ensures the partner owns the share.
CREATE POLICY "partner_analysis_versions_partner_select" ON public.partner_analysis_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analysis_shares s
      WHERE s.id = analysis_share_id
        AND s.shared_with_user_id = auth.uid()
        AND s.is_active = true
    )
  );

CREATE POLICY "partner_analysis_versions_partner_update" ON public.partner_analysis_versions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analysis_shares s
      WHERE s.id = analysis_share_id
        AND s.shared_with_user_id = auth.uid()
        AND s.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.analysis_shares s
      WHERE s.id = analysis_share_id
        AND s.shared_with_user_id = auth.uid()
        AND s.is_active = true
    )
  );

CREATE POLICY "partner_analysis_versions_partner_insert" ON public.partner_analysis_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.analysis_shares s
      WHERE s.id = analysis_share_id
        AND s.shared_with_user_id = auth.uid()
        AND s.is_active = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. partner_feedback
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.partner_feedback (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_share_id   uuid NOT NULL REFERENCES public.analysis_shares(id) ON DELETE CASCADE,
  action              text NOT NULL CHECK (action IN ('interested', 'pass', 'showing_request', 'discussion_request')),
  pass_reason         text,
  notes               text,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  organization_id     uuid NOT NULL DEFAULT public.current_user_organization_id()
                      REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_partner_feedback_share_id ON public.partner_feedback (analysis_share_id);
CREATE INDEX ix_partner_feedback_organization_id ON public.partner_feedback (organization_id);

ALTER TABLE public.partner_feedback ENABLE ROW LEVEL SECURITY;

-- Analyst policies (org-scoped)
CREATE POLICY "partner_feedback_org_select" ON public.partner_feedback
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "partner_feedback_org_insert" ON public.partner_feedback
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "partner_feedback_org_update" ON public.partner_feedback
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "partner_feedback_org_delete" ON public.partner_feedback
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- Partner policy: partners can SELECT and INSERT their own feedback.
CREATE POLICY "partner_feedback_partner_select" ON public.partner_feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analysis_shares s
      WHERE s.id = analysis_share_id
        AND s.shared_with_user_id = auth.uid()
        AND s.is_active = true
    )
  );

CREATE POLICY "partner_feedback_partner_insert" ON public.partner_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.analysis_shares s
      WHERE s.id = analysis_share_id
        AND s.shared_with_user_id = auth.uid()
        AND s.is_active = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Realtime publication (Decision 9 + Decision 4.6 — migration)
-- ─────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.analysis_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_analysis_versions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_feedback;

COMMIT;
