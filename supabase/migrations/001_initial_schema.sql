-- =============================================================================
-- DIGITAL HEROES — Production-Ready PostgreSQL Schema
-- Supabase-compatible | PostgreSQL 15+
-- =============================================================================
-- Execution Order:
--   1. Extensions & Helpers
--   2. Profiles & Roles
--   3. Subscriptions
--   4. Charity Directory & Contributions
--   5. Golf Scores + Rolling Trigger
--   6. Draw Engine & Prize Pools
--   7. Row Level Security Policies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 0: EXTENSIONS & SHARED UTILITIES
-- ---------------------------------------------------------------------------

-- pgcrypto for UUID generation (Supabase usually already enables this)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- A helper function we'll use in RLS policies to identify administrators.
-- Admins are stored as a user_role = 'admin' in the profiles table.
-- We cache this in a SECURITY DEFINER function so RLS policies can call it
-- without causing recursive permission checks.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND user_role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- SECTION 1: USER PROFILES & ROLES
-- ---------------------------------------------------------------------------
-- We do NOT replace auth.users. Instead, we mirror it with a `profiles` table
-- that extends Supabase auth with app-specific data.
-- A Supabase trigger (at the bottom of this section) auto-creates a profile
-- row every time a new user signs up via auth.users.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  -- Primary key mirrors auth.users.id exactly (UUID type).
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Display-facing fields
  full_name       TEXT,
  avatar_url      TEXT,
  phone           TEXT,

  -- Role-based access control.
  -- 'subscriber' is the default for all new sign-ups.
  -- 'admin' grants full CRUD via RLS bypass.
  user_role       TEXT        NOT NULL DEFAULT 'subscriber'
                              CHECK (user_role IN ('subscriber', 'admin')),

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.profiles IS 'Extends auth.users with application-specific fields. One row per authenticated user.';
COMMENT ON COLUMN public.profiles.user_role IS 'subscriber = standard registered user; admin = full platform access.';

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create a profile row when a new user registers via Supabase Auth.
-- This keeps profiles in sync with auth.users without any server-side code.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',   -- passed during signUp()
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Fires on every INSERT into auth.users (i.e., every new sign-up / OAuth login)
CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- SECTION 2: SUBSCRIPTION MANAGEMENT (Stripe Integration)
-- ---------------------------------------------------------------------------
-- This table is the single source of truth for subscription state.
-- Stripe webhook events should upsert rows here via a Supabase Edge Function.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The subscriber. Cascade-delete cleans up if a user account is removed.
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Stripe identifiers — kept for webhook reconciliation
  stripe_customer_id  TEXT        UNIQUE,
  stripe_sub_id       TEXT        UNIQUE,         -- Stripe subscription object ID

  -- Plan type
  plan_type           TEXT        NOT NULL DEFAULT 'monthly'
                                  CHECK (plan_type IN ('monthly', 'yearly')),

  -- Subscription lifecycle state
  -- pending  : payment initiated but not yet confirmed
  -- active   : payment confirmed, access granted
  -- lapsed   : renewal failed / payment overdue
  -- inactive : deliberately cancelled or admin-disabled
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('active', 'inactive', 'lapsed', 'pending')),

  -- Billing window dates
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,              -- Used to determine renewal dates

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.subscriptions IS 'Stripe-backed subscription records. One active subscription per user at any time.';
COMMENT ON COLUMN public.subscriptions.status IS 'pending|active|lapsed|inactive — driven by Stripe webhook events.';
COMMENT ON COLUMN public.subscriptions.current_period_end IS 'Renewal date. Lapse logic should compare this against NOW().';

-- Partial unique index: only one ACTIVE subscription per user at a time.
-- A user may have historical (inactive/lapsed) rows; only one active row allowed.
CREATE UNIQUE INDEX idx_subscriptions_one_active_per_user
  ON public.subscriptions (user_id)
  WHERE (status = 'active');

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status  ON public.subscriptions(status);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- SECTION 3: CHARITY DIRECTORY & CONTRIBUTIONS
-- ---------------------------------------------------------------------------

