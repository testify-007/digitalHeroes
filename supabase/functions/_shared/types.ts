// =============================================================================
// supabase/functions/_shared/types.ts
// Shared TypeScript types & utilities for Digital Heroes Edge Functions.
// Keep this file in sync with the PostgreSQL schema.
// =============================================================================

// ---------------------------------------------------------------------------
// Database Row Types  (mirror public.* tables)
// ---------------------------------------------------------------------------

export type SubscriptionStatus = "pending" | "active" | "lapsed" | "inactive";
export type PlanType = "monthly" | "yearly";

export interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  plan_type: PlanType;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export type DrawStatus = "draft" | "simulated" | "published";
export type DrawType = "random" | "algorithmic";

export interface DrawRow {
  id: string;
  draw_month: string; // ISO date string e.g. "2026-09-01"
  status: DrawStatus;
  draw_type: DrawType;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrizePoolRow {
  id: string;
  draw_id: string;
  total_pool_minor: number;
  currency: string;
  tier_5match_pct: number;
  tier_5match_amount: number;
  tier_5match_rollover: boolean;
  tier_4match_pct: number;
  tier_4match_amount: number;
  tier_3match_pct: number;
  tier_3match_amount: number;
  rolled_over_amount: number;
  calculated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DrawEntryRow {
  id: string;
  draw_id: string;
  user_id: string;
  entry_numbers: number[];
  created_at: string;
  updated_at: string;  // added: audit trail for entry amendments
}

export type WinnerTier = "5-match" | "4-match" | "3-match";
export type PayoutStatus = "pending" | "paid";
export type ProofStatus =
  | "not_submitted"
  | "submitted"
  | "approved"
  | "rejected";

export interface DrawWinnerRow {
  id: string;
  draw_id: string;
  user_id: string;
  tier: WinnerTier;
  prize_amount_minor: number;
  payout_status: PayoutStatus;
  paid_at: string | null;
  proof_upload_url: string | null;
  proof_status: ProofStatus;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Stripe Status → Internal Status Mapping
// ---------------------------------------------------------------------------
// Stripe subscription statuses:
//   trialing, active, past_due, canceled, unpaid,
//   incomplete, incomplete_expired, paused
//
// Our internal states:
//   pending  — payment initiated but not confirmed
//   active   — confirmed, platform access granted
//   lapsed   — payment overdue / failed renewal
//   inactive — deliberately cancelled or expired
// ---------------------------------------------------------------------------

export const STRIPE_TO_INTERNAL_STATUS: Record<string, SubscriptionStatus> = {
  trialing: "pending",            // Trial started, card may or may not be on file
  incomplete: "pending",          // First payment attempt not yet complete
  active: "active",               // Healthy, payment confirmed
  past_due: "lapsed",             // Renewal payment failed, retrying
  unpaid: "lapsed",               // All retries exhausted, access should be cut
  canceled: "inactive",           // Deliberately cancelled
  incomplete_expired: "inactive", // Incomplete and grace period elapsed
  paused: "inactive",             // Subscription paused via Stripe
};

// ---------------------------------------------------------------------------
// Stripe billing interval → internal PlanType
// ---------------------------------------------------------------------------

export const STRIPE_INTERVAL_TO_PLAN: Record<string, PlanType> = {
  month: "monthly",
  year: "yearly",
};
