import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Mock donate route — records the donation as succeeded immediately.
// Replace with a real Stripe PaymentIntent when Stripe becomes available.
export async function POST(request: Request) {
  const { charityId, amountMinor } = await request.json()

  if (!charityId || !amountMinor || amountMinor < 100) {
    return NextResponse.json(
      { error: 'charityId and amountMinor (min 100) required.' },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const mockPaymentId = `mock_pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const { error } = await supabase.from('donations').insert({
    user_id:           user?.id ?? null,
    charity_id:        charityId,
    amount_minor:      amountMinor,
    currency:          'gbp',
    stripe_payment_id: mockPaymentId,
    status:            'succeeded',
    is_anonymous:      !user,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
