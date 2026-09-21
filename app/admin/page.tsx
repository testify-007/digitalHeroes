import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import AdminPanel from '@/components/admin/admin-panel'

export const metadata: Metadata = { title: 'Admin Dashboard' }

export default async function AdminPage() {
  const supabase = await createClient()

  // ── Auth + role gate ──────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('user_role').eq('id', user.id).single()
  if (profile?.user_role !== 'admin') redirect('/dashboard')

  // ── Analytics data ────────────────────────────────────────────────────────
  const [
    { count: totalUsers },
    { count: activeSubs },
    { data: draws },
    { data: charities },
    { data: pendingWinners },
    { data: profiles },
    { data: donations },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('draws').select('*, prize_pools(*)').order('draw_month', { ascending: false }).limit(20),
    supabase.from('charities').select('*').order('name'),
    supabase.from('draw_winners')
      .select('*, draw:draws(draw_month), profile:profiles(full_name, email)')
      .in('proof_status', ['submitted', 'not_submitted']).order('created_at', { ascending: false }),
    supabase.from('profiles')
      .select('*, subscription:subscriptions(status, plan_type, current_period_end)')
      .order('created_at', { ascending: false }).limit(50),
    supabase.from('donations').select('amount_minor').eq('status', 'completed'),
  ])

  const totalDonated = (donations ?? []).reduce((s, d) => s + (d.amount_minor ?? 0), 0)

  const analytics = {
    totalUsers:    totalUsers ?? 0,
    activeSubs:    activeSubs ?? 0,
    totalDonated,
  }

  return (
    <div className="min-h-screen pt-20 pb-16">
      <div className="section py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
                            bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase tracking-wider mb-3">
              Admin
            </div>
            <h1 className="text-3xl font-black gradient-text">Control Centre</h1>
            <p className="text-slate-400 mt-1">Manage draws, charities, users, and winners</p>
          </div>
        </div>

        <AdminPanel
          analytics={analytics}
          draws={draws as any[] ?? []}
          charities={charities as any[] ?? []}
          pendingWinners={pendingWinners as any[] ?? []}
          profiles={profiles as any[] ?? []}
        />
      </div>
    </div>
  )
}
