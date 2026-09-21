/**
 * types/database.ts
 *
 * TypeScript types that mirror the Digital Heroes PostgreSQL schema.
 * These are used throughout the Next.js app (pages, components, API routes).
 *
 * Keep in sync with:
 *   • supabase/functions/_shared/types.ts  (Deno Edge Functions)
 *   • supabase/migrations/001_initial_schema.sql
 */

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------
export type SubscriptionStatus = 'pending' | 'active' | 'lapsed' | 'inactive'
export type PlanType = 'monthly' | 'yearly'

export interface Subscription {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_sub_id: string | null
  plan_type: PlanType
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export type UserRole = 'subscriber' | 'admin'

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  user_role: UserRole
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Charity
// ---------------------------------------------------------------------------
export interface CharityEvent {
  title: string
  date: string         // ISO date string
  location: string
  description?: string
}

export interface Charity {
  id: string
  name: string
  slug: string
  description: string | null
  website_url: string | null
  registration_no: string | null
  logo_url: string | null
  image_urls: string[]
  upcoming_events: CharityEvent[]
  is_published: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Charity Contributions
// ---------------------------------------------------------------------------
export interface CharityContribution {
  id: string
  user_id: string
  charity_id: string
  contribution_pct: number     // 10.00 – 100.00
  is_active: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Golf Scores
// ---------------------------------------------------------------------------
export interface GolfScore {
  id: string
  user_id: string
  score_date: string           // ISO date (DATE column)
  score: number                // 1–45 Stableford points
  course_name: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Draw Engine
// ---------------------------------------------------------------------------
export type DrawStatus = 'draft' | 'simulated' | 'published'
export type DrawType = 'random' | 'algorithmic'

export interface Draw {
  id: string
  draw_month: string           // ISO date — always 1st of month
  status: DrawStatus
  draw_type: DrawType
  admin_notes: string | null
  created_at: string
  updated_at: string
}

export interface PrizePool {
  id: string
  draw_id: string
  total_pool_minor: number
  currency: string
  tier_5match_pct: number
  tier_5match_amount: number
  tier_5match_rollover: boolean
  tier_4match_pct: number
  tier_4match_amount: number
  tier_3match_pct: number
  tier_3match_amount: number
  rolled_over_amount: number
  calculated_at: string | null
  created_at: string
  updated_at: string
}

export type WinnerTier = '5-match' | '4-match' | '3-match'
export type PayoutStatus = 'pending' | 'paid'
export type ProofStatus = 'not_submitted' | 'submitted' | 'approved' | 'rejected'

export interface DrawEntry {
  id: string
  draw_id: string
  user_id: string
  entry_numbers: number[]
  created_at: string
  updated_at: string        // audit trail for any entry amendments
}

export interface DrawWinner {
  id: string
  draw_id: string
  user_id: string
  tier: WinnerTier
  prize_amount_minor: number
  payout_status: PayoutStatus
  paid_at: string | null
  proof_upload_url: string | null
  proof_status: ProofStatus
  proof_reviewed_at: string | null
  proof_reviewer_id: string | null
  created_at: string
  updated_at: string
}
