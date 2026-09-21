import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Mock subscription — creates an active subscription row directly in the DB.
// Replace this block with a real Stripe Checkout session when Stripe becomes available.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // If already active, just redirect
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (existing) {
    return NextResponse.json({ url: '/dashboard?subscribed=true' })
  }

  const { plan } = await request.json().catch(() => ({ plan: 'monthly' }))
  const isYearly = plan === 'yearly'

  const now = new Date()
  const periodEnd = new Date(now)
  isYearly
    ? periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    : periodEnd.setMonth(periodEnd.getMonth() + 1)

  // Deterministic mock IDs so re-subscribing is idempotent
  const mockCustomerId = `mock_cus_${user.id.slice(0, 8)}`
  const mockSubId      = `mock_sub_${user.id.slice(0, 8)}_${Date.now()}`

  const { error } = await supabase.from('subscriptions').insert({
    user_id:                user.id,
    stripe_customer_id:     mockCustomerId,
    stripe_sub_id:          mockSubId,
    status:                 'active',
    plan_type:              isYearly ? 'yearly' : 'monthly',
    current_period_start:   now.toISOString(),
    current_period_end:     periodEnd.toISOString(),
    cancel_at_period_end:   false,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ url: '/dashboard?subscribed=true' })
}