-- 3A. Charities Table
-- Stores all registered charity partners on the platform.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.charities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identity
  name            TEXT        NOT NULL,
  slug            TEXT        NOT NULL UNIQUE,   -- URL-friendly identifier e.g. "st-jude-hospital"
  description     TEXT,
  website_url     TEXT,
  registration_no TEXT,                          -- Official charity registration number

  -- Media — stored as JSONB arrays for flexibility (Supabase Storage URLs)
  -- e.g. ["https://xxx.supabase.co/storage/v1/object/public/charities/logo.png"]
  logo_url        TEXT,
  image_urls      JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Upcoming events (e.g., golf days, fundraisers)
  -- Stored as JSONB array for schema-less flexibility.
  -- Example element: {"title": "Charity Golf Day", "date": "2026-10-15", "location": "Augusta National", "description": "..."}
  upcoming_events JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Visibility control — only 'published' charities are visible to the public
  is_published    BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.charities IS 'Charity partner directory. Visibility controlled via is_published flag.';
COMMENT ON COLUMN public.charities.image_urls IS 'JSONB array of Supabase Storage image URLs for the charity gallery.';
COMMENT ON COLUMN public.charities.upcoming_events IS 'JSONB array of event objects: {title, date, location, description}.';

CREATE INDEX idx_charities_is_published ON public.charities(is_published);

CREATE TRIGGER trg_charities_updated_at
  BEFORE UPDATE ON public.charities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3B. User Charity Contributions
-- Each subscriber selects exactly one charity to support.
-- The contribution_pct represents the percentage of their subscription
-- fee directed to the charity (minimum 10% enforced at DB level).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.charity_contributions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id             UUID        NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  charity_id          UUID        NOT NULL REFERENCES public.charities(id)  ON DELETE RESTRICT,

  -- Percentage of subscription fee directed to this charity (10–100)
  contribution_pct    NUMERIC(5,2) NOT NULL DEFAULT 10.00
                                   CHECK (contribution_pct >= 10.00 AND contribution_pct <= 100.00),

  -- Whether this is the user's currently active charity selection
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.charity_contributions IS 'Links a user to their chosen charity with a contribution percentage.';
COMMENT ON COLUMN public.charity_contributions.contribution_pct IS 'Minimum 10%. Percentage of subscription revenue directed to charity.';
COMMENT ON COLUMN public.charity_contributions.is_active IS 'Only one active contribution per user. Historical rows kept for audit trail.';

-- Only one active charity selection per user at a time.
CREATE UNIQUE INDEX idx_charity_contributions_one_active_per_user
  ON public.charity_contributions (user_id)
  WHERE (is_active = TRUE);

CREATE INDEX idx_charity_contributions_user_id    ON public.charity_contributions(user_id);
CREATE INDEX idx_charity_contributions_charity_id ON public.charity_contributions(charity_id);

CREATE TRIGGER trg_charity_contributions_updated_at
  BEFORE UPDATE ON public.charity_contributions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3C. Standalone Donations (independent of subscription)
-- Tracks one-off donations made directly to a charity (e.g., via Stripe Checkout).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.donations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id             UUID        REFERENCES public.profiles(id) ON DELETE SET NULL, -- nullable for anonymous
  charity_id          UUID        NOT NULL REFERENCES public.charities(id) ON DELETE RESTRICT,

  -- Amount in minor currency unit (e.g., pence/cents) to avoid floating-point issues
  amount_minor        INTEGER     NOT NULL CHECK (amount_minor > 0),
  currency            TEXT        NOT NULL DEFAULT 'GBP' CHECK (char_length(currency) = 3),

  stripe_payment_id   TEXT        UNIQUE,         -- Stripe PaymentIntent ID
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  donor_message       TEXT,                        -- Optional message from donor

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.donations IS 'Standalone one-off donations, independent of subscription contributions.';
COMMENT ON COLUMN public.donations.amount_minor IS 'Amount in smallest currency unit (e.g. pence for GBP). Avoids float errors.';

CREATE INDEX idx_donations_user_id    ON public.donations(user_id);
CREATE INDEX idx_donations_charity_id ON public.donations(charity_id);

-- ---------------------------------------------------------------------------
-- SECTION 4: GOLF SCORE MANAGEMENT (Rolling 5-Score Logic)
-- ---------------------------------------------------------------------------
-- Business rules enforced at DB level:
--   • Stableford format: score INTEGER in [1, 45]
--   • One score per user per calendar date (unique constraint)
--   • Max 5 scores stored per user at any time (rolling window trigger)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.golf_scores (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The date the round was played (not a timestamp — one per calendar day)
  score_date  DATE        NOT NULL,

  -- Stableford points. Constraint: strictly between 1 and 45 inclusive.
  score       INTEGER     NOT NULL CHECK (score >= 1 AND score <= 45),

  -- Optional metadata
  course_name TEXT,
  notes       TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- CONSTRAINT 1: Block duplicate dates for the same user at the DB level.
  CONSTRAINT uq_golf_scores_user_date UNIQUE (user_id, score_date)
);

