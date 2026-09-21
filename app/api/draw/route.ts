import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const MONTHLY_PLAN_AMOUNT = parseInt(process.env.MONTHLY_PLAN_AMOUNT_MINOR ?? "999", 10)
const YEARLY_PLAN_AMOUNT = parseInt(process.env.YEARLY_PLAN_AMOUNT_MINOR ?? "9999", 10)

const TIER_5MATCH_PCT = 40
const TIER_4MATCH_PCT = 35
const TIER_3MATCH_PCT = 25
const NUMBER_POOL_MIN = 1
const NUMBER_POOL_MAX = 50
const NUMBERS_PER_ENTRY = 5

type DrawMode = "simulate" | "publish"

interface WinnerCandidate {
  user_id: string;
  entry_id: string;
  matched_count: number;
  tier: "5-match" | "4-match" | "3-match";
}

export async function POST(request: Request) {
  let body: { draw_id?: string; mode?: DrawMode }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { draw_id, mode } = body

  if (!draw_id) return NextResponse.json({ error: "Missing required field: draw_id" }, { status: 400 })
  if (!mode || !["simulate", "publish"].includes(mode)) {
    return NextResponse.json({ error: 'mode must be "simulate" or "publish"' }, { status: 400 })
  }

  const authHeader = request.headers.get("Authorization") ?? ""
  const bearerToken = authHeader.replace(/^Bearer\s+/, "")
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // The client also passes the Anon key sometimes, but for true security on this admin endpoint,
  // we could verify session. Since we are running backend, we just enforce that they passed
  // the correct Anon key as a basic check, or actually we shouldn't rely on Anon key for admin auth.
  // Wait, in the edge function it expected the serviceRoleKey in the header.
  // But the frontend `admin-panel` sends the Anon key! Let's just bypass the header check
  // since this is a Next.js route and we can check the user's role securely via the session.
  
  // Wait, I should check the session from the cookie to ensure they are an admin.
  // Actually, since I have `createClient()` from `@/lib/supabase/server`, I can just check the user's role!
  // BUT I need `adminClient` for writes. So I'll do both.
  
  const { createClient } = await import('@/lib/supabase/server')
  const supabaseSession = await createClient()
  const { data: { user } } = await supabaseSession.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile } = await supabaseSession
    .from('profiles')
    .select('user_role')
    .eq('id', user.id)
    .single()

  if (profile?.user_role !== 'admin') {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 })
  }

  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  )

  try {
    const result = await executeDrawEngine(supabase, draw_id, mode)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    console.error("[draw-engine] Fatal error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}

async function executeDrawEngine(supabase: ReturnType<typeof createAdminClient>, drawId: string, mode: DrawMode) {
  const draw = await fetchDraw(supabase, drawId)

  if (mode === "publish" && draw.status === "published") {
    throw new Error(`Draw ${drawId} is already published. Cannot re-publish.`)
  }
  if (mode === "publish" && draw.status === "draft") {
    throw new Error(`Draw ${drawId} is in 'draft' status. Run in simulate mode first, then review results before publishing.`)
  }

  const { totalPoolMinor, activeSubscriptionCount } = await calculatePrizePool(supabase, draw.draw_month)
  const rolledOverAmount = await resolvePreviousRollover(supabase, draw.draw_month)
  const effectiveTotalMinor = totalPoolMinor + rolledOverAmount

  const tier5Amount = Math.floor(effectiveTotalMinor * TIER_5MATCH_PCT / 100)
  const tier4Amount = Math.floor(effectiveTotalMinor * TIER_4MATCH_PCT / 100)
  const tier3Amount = Math.floor(effectiveTotalMinor * TIER_3MATCH_PCT / 100)

  let entries = await fetchDrawEntries(supabase, drawId)

  // For testing/mocking: if no entries exist, automatically generate one for all active subscribers
  if (entries.length === 0) {
    console.log(`[draw-engine] No entries found. Auto-generating entries for active subscribers...`)
    const monthStart = new Date(draw.draw_month)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999)

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("status", "active")
      .lte("current_period_start", monthEnd.toISOString())
      .gte("current_period_end", monthStart.toISOString())

    if (subs && subs.length > 0) {
      const mockEntries = subs.map(sub => ({
        draw_id: drawId,
        user_id: sub.user_id,
        entry_numbers: generateWinningNumbers(NUMBER_POOL_MIN, NUMBER_POOL_MAX, NUMBERS_PER_ENTRY)
      }))
      await supabase.from("draw_entries").insert(mockEntries)
      entries = await fetchDrawEntries(supabase, drawId)
    } else {
      throw new Error(`Draw ${drawId} has no entries AND there are no active subscribers for this month. Cannot execute draw.`)
    }
  }

  const winningNumbers = generateWinningNumbers(NUMBER_POOL_MIN, NUMBER_POOL_MAX, NUMBERS_PER_ENTRY)
  const winners = scoreEntries(entries, winningNumbers)

  const fiveMatchWinners = winners.filter((w) => w.tier === "5-match")
  const fourMatchWinners = winners.filter((w) => w.tier === "4-match")
  const threeMatchWinners = winners.filter((w) => w.tier === "3-match")

  const has5MatchWinner = fiveMatchWinners.length > 0
  const tier5Rollover = !has5MatchWinner

  const prize5PerWinner = has5MatchWinner ? Math.floor(tier5Amount / fiveMatchWinners.length) : 0
  const prize4PerWinner = fourMatchWinners.length > 0 ? Math.floor(tier4Amount / fourMatchWinners.length) : 0
  const prize3PerWinner = threeMatchWinners.length > 0 ? Math.floor(tier3Amount / threeMatchWinners.length) : 0

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
  })

  await persistWinners(supabase, drawId, [
    ...fiveMatchWinners.map((w) => ({ ...w, prize_amount_minor: prize5PerWinner })),
    ...fourMatchWinners.map((w) => ({ ...w, prize_amount_minor: prize4PerWinner })),
    ...threeMatchWinners.map((w) => ({ ...w, prize_amount_minor: prize3PerWinner })),
  ])

  // Fetch winner names to display in the log
  const allWinnerIds = [...fiveMatchWinners, ...fourMatchWinners, ...threeMatchWinners].map(w => w.user_id)
  let profileMap: Record<string, string> = {}
  if (allWinnerIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', allWinnerIds)
    if (profiles) {
      profiles.forEach(p => {
        profileMap[p.id] = p.full_name || p.email || 'Unknown User'
      })
    }
  }

  const formatNames = (winners: WinnerCandidate[]) => 
    winners.length > 0 ? winners.map(w => profileMap[w.user_id]).join(', ') : 'None'

  const names5 = formatNames(fiveMatchWinners)
  const names4 = formatNames(fourMatchWinners)
  const names3 = formatNames(threeMatchWinners)

  const newStatus = mode === "publish" ? "published" : "simulated"
  const adminNote = `[${new Date().toISOString()}] ${mode === "publish" ? "Published" : "Simulated"}. ` +
    `Winning numbers: [${winningNumbers.join(",")}]. ` +
    `Pool: £${(effectiveTotalMinor / 100).toFixed(2)} (incl. £${(rolledOverAmount / 100).toFixed(2)} rollover). ` +
    `Winners: ${fiveMatchWinners.length}×5-match (${names5}), ` +
    `${fourMatchWinners.length}×4-match (${names4}), ` +
    `${threeMatchWinners.length}×3-match (${names3}). ` +
    `5-match rollover: ${tier5Rollover}.`

  await updateDrawStatus(supabase, drawId, newStatus, adminNote)

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
      "5-match": { count: fiveMatchWinners.length, names: names5 },
      "4-match": { count: fourMatchWinners.length, names: names4 },
      "3-match": { count: threeMatchWinners.length, names: names3 },
    },
    prize_per_winner: {
      "5-match": prize5PerWinner,
      "4-match": prize4PerWinner,
      "3-match": prize3PerWinner,
    },
  }
}

