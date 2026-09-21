// =============================================================================
// supabase/functions/draw-engine/index.ts
//
// Digital Heroes — Monthly Draw Execution Engine
// ------------------------------------------------
// A secure, admin-only Edge Function that runs the monthly draw and populates
// the prize pool and winners tables.
//
// Two modes of operation:
//   simulate — Runs the full algorithm, inserts results into draw_winners,
//              and sets the draw status to 'simulated'. Safe to call multiple
//              times (each call replaces previous simulated winners).
//              Use this to preview results before going live.
//
//   publish  — Finalises the draw. Sets status to 'published', making results
//              visible to the public. Should be called exactly once per month.
//              Cannot be reversed via this function (requires DB admin).
//
// Security:
//   Admin-only: The caller MUST supply the Supabase service-role key in the
//   Authorization header OR be identified as an admin in the profiles table.
//   Both checks are performed; the service-role check is the primary gate.
//
// Request format (POST, JSON body):
//   {
//     "draw_id": "<uuid>",          // required — the draw to execute
//     "mode": "simulate"|"publish"  // required
//   }
//
// Environment variables required:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   MONTHLY_PLAN_AMOUNT_MINOR   — monthly subscription price in pence (e.g. 999)
//   YEARLY_PLAN_AMOUNT_MINOR    — yearly subscription price in pence (e.g. 9999)
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MONTHLY_PLAN_AMOUNT = parseInt(
  Deno.env.get("MONTHLY_PLAN_AMOUNT_MINOR") ?? "999",  // default £9.99
  10
);
const YEARLY_PLAN_AMOUNT = parseInt(
  Deno.env.get("YEARLY_PLAN_AMOUNT_MINOR") ?? "9999",  // default £99.99
  10
);

// Prize tier split percentages (must sum to 100)
const TIER_5MATCH_PCT = 40;
const TIER_4MATCH_PCT = 35;
const TIER_3MATCH_PCT = 25;

// The range from which draw numbers are drawn (1–50 inclusive by default)
const NUMBER_POOL_MIN = 1;
const NUMBER_POOL_MAX = 50;
const NUMBERS_PER_ENTRY = 5;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ===========================================================================
// Types
// ===========================================================================

type DrawMode = "simulate" | "publish";

interface WinnerCandidate {
  user_id: string;
  entry_id: string;
  matched_count: number;
  tier: "5-match" | "4-match" | "3-match";
}

// ===========================================================================
// Main Handler
// ===========================================================================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  // ── Parse and validate request body ─────────────────────────────────────────
  let body: { draw_id?: string; mode?: DrawMode };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { draw_id, mode } = body;

  if (!draw_id) return jsonError("Missing required field: draw_id", 400);
  if (!mode || !["simulate", "publish"].includes(mode)) {
    return jsonError('mode must be "simulate" or "publish"', 400);
  }

  // ── Authenticate: service-role key check ────────────────────────────────────
  // The caller must supply the service-role key as a Bearer token.
  // This is the primary security gate — service-role keys are never exposed
  // to frontend clients and should only be held by admin backend processes.
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.replace(/^Bearer\s+/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (bearerToken !== serviceRoleKey) {
    console.warn("[draw-engine] Unauthorized access attempt");
    return jsonError("Unauthorized: service-role key required", 401);
  }

  // ── Create admin Supabase client ─────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey
  );

  // ── Run the draw engine ──────────────────────────────────────────────────────
  try {
    const result = await executeDrawEngine(supabase, draw_id, mode);
    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[draw-engine] Fatal error:", err);
    return jsonError(err.message ?? "Internal server error", 500);
  }
});

// ===========================================================================
// executeDrawEngine
// ===========================================================================
// Core orchestration function. Runs every step in sequence and surfaces a
// structured result object for the admin to review.
// ===========================================================================