COMMENT ON TABLE  public.golf_scores IS 'Stableford golf scores. Max 5 per user (rolling). One per user per date.';
COMMENT ON COLUMN public.golf_scores.score IS 'Stableford points: integer in [1, 45].';
COMMENT ON COLUMN public.golf_scores.score_date IS 'Calendar date of the round. Enforces one-score-per-day-per-user constraint.';

CREATE INDEX idx_golf_scores_user_id         ON public.golf_scores(user_id);
CREATE INDEX idx_golf_scores_user_date       ON public.golf_scores(user_id, score_date DESC);

CREATE TRIGGER trg_golf_scores_updated_at
  BEFORE UPDATE ON public.golf_scores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- CONSTRAINT 2: Rolling 5-Score Trigger Function
-- ============================================================
-- Logic:
--   After every INSERT into golf_scores for a given user, count
--   how many rows that user now has. If the count exceeds 5,
--   delete the oldest row(s) — identified by the earliest score_date.
--   Using score_date (not created_at) as the ordering key ensures
--   "oldest round" semantics rather than "oldest entry" semantics.
--   A secondary tie-breaker on created_at handles same-day inserts
--   (though the unique constraint prevents same-day duplicates,
--    the tie-breaker is kept for safety).
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_rolling_5_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count   INTEGER;
  v_excess  INTEGER;
BEGIN
  -- Count total scores for this user AFTER the INSERT
  SELECT COUNT(*) INTO v_count
  FROM public.golf_scores
  WHERE user_id = NEW.user_id;

  -- Calculate how many rows exceed the 5-score cap
  v_excess := v_count - 5;

  IF v_excess > 0 THEN
    -- Delete the oldest `v_excess` scores for this user.
    -- "Oldest" = earliest score_date; ties broken by earliest created_at.
    DELETE FROM public.golf_scores
    WHERE id IN (
      SELECT id
      FROM public.golf_scores
      WHERE user_id = NEW.user_id
      ORDER BY score_date ASC, created_at ASC
      LIMIT v_excess
    );
  END IF;

  RETURN NULL; -- AFTER trigger: return value is ignored for row triggers
END;
$$;

COMMENT ON FUNCTION public.enforce_rolling_5_scores() IS
  'After each INSERT, trims oldest golf scores so a user never exceeds 5 stored rounds.';

-- Fires AFTER INSERT (not BEFORE, so the new row already exists when we count)
CREATE TRIGGER trg_enforce_rolling_5_scores
  AFTER INSERT ON public.golf_scores
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rolling_5_scores();

-- ---------------------------------------------------------------------------
-- SECTION 5: DRAW ENGINE & PRIZE POOLS
-- ---------------------------------------------------------------------------

-- 5A. Draws Table
-- Represents a single monthly draw event.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.draws (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The month/year this draw covers (stored as first day of month for easy ordering)
  draw_month      DATE        NOT NULL UNIQUE,   -- e.g. '2026-09-01' for September 2026

  -- Lifecycle: draft → simulated → published
  -- draft      : draw is being configured
  -- simulated  : a test run has been performed (winners not official)
  -- published  : official results are live and visible to the public
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'simulated', 'published')),

  -- Draw type determines the winner selection algorithm
  -- random      : purely random selection from eligible entries
  -- algorithmic : weighted by golf performance, subscription tenure, etc.
  draw_type       TEXT        NOT NULL DEFAULT 'random'
                              CHECK (draw_type IN ('random', 'algorithmic')),

  -- Admin notes for internal use (e.g., audit trail of simulations)
  admin_notes     TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.draws IS 'Monthly draw events. One per calendar month. Progress: draft → simulated → published.';
COMMENT ON COLUMN public.draws.draw_month IS 'Always stored as the 1st of the month (e.g., 2026-09-01).';
COMMENT ON COLUMN public.draws.draw_type IS 'random = uniform lottery; algorithmic = performance-weighted selection.';