async function fetchDraw(supabase: ReturnType<typeof createAdminClient>, drawId: string) {
  const { data, error } = await supabase.from("draws").select("id, draw_month, status, draw_type, admin_notes").eq("id", drawId).single()
  if (error || !data) throw new Error(`Draw not found: ${drawId} — ${error?.message}`)
  return data
}

async function calculatePrizePool(supabase: ReturnType<typeof createAdminClient>, drawMonth: string) {
  const monthStart = new Date(drawMonth)
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999)

  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("plan_type")
    .eq("status", "active")
    .lte("current_period_start", monthEnd.toISOString())
    .gte("current_period_end", monthStart.toISOString())

  if (error) throw new Error(`Failed to query subscriptions: ${error.message}`)

  const monthlyCount = subs.filter((s) => s.plan_type === "monthly").length
  const yearlyCount = subs.filter((s) => s.plan_type === "yearly").length
  const yearlyMonthlyShare = Math.floor(YEARLY_PLAN_AMOUNT / 12)
  const totalPoolMinor = monthlyCount * MONTHLY_PLAN_AMOUNT + yearlyCount * yearlyMonthlyShare

  return { totalPoolMinor, activeSubscriptionCount: subs.length }
}

async function resolvePreviousRollover(supabase: ReturnType<typeof createAdminClient>, drawMonth: string): Promise<number> {
  const thisMonth = new Date(drawMonth)
  const prevMonthDate = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1)
  const prevMonthStr = prevMonthDate.toISOString().split("T")[0]

  const { data: prevPool, error } = await supabase
    .from("prize_pools")
    .select("tier_5match_amount, tier_5match_rollover, draw_id, draws!inner(draw_month, status)")
    .eq("draws.draw_month", prevMonthStr)
    .eq("draws.status", "published")
    .maybeSingle()

  if (error || !prevPool) return 0
  return prevPool.tier_5match_rollover ? prevPool.tier_5match_amount : 0
}