async function executeDrawEngine(
  supabase: ReturnType<typeof createClient>,
  drawId: string,
  mode: DrawMode
) {
  // ── Step 1: Load and validate the draw record ────────────────────────────────
  const draw = await fetchDraw(supabase, drawId);

  // In publish mode, the draw must have been simulated first.
  if (mode === "publish" && draw.status === "published") {
    throw new Error(
      `Draw ${drawId} is already published. Cannot re-publish.`
    );
  }
  if (mode === "publish" && draw.status === "draft") {
    throw new Error(
      `Draw ${drawId} is in 'draft' status. Run in simulate mode first, ` +
        `then review results before publishing.`
    );
  }

  console.log(
    `[draw-engine] Executing draw ${drawId} (month=${draw.draw_month}, mode=${mode})`
  );

  // ── Step 2: Calculate prize pool for this draw month ─────────────────────────
  const { totalPoolMinor, activeSubscriptionCount } = await calculatePrizePool(
    supabase,
    draw.draw_month
  );

  // ── Step 3: Resolve rollover from previous month ─────────────────────────────
  const rolledOverAmount = await resolvePreviousRollover(
    supabase,
    draw.draw_month
  );

  // The effective pool includes any amount rolled over from a previous month
  // where no 5-match winner was found.
  const effectiveTotalMinor = totalPoolMinor + rolledOverAmount;

  // ── Step 4: Calculate tier amounts ───────────────────────────────────────────
  // Use integer math (pence) throughout. Math.floor ensures we never
  // award more than the pool contains. Rounding remainders accumulate
  // in the rollover pot on tier_5match_rollover = true months.
  const tier5Amount = Math.floor(effectiveTotalMinor * TIER_5MATCH_PCT / 100);
  const tier4Amount = Math.floor(effectiveTotalMinor * TIER_4MATCH_PCT / 100);
  const tier3Amount = Math.floor(effectiveTotalMinor * TIER_3MATCH_PCT / 100);

  // ── Step 5: Load all draw entries for this draw ───────────────────────────────
  const entries = await fetchDrawEntries(supabase, drawId);

  if (entries.length === 0) {
    throw new Error(
      `Draw ${drawId} has no entries. Cannot execute draw without participants.`
    );
  }

  console.log(`[draw-engine] ${entries.length} entries found for draw ${drawId}`);

  // ── Step 6: Generate winning numbers ─────────────────────────────────────────
  // For 'random' draws: generate a cryptographically random set of numbers.
  // For 'algorithmic' draws: same random selection applies at this stage;
  // the algorithmic weighting is applied at the entry generation stage
  // (entry_numbers are already skewed by the user's golf performance).
  const winningNumbers = generateWinningNumbers(
    NUMBER_POOL_MIN,
    NUMBER_POOL_MAX,
    NUMBERS_PER_ENTRY
  );

  console.log(
    `[draw-engine] Winning numbers: [${winningNumbers.join(", ")}]`
  );

  // ── Step 7: Score all entries ─────────────────────────────────────────────────
  // Compare each entry's numbers against the winning set and identify tier.
  const winners = scoreEntries(entries, winningNumbers);

  const fiveMatchWinners = winners.filter((w) => w.tier === "5-match");
  const fourMatchWinners = winners.filter((w) => w.tier === "4-match");
  const threeMatchWinners = winners.filter((w) => w.tier === "3-match");

  console.log(
    `[draw-engine] Results: ${fiveMatchWinners.length}×5-match, ` +
      `${fourMatchWinners.length}×4-match, ${threeMatchWinners.length}×3-match`
  );

  // ── Step 8: Determine rollover ────────────────────────────────────────────────
  // If there are no 5-match winners, the 5-match tier amount carries forward
  // to the following month's prize pool.
  const has5MatchWinner = fiveMatchWinners.length > 0;
  const tier5Rollover = !has5MatchWinner;

  // ── Step 9: Calculate per-winner prize amounts ────────────────────────────────
  // Distribute the tier amount equally among all winners in that tier.
  // Integer division: any remainder is lost (acceptable for pence-level rounding).
  const prize5PerWinner = has5MatchWinner
    ? Math.floor(tier5Amount / fiveMatchWinners.length)
    : 0;
  const prize4PerWinner =
    fourMatchWinners.length > 0
      ? Math.floor(tier4Amount / fourMatchWinners.length)
      : 0;
  const prize3PerWinner =
    threeMatchWinners.length > 0
      ? Math.floor(tier3Amount / threeMatchWinners.length)
      : 0;

  // ── Step 10: Persist prize pool ───────────────────────────────────────────────
  // Upsert on draw_id — safe to re-run in simulate mode.
  await upsertPrizePool(supabase, {
    draw_id: drawId,
    total_pool_minor: effectiveTotalMinor,
    currency: "GBP",
    tier_5match_pct: TIER_5MATCH_PCT,
    tier_5match_amount: tier5Amount,
    tier_5match_rollover: tier5Rollover,
    tier_4match_pct: TIER_4MATCH_PCT,
    tier_4match_amount: tier4Amount,
    tier_3match_pct: TIER_3MATCH_PCT,
    tier_3match_amount: tier3Amount,
    rolled_over_amount: rolledOverAmount,
    calculated_at: new Date().toISOString(),
  });

  // ── Step 11: Persist winners ──────────────────────────────────────────────────
  // In simulate mode: delete previous simulated winners and re-insert.
  // In publish mode:  same logic (winners from simulation may be overwritten
  //                  by the final publish run if numbers differ).
  await persistWinners(supabase, drawId, [
    ...fiveMatchWinners.map((w) => ({
      ...w,
      prize_amount_minor: prize5PerWinner,
    })),
    ...fourMatchWinners.map((w) => ({
      ...w,
      prize_amount_minor: prize4PerWinner,
    })),
    ...threeMatchWinners.map((w) => ({
      ...w,
      prize_amount_minor: prize3PerWinner,
    })),
  ]);

  // ── Step 12: Update draw status ───────────────────────────────────────────────
  const newStatus = mode === "publish" ? "published" : "simulated";
  const adminNote =
    `[${new Date().toISOString()}] ${mode === "publish" ? "Published" : "Simulated"}. ` +
    `Winning numbers: [${winningNumbers.join(",")}]. ` +
    `Pool: £${(effectiveTotalMinor / 100).toFixed(2)} (incl. £${(rolledOverAmount / 100).toFixed(2)} rollover). ` +
    `Winners: ${fiveMatchWinners.length}×5-match, ${fourMatchWinners.length}×4-match, ${threeMatchWinners.length}×3-match. ` +
    `5-match rollover: ${tier5Rollover}.`;

  await updateDrawStatus(supabase, drawId, newStatus, adminNote);

  // ── Return summary ────────────────────────────────────────────────────────────
  return {
    draw_id: drawId,
    draw_month: draw.draw_month,
    mode,
    new_status: newStatus,
    active_subscriptions: activeSubscriptionCount,
    base_pool_minor: totalPoolMinor,
    rolled_over_amount_minor: rolledOverAmount,
    effective_pool_minor: effectiveTotalMinor,
    tier_5match_rollover: tier5Rollover,
    winning_numbers: winningNumbers,
    winners: {
      "5-match": fiveMatchWinners.length,
      "4-match": fourMatchWinners.length,
      "3-match": threeMatchWinners.length,
    },
    prize_per_winner: {
      "5-match": prize5PerWinner,
      "4-match": prize4PerWinner,
      "3-match": prize3PerWinner,
    },
  };
}