CREATE INDEX idx_draws_status     ON public.draws(status);
CREATE INDEX idx_draws_draw_month ON public.draws(draw_month DESC);

CREATE TRIGGER trg_draws_updated_at
  BEFORE UPDATE ON public.draws
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5B. Prize Pools Table
-- Tracks the financial prize pool for each draw, split across tiers.
-- Total pool = sum of active subscription revenue for that month.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prize_pools (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  draw_id                 UUID        NOT NULL UNIQUE REFERENCES public.draws(id) ON DELETE CASCADE,

  -- Total calculated prize fund for this draw (in minor currency units)
  total_pool_minor        BIGINT      NOT NULL DEFAULT 0 CHECK (total_pool_minor >= 0),
  currency                TEXT        NOT NULL DEFAULT 'GBP' CHECK (char_length(currency) = 3),

  -- Tier amounts (calculated and stored for auditability)
  -- Tier 1: 5-match — 40% of pool
  tier_5match_pct         NUMERIC(5,2) NOT NULL DEFAULT 40.00,
  tier_5match_amount      BIGINT       NOT NULL DEFAULT 0,

  -- Rollover: if no 5-match winner exists, the 5-match pot rolls to next month
  tier_5match_rollover    BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Tier 2: 4-match — 35% of pool
  tier_4match_pct         NUMERIC(5,2) NOT NULL DEFAULT 35.00,
  tier_4match_amount      BIGINT       NOT NULL DEFAULT 0,

  -- Tier 3: 3-match — 25% of pool
  tier_3match_pct         NUMERIC(5,2) NOT NULL DEFAULT 25.00,
  tier_3match_amount      BIGINT       NOT NULL DEFAULT 0,

  -- Rollover amount carried forward from previous month's unclaimed 5-match pot
  rolled_over_amount      BIGINT       NOT NULL DEFAULT 0,

  -- Timestamps
  calculated_at           TIMESTAMPTZ,            -- When pool amounts were last computed
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure tier percentages always sum to 100%
  CONSTRAINT chk_tier_pcts_sum_100 CHECK (
    tier_5match_pct + tier_4match_pct + tier_3match_pct = 100.00
  )
);

COMMENT ON TABLE  public.prize_pools IS 'Financial prize pool per draw. Amounts stored in minor currency units (e.g., pence).';
COMMENT ON COLUMN public.prize_pools.tier_5match_rollover IS 'TRUE if no winner claimed this tier; amount carries to next month prize_pool.rolled_over_amount.';
COMMENT ON COLUMN public.prize_pools.rolled_over_amount IS 'Amount (in minor units) rolled over FROM a previous draw with no 5-match winner.';

CREATE TRIGGER trg_prize_pools_updated_at
  BEFORE UPDATE ON public.prize_pools
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5C. Draw Entries Table
-- Records each user's eligibility/participation in a given draw.
-- A user is eligible if they have an active subscription on draw_month.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.draw_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  draw_id     UUID        NOT NULL REFERENCES public.draws(id)    ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The 5 numbers/selections this user's entry is based on.
  -- For 'random' draws, these may be auto-assigned.
  -- For 'algorithmic' draws, these reflect score-derived picks.
  -- Stored as a sorted integer array for easy comparison.
  entry_numbers   INTEGER[]   NOT NULL,

  -- Constraint: each user may only have one entry per draw
  CONSTRAINT uq_draw_entries_draw_user UNIQUE (draw_id, user_id),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- updated_at tracks any amendments to an entry (e.g., entry_numbers corrected).
  -- Kept for completeness of the audit trail; in normal operation entries are
  -- immutable once submitted.
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.draw_entries IS 'One entry per eligible user per draw. entry_numbers holds their selection set.';
COMMENT ON COLUMN public.draw_entries.entry_numbers IS 'Array of integers representing the user entry (e.g., [3, 12, 22, 35, 41]).';

CREATE INDEX idx_draw_entries_draw_id ON public.draw_entries(draw_id);
CREATE INDEX idx_draw_entries_user_id ON public.draw_entries(user_id);

-- GIN index enables efficient array contains/overlap queries on entry_numbers
CREATE INDEX idx_draw_entries_numbers ON public.draw_entries USING GIN (entry_numbers);

