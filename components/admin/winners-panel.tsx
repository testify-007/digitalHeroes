'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props { winners: any[] }

const PROOF_LABELS: Record<string, string> = {
  not_submitted: 'Not submitted',
  submitted:     'Submitted — review',
  approved:      'Approved',
  rejected:      'Rejected',
}

export default function WinnersPanel({ winners }: Props) {
  const router = useRouter()
  const [updating, setUpdating] = useState<string | null>(null)

  const update = async (id: string, patch: Record<string, any>) => {
    setUpdating(id)
    const supabase = createClient()
    await supabase.from('draw_winners').update(patch).eq('id', id)
    setUpdating(null)
    router.refresh()
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const TIER_LABELS: Record<string, string> = {
    '5-match': '🏆 5-Match',
    '4-match': '🥈 4-Match',
    '3-match': '🥉 3-Match',
  }

  return (
    <div className="glass p-6">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
        Winners Verification ({winners.length})
      </h3>

      {winners.length === 0 ? (
        <p className="text-center text-slate-600 py-12 text-sm">No pending winners to verify.</p>
      ) : (
        <div className="space-y-4">
          {winners.map(w => (
            <div key={w.id} className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-white">
                    {w.profile?.full_name ?? w.profile?.email ?? 'Unknown user'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {w.draw ? fmt(w.draw.draw_month) : ''} · {TIER_LABELS[w.winner_tier] ?? w.winner_tier}
                  </p>
                </div>
                <p className="text-xl font-black text-prize-400">
                  £{(w.prize_amount_minor / 100).toFixed(2)}
                </p>
              </div>

              {/* Proof */}
              {w.proof_upload_url && (
                <div className="bg-white/5 rounded-xl p-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-300 truncate">{w.proof_upload_url.split('/').pop()}</p>
                  <a
                    href={w.proof_upload_url} target="_blank" rel="noopener noreferrer"
                    className="btn-secondary !px-3 !py-1.5 !text-xs flex-shrink-0"
                  >
                    View proof ↗
                  </a>
                </div>
              )}

              {/* Status + actions */}
              <div className="flex flex-wrap items-center gap-3">
                <span className={
                  w.proof_status === 'approved' ? 'badge-active' :
                  w.proof_status === 'submitted' ? 'badge-pending' :
                  w.proof_status === 'rejected'  ? 'badge-lapsed' : 'badge-inactive'
                }>
                  {PROOF_LABELS[w.proof_status] ?? w.proof_status}
                </span>
                <span className={w.payout_status === 'paid' ? 'badge-active' : 'badge-inactive'}>
                  {w.payout_status === 'paid' ? '✓ Paid' : 'Unpaid'}
                </span>

                <div className="ml-auto flex gap-2">
                  {w.proof_status === 'submitted' && (
                    <>
                      <button
                        onClick={() => update(w.id, { proof_status: 'approved' })}
                        disabled={updating === w.id}
                        className="btn-impact !px-3 !py-1.5 !text-xs disabled:opacity-60"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => update(w.id, { proof_status: 'rejected' })}
                        disabled={updating === w.id}
                        className="btn-danger disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {w.proof_status === 'approved' && w.payout_status === 'pending' && (
                    <button
                      onClick={() => update(w.id, { payout_status: 'paid' })}
                      disabled={updating === w.id}
                      className="btn-prize !px-3 !py-1.5 !text-xs disabled:opacity-60"
                    >
                      Mark paid
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
