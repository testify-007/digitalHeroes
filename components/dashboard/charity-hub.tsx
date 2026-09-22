'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Charity  { id: string; name: string; logo_url: string | null }
interface Contrib  {
  id: string; charity_id: string; contribution_pct: number; is_active: boolean
  charity: Charity | null
}
interface Props {
  contribution: Contrib | null
  charities: Charity[]
  userId: string
  isActive: boolean
}

export default function CharityHub({ contribution, charities, userId, isActive }: Props) {
  const router = useRouter()
  const [showModal, setShowModal]     = useState(false)
  const [selectedId, setSelectedId]  = useState(contribution?.charity_id ?? '')
  const [pct, setPct]                = useState(contribution?.contribution_pct ?? 10)
  const [saving, setSaving]          = useState(false)
  const [error, setError]            = useState<string | null>(null)

  const handleSave = async () => {
    if (!selectedId) { setError('Please select a charity.'); return }
    if (pct < 10 || pct > 100) { setError('Contribution must be 10–100%.'); return }
    setSaving(true); setError(null)
    const supabase = createClient()
    const { error: rpcErr } = await supabase.rpc('change_charity_contribution', {
      p_charity_id: selectedId,
      p_contribution_pct: pct,
    })
    setSaving(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setShowModal(false)
    router.refresh()
  }

  const current = contribution?.charity

  return (
    <>
      <div className="glass p-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">Charity Hub</h2>

        {current ? (
          <div className="space-y-4">
            {/* Current charity */}
            <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                {current.logo_url
                  ? <img src={current.logo_url} alt={current.name} className="w-full h-full object-cover rounded-xl" />
                  : <span className="text-sm font-black text-slate-400">{current.name.slice(0,2).toUpperCase()}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{current.name}</p>
                <p className="text-xs text-slate-600">
                  {contribution?.contribution_pct}% of your subscription
                </p>
              </div>
              <span className="badge-active">Active</span>
            </div>

            <div className="flex gap-3">
              {isActive && (
                <button onClick={() => setShowModal(true)} className="btn-secondary flex-1 justify-center !text-sm">
                  Change charity
                </button>
              )}
              <Link
                href={`/donate?charity=${contribution?.charity_id}`}
                className="btn-impact flex-1 justify-center !text-sm"
              >
                ❤️ Donate
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">You haven&apos;t selected a charity yet.</p>
            {isActive && (
              <button onClick={() => setShowModal(true)} className="btn-primary w-full justify-center !text-sm">
                Choose your charity
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Change charity modal ─────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative z-10 glass p-6 w-full max-w-md shadow-card">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Select Charity & Contribution</h3>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                {error}
              </div>
            )}

            {/* Charity selector */}
            <div className="space-y-2 max-h-56 overflow-y-auto mb-4 pr-1">
              {charities.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    selectedId === c.id
                      ? 'bg-brand-50 border-brand-200 text-brand-900'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                    {c.logo_url
                      ? <img src={c.logo_url} alt={c.name} className="w-full h-full object-cover rounded-lg" />
                      : <span className="text-xs font-black text-slate-400">{c.name.slice(0,2).toUpperCase()}</span>
                    }
                  </div>
                  <span className="text-sm font-medium text-left">{c.name}</span>
                  {selectedId === c.id && (
                    <svg className="w-4 h-4 text-brand-400 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Percentage slider */}
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <label className="label mb-0">Contribution %</label>
                <span className="text-brand-400 font-bold">{pct}%</span>
              </div>
              <input
                type="range" min={10} max={100} step={5}
                value={pct} onChange={e => setPct(Number(e.target.value))}
                className="w-full accent-brand-500 h-2 rounded-full"
              />
              <div className="flex justify-between text-xs text-slate-600 mt-1">
                <span>10% (min)</span><span>100%</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-60">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