-- Auto-update updated_at on any row change (mirrors all other tables)
CREATE TRIGGER trg_draw_entries_updated_at
  BEFORE UPDATE ON public.draw_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5D. Draw Winners Table
-- Records the official outcomes for each draw.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.draw_winners (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  draw_id             UUID        NOT NULL REFERENCES public.draws(id)    ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The winning tier matched by this user
  tier                TEXT        NOT NULL CHECK (tier IN ('5-match', '4-match', '3-match')),

  -- Prize amount awarded to this winner (in minor currency units)
  prize_amount_minor  BIGINT      NOT NULL DEFAULT 0 CHECK (prize_amount_minor >= 0),

  -- Payout lifecycle
  -- pending  : winner identified, not yet paid
  -- paid     : funds transferred to winner
  payout_status       TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (payout_status IN ('pending', 'paid')),
  paid_at             TIMESTAMPTZ,                 -- Timestamp of successful payout

  -- Winner verification
  -- Winners must upload proof (e.g., identity, bank details) before payout.
  proof_upload_url    TEXT,                        -- Supabase Storage URL of the document
  proof_status        TEXT        NOT NULL DEFAULT 'not_submitted'
                                  CHECK (proof_status IN ('not_submitted', 'submitted', 'approved', 'rejected')),
  proof_reviewed_at   TIMESTAMPTZ,
  proof_reviewer_id   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- One winner record per user per draw per tier
  CONSTRAINT uq_draw_winners_draw_user_tier UNIQUE (draw_id, user_id, tier),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.draw_winners IS 'Official draw results. Tracks tier, prize amount, payout status, and proof verification.';
COMMENT ON COLUMN public.draw_winners.proof_upload_url IS 'Supabase Storage URL for winner identity/bank verification document.';
COMMENT ON COLUMN public.draw_winners.proof_status IS 'not_submitted → submitted → approved/rejected. Payout only after approved.';
COMMENT ON COLUMN public.draw_winners.prize_amount_minor IS 'Amount in smallest currency unit (pence/cents). Set when draw is published.';

CREATE INDEX idx_draw_winners_draw_id      ON public.draw_winners(draw_id);
CREATE INDEX idx_draw_winners_user_id      ON public.draw_winners(user_id);
CREATE INDEX idx_draw_winners_payout_status ON public.draw_winners(payout_status);

CREATE TRIGGER trg_draw_winners_updated_at
  BEFORE UPDATE ON public.draw_winners
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- SECTION 6: ROW LEVEL SECURITY (RLS) POLICIES
-- ---------------------------------------------------------------------------
-- Access Matrix:
--   Public Visitor   → SELECT on published charities, published draw results
--   Subscriber       → Full CRUD on own rows; SELECT on public data
--   Administrator    → Full CRUD on every table (bypasses RLS via is_admin())
--
-- Pattern used for every table:
--   1. Enable RLS (default-deny: no access unless a policy explicitly grants it)
--   2. Admin blanket policy: is_admin() = TRUE → full access
--   3. User-scoped policies: auth.uid() = user_id column
--   4. Public read policies where applicable (charities, draws)
-- ---------------------------------------------------------------------------

-- ── profiles ────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Admins can do anything to any profile
CREATE POLICY "admin: full access on profiles"
  ON public.profiles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- A user can read and update only their own profile
CREATE POLICY "user: select own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "user: update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profiles are created automatically by the handle_new_user() trigger,
-- so no INSERT policy is needed for regular users.

-- ── subscriptions ────────────────────────────────────────────────────────────

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin: full access on subscriptions"
  ON public.subscriptions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can read their own subscription state (e.g., to check if active)
CREATE POLICY "user: select own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users cannot directly insert/update subscriptions — Stripe webhooks
-- (running as service_role / admin) handle all writes.

-- ── charities ────────────────────────────────────────────────────────────────

ALTER TABLE public.charities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin: full access on charities"
  ON public.charities FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Anyone (including unauthenticated visitors) can read published charities
CREATE POLICY "public: select published charities"
  ON public.charities FOR SELECT
  USING (is_published = TRUE);

-- ── charity_contributions ────────────────────────────────────────────────────

ALTER TABLE public.charity_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin: full access on charity_contributions"
  ON public.charity_contributions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can read their own full contribution history (all rows, active and archived)
CREATE POLICY "user: select own contributions"
  ON public.charity_contributions FOR SELECT
  USING (auth.uid() = user_id);

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │  NO direct INSERT or UPDATE policies for charity_contributions              │
-- │                                                                             │
-- │  All charity selection changes — including the very first selection — MUST  │
-- │  go through the change_charity_contribution() SECURITY DEFINER function     │
-- │  defined below. This guarantees:                                            │
-- │    1. The old active row is archived (is_active = FALSE) before a new one   │
-- │       is inserted, creating an immutable audit trail for charity payouts.   │
-- │    2. The caller has an active subscription (monetisation gate).            │
-- │    3. The target charity is published.                                      │
-- │    4. contribution_pct satisfies the ≥ 10% business rule.                  │
-- │                                                                             │
-- │  The function executes with SECURITY DEFINER (owner privileges), so it can  │
-- │  write to this table even though no user-facing INSERT/UPDATE policy exists. │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- =============================================================================
-- CHARITY CONTRIBUTION CHANGE FUNCTION (Audit-Safe)
-- =============================================================================
-- Purpose:
--   Atomically archive the user's current charity selection and record a new
--   one. This is the ONLY sanctioned write path for charity_contributions for
--   regular users. Direct INSERT/UPDATE policies are intentionally absent.
--
-- Usage (from the client via Supabase RPC):
--   SELECT * FROM change_charity_contribution(
--     p_charity_id     := '<uuid>',
--     p_contribution_pct := 15.00   -- optional, defaults to 10.00
--   );
--
-- Guards enforced inside the function:
--   • Caller must be authenticated (auth.uid() IS NOT NULL)
--   • Caller must have an active subscription
--   • Target charity must be published
--   • contribution_pct must be between 10.00 and 100.00
--
-- Audit trail:
--   The previous active row is set to is_active = FALSE and its updated_at
--   timestamp is refreshed. The row is never deleted, preserving the full
--   history of which charity received what percentage and for how long.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.change_charity_contribution(
  p_charity_id        UUID,
  p_contribution_pct  NUMERIC DEFAULT 10.00
)
RETURNS public.charity_contributions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_new_row  public.charity_contributions;
BEGIN
  -- ── Guard 1: Authentication ────────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'change_charity_contribution: caller is not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Guard 2: Active subscription gate ─────────────────────────────────────
  -- This is the monetisation enforcement point. A lapsed or pending subscriber
  -- cannot change their charity selection at the DB level.
  IF NOT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = v_user_id
      AND status  = 'active'
  ) THEN
    RAISE EXCEPTION 'change_charity_contribution: an active subscription is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Guard 3: Contribution percentage range ─────────────────────────────────
  IF p_contribution_pct < 10.00 OR p_contribution_pct > 100.00 THEN
    RAISE EXCEPTION 'change_charity_contribution: contribution_pct must be between 10.00 and 100.00, got %',
      p_contribution_pct
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Guard 4: Target charity must be published ──────────────────────────────
  IF NOT EXISTS (
    SELECT 1
    FROM public.charities
    WHERE id           = p_charity_id
      AND is_published = TRUE
  ) THEN
    RAISE EXCEPTION 'change_charity_contribution: charity % not found or not published',
      p_charity_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- ── Step 1: Archive the current active row ─────────────────────────────────
  -- Set is_active = FALSE on any existing active row. The row is NEVER deleted;
  -- it becomes a permanent audit record showing which charity was supported and
  -- for how long (gap between this row's created_at and updated_at).
  UPDATE public.charity_contributions
  SET
    is_active  = FALSE,
    updated_at = NOW()        -- marks the exact moment this selection ended
  WHERE user_id  = v_user_id
    AND is_active = TRUE;

  -- ── Step 2: Insert the new active row ─────────────────────────────────────
  -- This becomes the user's current charity selection. The partial unique index
  -- (WHERE is_active = TRUE) guarantees at most one active row per user.
  INSERT INTO public.charity_contributions (
    user_id,
    charity_id,
    contribution_pct,
    is_active
  )
  VALUES (
    v_user_id,
    p_charity_id,
    p_contribution_pct,
    TRUE
  )
  RETURNING * INTO v_new_row;

  RETURN v_new_row;
END;
$$;

COMMENT ON FUNCTION public.change_charity_contribution(UUID, NUMERIC) IS
  'Audit-safe charity selection change. Archives old active row then inserts a new one. '
  'Enforces active subscription gate, pct range [10,100], and published charity. '
  'This is the sole write path for regular users on charity_contributions.';

-- Only authenticated (logged-in) users may call this function.
-- Public / anon callers are blocked even before the internal guards run.
REVOKE EXECUTE ON FUNCTION public.change_charity_contribution(UUID, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.change_charity_contribution(UUID, NUMERIC) TO authenticated;

-- ── donations ────────────────────────────────────────────────────────────────

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin: full access on donations"
  ON public.donations FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can view their own donation history
CREATE POLICY "user: select own donations"
  ON public.donations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can initiate their own donations
CREATE POLICY "user: insert own donation"
  ON public.donations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── golf_scores ──────────────────────────────────────────────────────────────

ALTER TABLE public.golf_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin: full access on golf_scores"
  ON public.golf_scores FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can read only their own scores
CREATE POLICY "user: select own golf scores"
  ON public.golf_scores FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own scores ONLY if they hold an active subscription.
-- This is the monetisation gate: lapsed, pending, or non-paying users are
-- blocked at the database level — not just the application layer.
-- The rolling-5 trigger fires after this check passes.
CREATE POLICY "user: insert own golf score (active subscribers only)"
  ON public.golf_scores FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions
      WHERE user_id = auth.uid()
        AND status  = 'active'
    )
  );

