import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import CharityCard from '@/components/charity-card'
import HowItWorks from '@/components/how-it-works'

export const metadata: Metadata = {
  title: 'Digital Heroes — Track. Win. Give.',
  description: 'Every Stableford score you log enters you into monthly prize draws. Every subscription directly funds the charities you choose.',
}

export default async function HomePage() {
  const supabase = await createClient()

  // Fetch published charities for the spotlight section
  const { data: charities } = await supabase
    .from('charities')
    .select('id, name, slug, description, logo_url, upcoming_events')
    .eq('is_published', true)
    .order('name')
    .limit(6)

  // Fetch latest published draw for prize pool teaser
  const { data: latestDraw } = await supabase
    .from('draws')
    .select('id, draw_month, prize_pools(total_pool_minor, tier_5match_amount, tier_5match_rollover, rolled_over_amount)')
    .eq('status', 'published')
    .order('draw_month', { ascending: false })
    .limit(1)
    .single()

  const pool = latestDraw?.prize_pools as any
  const totalPool = pool ? (pool.total_pool_minor / 100).toFixed(2) : null

  return (
    <div className="overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center pt-16">
        {/* Background mesh gradient */}
        <div className="absolute inset-0 bg-hero-mesh pointer-events-none" />
        {/* Floating orb — top right */}
        <div className="absolute top-24 right-0 w-[600px] h-[600px] rounded-full
                        bg-brand-500/20 blur-[120px] pointer-events-none animate-pulse-glow" />
        {/* Floating orb — bottom left */}
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full
                        bg-impact-500/20 blur-[100px] pointer-events-none" />

        <div className="section relative z-10 py-24">
          <div className="max-w-4xl">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                            bg-brand-600/15 border border-brand-500/30 text-brand-400 text-sm font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
              Golf Performance · Monthly Draws · Charitable Impact
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-black leading-[1.05] mb-6 text-balance">
              Every Swing{' '}
              <span className="gradient-text-brand">Funds</span>{' '}
              <br className="hidden sm:block" />
              Their Future
            </h1>

            <p className="text-xl text-slate-600 max-w-2xl mb-10 leading-relaxed">
              Digital Heroes unites golfers with purpose — track your Stableford scores,
              enter guaranteed monthly prize draws, and direct your subscription to
              the charities that move you most.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 mb-16">
              <SubscribeButton />
              <Link href="/donate" className="btn-secondary text-base">
                Make a Donation
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </Link>
            </div>

            {/* Impact stat bar */}
            <div className="grid grid-cols-3 gap-6 sm:gap-10 pt-8 border-t border-slate-200 max-w-lg">
              {[
                { value: '£24k+', label: 'Raised for charity' },
                { value: '12',    label: 'Partner charities' },
                { value: '89',    label: 'Draw winners' },
              ].map(stat => (
                <div key={stat.label}>
                  <p className="text-2xl sm:text-3xl font-black gradient-text-prize">{stat.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-float">
          <div className="w-6 h-10 rounded-full border-2 border-slate-300 flex justify-center pt-2">
            <div className="w-1.5 h-3 bg-brand-400 rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <section className="py-24 relative">
        <div className="section">
          <div className="text-center mb-16">
            <p className="text-brand-400 font-semibold text-sm uppercase tracking-widest mb-3">The Loop</p>
            <h2 className="text-4xl font-black gradient-text mb-4">How Digital Heroes Works</h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              Four simple steps connect your game to global good.
            </p>
          </div>
          <HowItWorks />
        </div>
      </section>

      {/* ── PRIZE POOL TEASER ────────────────────────────────────────── */}
      {pool && (
        <section className="py-16">
          <div className="section">
            <div className="glass p-8 md:p-12 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-prize-500/5 to-transparent pointer-events-none" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-gradient-to-r from-transparent via-prize-500/60 to-transparent" />
              <p className="text-prize-400 font-semibold text-sm uppercase tracking-widest mb-3">Latest Prize Pool</p>
              <p className="text-6xl font-black gradient-text-prize mb-4">£{totalPool}</p>
              <p className="text-slate-500 mb-8">
                Split across three prize tiers — 40% · 35% · 25%
                {pool.tier_5match_rollover && (
                  <span className="ml-2 px-2.5 py-0.5 rounded-full bg-prize-500/20 text-prize-400 text-xs font-semibold border border-prize-500/30">
                    Jackpot rolling over!
                  </span>
                )}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <SubscribeButton />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── CHARITY SPOTLIGHT ────────────────────────────────────────── */}
      {charities && charities.length > 0 && (
        <section className="py-24">
          <div className="section">
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="text-impact-400 font-semibold text-sm uppercase tracking-widest mb-3">Impact Partners</p>
                <h2 className="text-4xl font-black gradient-text">Our Charity Partners</h2>
              </div>
              <Link href="/donate" className="hidden sm:block text-sm text-slate-500 hover:text-slate-900 transition-colors">
                Donate directly →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {charities.map((charity) => (
                <CharityCard key={charity.id} charity={charity} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FINAL CTA ────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="section">
          <div className="relative rounded-3xl overflow-hidden glass p-12 md:p-20 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-100/50 via-transparent to-impact-100/50" />
            <div className="relative z-10">
              <h2 className="text-4xl md:text-5xl font-black gradient-text mb-6">
                Ready to play with purpose?
              </h2>
              <p className="text-slate-600 text-lg max-w-xl mx-auto mb-10">
                Join hundreds of members who track their game, win monthly prizes,
                and fund real change for the charities they love.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <SubscribeButton large />
                <Link href="/donate" className="btn-secondary text-base">
                  Donate without subscribing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}

/* ── Subscribe button: client-side Stripe redirect ─────────────────────── */
// Small client component embedded here to avoid a separate file
import SubscribeButton from '@/components/subscribe-button'
