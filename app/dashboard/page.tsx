import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import SubscriptionPanel from '@/components/dashboard/subscription-panel'
import ScoreForm from '@/components/dashboard/score-form'
import ScoreList from '@/components/dashboard/score-list'
import CharityHub from '@/components/dashboard/charity-hub'
import WinningsPanel from '@/components/dashboard/winnings-panel'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()

  // ── Auth gate ─────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Parallel data fetching ────────────────────────────────────────────────
  const [
    { data: profile },
    { data: subscription },
    { data: scores },
    { data: contribution },
    { data: draws },
    { data: winnings },
    { data: charities },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('subscriptions')
      .select('*').eq('user_id', user.id).eq('status', 'active').single(),
    supabase.from('golf_scores')
      .select('*').eq('user_id', user.id)
      .order('score_date', { ascending: false }).limit(5),
    supabase.from('charity_contributions')
      .select('*, charity:charities(id, name, logo_url, description)')
      .eq('user_id', user.id).eq('is_active', true).single(),
    supabase.from('draws')
      .select('id, draw_month, status, prize_pools(total_pool_minor)')
      .in('status', ['published', 'simulated'])
      .order('draw_month', { ascending: false }).limit(5),
    supabase.from('draw_winners')
      .select('*, draw:draws(draw_month, status)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('charities').select('id, name, logo_url').eq('is_published', true),
  ])

  const isActive = !!subscription

  return (
    <div className="min-h-screen pt-20 pb-16">
      <div className="section py-8">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black gradient-text">
              Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-slate-600 mt-1">Your performance and impact hub</p>
          </div>
          {!isActive && (
            <a href="/api/subscribe" className="btn-prize text-sm">
              Activate subscription
            </a>
          )}
        </div>

        {/* ── Grid layout ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <SubscriptionPanel subscription={subscription} />
            <CharityHub
              contribution={contribution as any}
              charities={charities ?? []}
              userId={user.id}
              isActive={isActive}
            />
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Score entry */}
            <div className="glass p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brand-500" />
                Log a Score
              </h2>
              {isActive ? (
                <ScoreForm userId={user.id} />
              ) : (
                <p className="text-slate-500 text-sm py-4">
                  An active subscription is required to log scores and enter draws.{' '}
                  <a href="/api/subscribe" className="text-brand-400 hover:text-brand-300">Subscribe now →</a>
                </p>
              )}
            </div>

            {/* Recent scores */}
            <div className="glass p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-impact-500" />
                Recent Scores
              </h2>
              <ScoreList scores={scores ?? []} />
            </div>

            {/* Winnings */}
            <WinningsPanel
              draws={draws as any[]}
              winnings={winnings as any[]}
              userId={user.id}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