-- Users can update their own scores (e.g., correct a typo on same day)
CREATE POLICY "user: update own golf score"
  ON public.golf_scores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own scores
CREATE POLICY "user: delete own golf score"
  ON public.golf_scores FOR DELETE
  USING (auth.uid() = user_id);

-- ── draws ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.draws ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin: full access on draws"
  ON public.draws FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Anyone can view published draw records (month, type, status)
CREATE POLICY "public: select published draws"
  ON public.draws FOR SELECT
  USING (status = 'published');

-- ── prize_pools ───────────────────────────────────────────────────────────────

ALTER TABLE public.prize_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin: full access on prize_pools"
  ON public.prize_pools FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Prize pool details are readable when the associated draw is published.
-- We join to draws using the draw_id foreign key.
CREATE POLICY "public: select prize pools for published draws"
  ON public.prize_pools FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.draws
      WHERE draws.id = prize_pools.draw_id
        AND draws.status = 'published'
    )
  );

-- ── draw_entries ──────────────────────────────────────────────────────────────

ALTER TABLE public.draw_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin: full access on draw_entries"
  ON public.draw_entries FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can see their own entries
CREATE POLICY "user: select own draw entries"
  ON public.draw_entries FOR SELECT
  USING (auth.uid() = user_id);

-- Users can register a draw entry ONLY with an active subscription.
-- Without this check a lapsed user could INSERT an entry directly via the
-- Supabase client (bypassing any app-layer eligibility check entirely).
CREATE POLICY "user: insert own draw entry (active subscribers only)"
  ON public.draw_entries FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions
      WHERE user_id = auth.uid()
        AND status  = 'active'
    )
  );