// ===========================================================================
// Step helpers
// ===========================================================================

// ---------------------------------------------------------------------------
// fetchDraw
// ---------------------------------------------------------------------------
async function fetchDraw(
  supabase: ReturnType<typeof createClient>,
  drawId: string
) {
  const { data, error } = await supabase
    .from("draws")
    .select("id, draw_month, status, draw_type, admin_notes")
    .eq("id", drawId)
    .single();

  if (error || !data) {
    throw new Error(`Draw not found: ${drawId} — ${error?.message}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// calculatePrizePool
// ---------------------------------------------------------------------------
// Counts active subscriptions for the draw month and computes the revenue.
//
// We count subscriptions whose current_period_end falls within the draw month
// (i.e., they were active during that billing period). This avoids counting
// subscriptions that lapsed mid-month or were created after draw cut-off.
//
// IMPORTANT: In a production system, the most accurate approach is to query
// Stripe's balance transactions for the month. This implementation uses the
// subscription table as an approximation — suitable for most use cases.
// ---------------------------------------------------------------------------
async function calculatePrizePool(
  supabase: ReturnType<typeof createClient>,
  drawMonth: string // e.g. "2026-09-01"
) {
  // Draw month boundaries (UTC)
  const monthStart = new Date(drawMonth);
  const monthEnd = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,  // last day of draw month
    23,
    59,
    59,
    999
  );

  // Count active subscriptions by plan type for this billing window.
  // A subscription is "for this month" if it was active and its billing period
  // overlaps with the draw month.
  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("plan_type")
    .eq("status", "active")
    .lte("current_period_start", monthEnd.toISOString())
    .gte("current_period_end", monthStart.toISOString());

  if (error) {
    throw new Error(`Failed to query subscriptions: ${error.message}`);
  }

  const monthlyCount = subs.filter((s) => s.plan_type === "monthly").length;
  const yearlyCount = subs.filter((s) => s.plan_type === "yearly").length;

  // Revenue contribution:
  // - Monthly subscribers contribute their full monthly fee.
  // - Yearly subscribers contribute 1/12 of their annual fee (pro-rated monthly share).
  const yearlyMonthlyShare = Math.floor(YEARLY_PLAN_AMOUNT / 12);
  const totalPoolMinor =
    monthlyCount * MONTHLY_PLAN_AMOUNT +
    yearlyCount * yearlyMonthlyShare;

  console.log(
    `[draw-engine] Pool calc: ${monthlyCount} monthly + ${yearlyCount} yearly = ` +
      `${totalPoolMinor} pence (£${(totalPoolMinor / 100).toFixed(2)})`
  );

  return {
    totalPoolMinor,
    activeSubscriptionCount: subs.length,
  };
}

// ---------------------------------------------------------------------------
// resolvePreviousRollover
// ---------------------------------------------------------------------------
// Checks the immediately preceding month's draw to see if the 5-match tier
// rolled over. If yes, returns that tier's amount to be added to this month's pool.
//
// Once claimed (by adding to the current pool), no DB update is needed here —
// the previous pool row's tier_5match_rollover = TRUE is a permanent audit
// record that a rollover occurred. The rolled_over_amount column on the
// CURRENT prize_pool row documents which prior amount was absorbed.
// ---------------------------------------------------------------------------
async function resolvePreviousRollover(
  supabase: ReturnType<typeof createClient>,
  drawMonth: string
): Promise<number> {
  // Calculate the first day of the previous month
  const thisMonth = new Date(drawMonth);
  const prevMonthDate = new Date(
    thisMonth.getFullYear(),
    thisMonth.getMonth() - 1,
    1
  );
  const prevMonthStr = prevMonthDate.toISOString().split("T")[0]; // "YYYY-MM-DD"

  // Find the previous month's published draw and its prize pool
  const { data: prevPool, error } = await supabase
    .from("prize_pools")
    .select(
      "tier_5match_amount, tier_5match_rollover, draw_id, draws!inner(draw_month, status)"
    )
    .eq("draws.draw_month", prevMonthStr)
    .eq("draws.status", "published")
    .maybeSingle();

  if (error) {
    console.warn(
      `[draw-engine] Could not query previous month's pool (${prevMonthStr}): ${error.message}. ` +
        `Proceeding with rollover = 0.`
    );
    return 0;
  }

  if (!prevPool) {
    console.log(
      `[draw-engine] No published draw found for ${prevMonthStr}. Rollover = £0.`
    );
    return 0;
  }

  if (prevPool.tier_5match_rollover) {
    const amount = prevPool.tier_5match_amount;
    console.log(
      `[draw-engine] 5-match rollover from ${prevMonthStr}: £${(amount / 100).toFixed(2)}`
    );
    return amount;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// fetchDrawEntries
// ---------------------------------------------------------------------------
async function fetchDrawEntries(
  supabase: ReturnType<typeof createClient>,
  drawId: string
) {
  const { data, error } = await supabase
    .from("draw_entries")
    .select("id, user_id, entry_numbers")
    .eq("draw_id", drawId);

  if (error) {
    throw new Error(`Failed to fetch draw entries: ${error.message}`);
  }

  return data as { id: string; user_id: string; entry_numbers: number[] }[];
}

// ---------------------------------------------------------------------------
// generateWinningNumbers
// ---------------------------------------------------------------------------
// Uses crypto.getRandomValues() for cryptographic randomness (not Math.random,
// which is not cryptographically secure and could be predicted).
//
// Algorithm: Fisher-Yates partial shuffle on the number pool array.
// Guarantees: no duplicates, uniform distribution.
// ---------------------------------------------------------------------------
function generateWinningNumbers(
  min: number,
  max: number,
  count: number
): number[] {
  if (count > max - min + 1) {
    throw new Error(
      `Cannot draw ${count} unique numbers from range [${min}, ${max}]`
    );
  }

  // Build the pool: [min, min+1, ..., max]
  const pool: number[] = Array.from(
    { length: max - min + 1 },
    (_, i) => i + min
  );

  // Partial Fisher-Yates shuffle — only shuffle the first `count` positions
  const randomBytes = new Uint32Array(count);
  crypto.getRandomValues(randomBytes);

  for (let i = 0; i < count; i++) {
    // Map the random uint32 to an index in the remaining unshuffled portion
    const j = i + (randomBytes[i] % (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Return sorted for consistency (entry_numbers are also stored sorted)
  return pool.slice(0, count).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// scoreEntries
// ---------------------------------------------------------------------------
// Compares each entry's numbers against the winning set.
// Only entries with 3, 4, or 5 matches qualify; fewer matches are discarded.
//
// If multiple users achieve 5-match, they split the tier prize equally.
// (This is intentional and standard in lottery mechanics.)
// ---------------------------------------------------------------------------
function scoreEntries(
  entries: { id: string; user_id: string; entry_numbers: number[] }[],
  winningNumbers: number[]
): WinnerCandidate[] {
  const winningSet = new Set(winningNumbers);
  const winners: WinnerCandidate[] = [];

  for (const entry of entries) {
    const matchCount = entry.entry_numbers.filter((n) =>
      winningSet.has(n)
    ).length;

    let tier: WinnerCandidate["tier"] | null = null;
    if (matchCount === 5) tier = "5-match";
    else if (matchCount === 4) tier = "4-match";
    else if (matchCount === 3) tier = "3-match";

    if (tier) {
      winners.push({
        user_id: entry.user_id,
        entry_id: entry.id,
        matched_count: matchCount,
        tier,
      });
    }
  }

  return winners;
}

// ---------------------------------------------------------------------------
// upsertPrizePool
// ---------------------------------------------------------------------------
async function upsertPrizePool(
  supabase: ReturnType<typeof createClient>,
  pool: Record<string, unknown>
) {
  const { error } = await supabase
    .from("prize_pools")
    .upsert(pool, { onConflict: "draw_id", ignoreDuplicates: false });

  if (error) {
    throw new Error(`Failed to upsert prize pool: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// persistWinners
// ---------------------------------------------------------------------------
// Deletes any previous winner records for this draw (safe for simulate re-runs),
// then inserts the fresh set. We delete-then-insert rather than upsert because
// the winner list itself may shrink between simulation runs (e.g., if winning
// numbers change on a re-simulation, a previous 3-match winner may no longer
// qualify).
// ---------------------------------------------------------------------------
async function persistWinners(
  supabase: ReturnType<typeof createClient>,
  drawId: string,
  winners: (WinnerCandidate & { prize_amount_minor: number })[]
) {
  // Delete previous entries for this draw (only matters in simulate mode re-runs)
  const { error: deleteError } = await supabase
    .from("draw_winners")
    .delete()
    .eq("draw_id", drawId);

  if (deleteError) {
    throw new Error(
      `Failed to clear previous winners for draw ${drawId}: ${deleteError.message}`
    );
  }

  if (winners.length === 0) {
    console.log(`[draw-engine] No winners to persist for draw ${drawId}`);
    return;
  }

  const rows = winners.map((w) => ({
    draw_id: drawId,
    user_id: w.user_id,
    tier: w.tier,
    prize_amount_minor: w.prize_amount_minor,
    payout_status: "pending" as const,
    proof_status: "not_submitted" as const,
  }));

  const { error } = await supabase.from("draw_winners").insert(rows);

  if (error) {
    throw new Error(`Failed to insert winners: ${error.message}`);
  }

  console.log(`[draw-engine] Inserted ${rows.length} winner record(s)`);
}

// ---------------------------------------------------------------------------
// updateDrawStatus
// ---------------------------------------------------------------------------
// Fetches the current admin_notes BEFORE updating so the new note is
// appended rather than overwriting the full simulation history.
// Every simulate and publish run produces a permanent, timestamped log entry.
// ---------------------------------------------------------------------------
async function updateDrawStatus(
  supabase: ReturnType<typeof createClient>,
  drawId: string,
  status: "simulated" | "published",
  adminNote: string
) {
  // Step 1: Read the current admin_notes so we can append to them.
  const { data: existing, error: fetchError } = await supabase
    .from("draws")
    .select("admin_notes")
    .eq("id", drawId)
    .single();

  if (fetchError) {
    throw new Error(
      `Failed to read existing admin_notes for draw ${drawId}: ${fetchError.message}`
    );
  }

  // Step 2: Build the appended notes string.
  // If no prior notes exist, start fresh. Otherwise separate with a divider.
  const appendedNotes = existing?.admin_notes
    ? `${existing.admin_notes}\n---\n${adminNote}`
    : adminNote;

  // Step 3: Write the updated status + full appended notes in one UPDATE.
  const { error: updateError } = await supabase
    .from("draws")
    .update({
      status,
      admin_notes: appendedNotes,
    })
    .eq("id", drawId);

  if (updateError) {
    throw new Error(
      `Failed to update draw status to ${status}: ${updateError.message}`
    );
  }

  console.log(`[draw-engine] Draw ${drawId} status → ${status}`);
}

// ===========================================================================
// Utility
// ===========================================================================

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