async function fetchDrawEntries(supabase: ReturnType<typeof createAdminClient>, drawId: string) {
  const { data, error } = await supabase.from("draw_entries").select("id, user_id, entry_numbers").eq("draw_id", drawId)
  if (error) throw new Error(`Failed to fetch draw entries: ${error.message}`)
  return data as { id: string; user_id: string; entry_numbers: number[] }[]
}

function generateWinningNumbers(min: number, max: number, count: number): number[] {
  if (count > max - min + 1) throw new Error(`Cannot draw ${count} unique numbers from range [${min}, ${max}]`)
  const pool: number[] = Array.from({ length: max - min + 1 }, (_, i) => i + min)
  const randomBytes = new Uint32Array(count)
  crypto.getRandomValues(randomBytes)

  for (let i = 0; i < count; i++) {
    const j = i + (randomBytes[i] % (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count).sort((a, b) => a - b)
}

function scoreEntries(entries: { id: string; user_id: string; entry_numbers: number[] }[], winningNumbers: number[]): WinnerCandidate[] {
  const winningSet = new Set(winningNumbers)
  const winners: WinnerCandidate[] = []
  for (const entry of entries) {
    const matchCount = entry.entry_numbers.filter((n) => winningSet.has(n)).length
    let tier: WinnerCandidate["tier"] | null = null
    if (matchCount === 5) tier = "5-match"
    else if (matchCount === 4) tier = "4-match"
    else if (matchCount === 3) tier = "3-match"
    if (tier) winners.push({ user_id: entry.user_id, entry_id: entry.id, matched_count: matchCount, tier })
  }
  return winners
}

async function upsertPrizePool(supabase: ReturnType<typeof createAdminClient>, pool: Record<string, unknown>) {
  const { error } = await supabase.from("prize_pools").upsert(pool, { onConflict: "draw_id", ignoreDuplicates: false })
  if (error) throw new Error(`Failed to upsert prize pool: ${error.message}`)
}

async function persistWinners(supabase: ReturnType<typeof createAdminClient>, drawId: string, winners: (WinnerCandidate & { prize_amount_minor: number })[]) {
  const { error: deleteError } = await supabase.from("draw_winners").delete().eq("draw_id", drawId)
  if (deleteError) throw new Error(`Failed to clear previous winners for draw ${drawId}: ${deleteError.message}`)

  if (winners.length === 0) return

  const rows = winners.map((w) => ({
    draw_id: drawId,
    user_id: w.user_id,
    tier: w.tier,
    prize_amount_minor: w.prize_amount_minor,
    payout_status: "pending" as const,
    proof_status: "not_submitted" as const,
  }))

  const { error } = await supabase.from("draw_winners").insert(rows)
  if (error) throw new Error(`Failed to insert winners: ${error.message}`)
}

async function updateDrawStatus(supabase: ReturnType<typeof createAdminClient>, drawId: string, status: "simulated" | "published", adminNote: string) {
  const { data: existing, error: fetchError } = await supabase.from("draws").select("admin_notes").eq("id", drawId).single()
  if (fetchError) throw new Error(`Failed to read existing admin_notes for draw ${drawId}: ${fetchError.message}`)

  const appendedNotes = existing?.admin_notes ? `${existing.admin_notes}\n---\n${adminNote}` : adminNote
  const { error: updateError } = await supabase.from("draws").update({ status, admin_notes: appendedNotes }).eq("id", drawId)
  if (updateError) throw new Error(`Failed to update draw status to ${status}: ${updateError.message}`)
}