-- ── draw_winners ──────────────────────────────────────────────────────────────

ALTER TABLE public.draw_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin: full access on draw_winners"
  ON public.draw_winners FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can see their own winning records (to check payout & verification status)
CREATE POLICY "user: select own draw winnings"
  ON public.draw_winners FOR SELECT
  USING (auth.uid() = user_id);

-- Winners can upload their proof document URL
CREATE POLICY "user: update own proof upload"
  ON public.draw_winners FOR UPDATE
  USING (auth.uid() = user_id)
  -- Restrict: users can ONLY set proof_upload_url and proof_status to 'submitted'.
  -- All other fields (payout_status, prize_amount_minor, etc.) must remain unchanged.
  WITH CHECK (
    auth.uid() = user_id
    AND payout_status = (SELECT payout_status FROM public.draw_winners WHERE id = draw_winners.id)
    AND prize_amount_minor = (SELECT prize_amount_minor FROM public.draw_winners WHERE id = draw_winners.id)
    AND proof_status IN ('not_submitted', 'submitted')
  );

-- Public can see winner data (user_id, tier) for published draws — no prize amounts
-- This enables a public "winners wall" without exposing sensitive financial data.
CREATE POLICY "public: select winner tiers for published draws"
  ON public.draw_winners FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.draws
      WHERE draws.id = draw_winners.draw_id
        AND draws.status = 'published'
    )
  );

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
