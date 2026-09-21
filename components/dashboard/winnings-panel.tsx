'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Draw    { id: string; draw_month: string; status: string; prize_pools: any }
interface Winner  { id: string; winner_tier: string; prize_amount_minor: number; payout_status: string; proof_status: string; proof_upload_url: string | null; draw: any }
interface Props   { draws: Draw[]; winnings: Winner[]; userId: string }

const TIER_LABELS: Record<string, string> = {
  '5-match': '🏆 5-Match Winner',
  '4-match': '🥈 4-Match Winner',
  '3-match': '🥉 3-Match Winner',
}

export default function WinningsPanel({ draws, winnings, userId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading]   = useState<string | null>(null)
  const [uploadErr, setUploadErr]   = useState<string | null>(null)
  const [uploadOk, setUploadOk]     = useState<string | null>(null)

  const handleUpload = async (winnerId: string, file: File) => {
    setUploading(winnerId); setUploadErr(null); setUploadOk(null)
    const supabase = createClient()
    const ext  = file.name.split('.').pop()
    const path = `${userId}/${winnerId}.${ext}`

    const { error: storageErr } = await supabase.storage
      .from('winner-proofs')
      .upload(path, file, { upsert: true })

    if (storageErr) { setUploadErr(storageErr.message); setUploading(null); return }

    const { data: { publicUrl } } = supabase.storage.from('winner-proofs').getPublicUrl(path)

    await supabase.from('draw_winners').update({
      proof_upload_url: publicUrl,
      proof_status: 'submitted',
    }).eq('id', winnerId)

    setUploading(null)
    setUploadOk(winnerId)
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="glass p-6">
      <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-prize-500" />
        Draws & Winnings
      </h2>

      {/* Upcoming / recent draws */}
      {draws.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-3">Recent Draws</h3>
          <div className="space-y-2">
            {draws.map(d => {
              const pool = d.prize_pools
              return (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/8">
                  <div>
                    <p className="text-sm font-medium text-white">{fmt(d.draw_month)}</p>
                    {pool?.total_pool_minor && (
                      <p className="text-xs text-slate-500">Pool: £{(pool.total_pool_minor / 100).toFixed(2)}</p>
                    )}
                  </div>
                  <span className={d.status === 'published' ? 'badge-active' : 'badge-pending'}>
                    {d.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Winnings */}
      {winnings.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-3">Your Winnings</h3>
          <div className="space-y-4">
            {winnings.map(w => (
              <div key={w.id} className="p-4 rounded-xl bg-prize-500/10 border border-prize-500/20">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-prize-300">{TIER_LABELS[w.winner_tier] ?? w.winner_tier}</p>
                    <p className="text-sm text-slate-400">{w.draw ? fmt(w.draw.draw_month) : ''}</p>
                  </div>
                  <p className="text-xl font-black text-prize-400">
                    £{(w.prize_amount_minor / 100).toFixed(2)}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <span className={w.payout_status === 'paid' ? 'badge-active' : 'badge-pending'}>
                      {w.payout_status === 'paid' ? '✓ Paid' : 'Pending'}
                    </span>
                    <span className={
                      w.proof_status === 'approved' ? 'badge-active' :
                      w.proof_status === 'submitted' ? 'badge-pending' : 'badge-inactive'
                    }>
                      Proof: {w.proof_status}
                    </span>
                  </div>

                  {/* Upload proof */}
                  {w.proof_status === 'not_submitted' && (
                    <div>
                      <input
                        ref={fileRef} type="file" accept="image/*,.pdf"
                        className="hidden"
                        onChange={e => e.target.files?.[0] && handleUpload(w.id, e.target.files[0])}
                      />
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading === w.id}
                        className="btn-secondary !text-xs !px-3 !py-1.5 disabled:opacity-60"
                      >
                        {uploading === w.id ? 'Uploading…' : '↑ Upload proof'}
                      </button>
                    </div>
                  )}
                  {uploadOk === w.id && (
                    <span className="text-xs text-impact-400">✓ Uploaded!</span>
                  )}
                </div>

                {uploadErr && uploading === null && (
                  <p className="text-xs text-rose-400 mt-2">{uploadErr}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-slate-500">
          <svg className="w-10 h-10 mx-auto mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <p className="text-sm">No winnings yet — keep playing and entering draws!</p>
        </div>
      )}
    </div>
  )
}
