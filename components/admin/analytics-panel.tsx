interface Analytics { totalUsers: number; activeSubs: number; totalDonated: number }
interface Props { analytics: Analytics; draws: any[] }

function KpiCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="glass p-6">
      <div className={`text-3xl mb-3`}>{icon}</div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

export default function AnalyticsPanel({ analytics, draws }: Props) {
  const lastDraw = draws.find(d => d.status === 'published')
  const pool = lastDraw?.prize_pools

  const conversionRate = analytics.totalUsers > 0
    ? ((analytics.activeSubs / analytics.totalUsers) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-8">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon="👥" label="Total members"   value={String(analytics.totalUsers)} color="gradient-text" />
        <KpiCard icon="✅" label="Active subs"     value={String(analytics.activeSubs)} sub={`${conversionRate}% conversion`} color="gradient-text-impact" />
        <KpiCard icon="❤️" label="Total donated"   value={`£${(analytics.totalDonated / 100).toFixed(0)}`} color="gradient-text-prize" />
        {pool && (
          <KpiCard icon="🎯" label="Latest pool"   value={`£${(pool.total_pool_minor / 100).toFixed(0)}`} sub={pool.tier_5match_rollover ? '⚠️ Jackpot rolling' : undefined} color="gradient-text-prize" />
        )}
      </div>

      {/* Recent draws table */}
      <div className="glass p-6">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Draw History</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Status</th>
                <th>Pool</th>
                <th>Type</th>
                <th>5-Match Rollover</th>
              </tr>
            </thead>
            <tbody>
              {draws.map(d => (
                <tr key={d.id}>
                  <td className="text-white font-medium">
                    {new Date(d.draw_month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                  </td>
                  <td>
                    <span className={
                      d.status === 'published' ? 'badge-active' :
                      d.status === 'simulated' ? 'badge-pending' : 'badge-inactive'
                    }>{d.status}</span>
                  </td>
                  <td className="text-prize-400 font-semibold">
                    {d.prize_pools ? `£${(d.prize_pools.total_pool_minor / 100).toFixed(2)}` : '—'}
                  </td>
                  <td className="capitalize">{d.draw_type ?? '—'}</td>
                  <td>
                    {d.prize_pools?.tier_5match_rollover
                      ? <span className="text-prize-400">Yes</span>
                      : <span className="text-slate-600">No</span>
                    }
                  </td>
                </tr>
              ))}
              {draws.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-600 py-8">No draws yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
