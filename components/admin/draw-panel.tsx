'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props { draws: any[] }

export default function DrawPanel({ draws }: Props) {
  const router = useRouter()
  const [selectedDraw, setSelectedDraw] = useState(draws[0]?.id ?? '')
  const [mode, setMode]       = useState<'simulate' | 'publish'>('simulate')
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  // New draw creation
  const [newMonth, setNewMonth]       = useState('')
  const [newType, setNewType]         = useState<'random' | 'algorithmic'>('random')
  const [creating, setCreating]       = useState(false)

  const draw = draws.find(d => d.id === selectedDraw)

  const handleRun = async () => {
    if (!selectedDraw) { setError('Select a draw first.'); return }
    setRunning(true); setError(null); setResult(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/draw-engine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ draw_id: selectedDraw, mode }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Engine error')
      setResult(JSON.stringify(json, null, 2))
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const handleCreateDraw = async () => {
    if (!newMonth) { setError('Select a month.'); return }
    setCreating(true)
    const supabase = createClient()
    const { error: dbErr } = await supabase.from('draws').insert({
      draw_month: new Date(newMonth + '-01').toISOString().split('T')[0],
      draw_type: newType,
      status: 'draft',
    })
    setCreating(false)
    if (dbErr) { setError(dbErr.message); return }
    setNewMonth('')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Create new draw */}
      <div className="glass p-6">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Create New Draw</h3>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="label">Draw Month</label>
            <input
              type="month" value={newMonth}
              onChange={e => setNewMonth(e.target.value)}
              className="input [color-scheme:dark]"
            />
          </div>
          <div className="flex-1">
            <label className="label">Draw Type</label>
            <select
              value={newType} onChange={e => setNewType(e.target.value as any)}
              className="input"
            >
              <option value="random">Random</option>
              <option value="algorithmic">Algorithmic</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleCreateDraw} disabled={creating} className="btn-primary disabled:opacity-60">
              {creating ? 'Creating…' : 'Create draw'}
            </button>
          </div>
        </div>
      </div>

      {/* Run engine */}
      <div className="glass p-6">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Run Draw Engine</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Select Draw</label>
            <select value={selectedDraw} onChange={e => setSelectedDraw(e.target.value)} className="input">
              {draws.map(d => (
                <option key={d.id} value={d.id}>
                  {new Date(d.draw_month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} — {d.status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Mode</label>
            <div className="flex gap-2">
              {(['simulate', 'publish'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-semibold capitalize transition-all ${
                    mode === m
                      ? m === 'publish'
                        ? 'bg-impact-600/30 border-impact-500/50 text-impact-400'
                        : 'bg-brand-600/30 border-brand-500/50 text-brand-400'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mode === 'publish' && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            ⚠️ Publishing is final. This sets the draw to 'published' and makes results public. Confirm you've simulated first.
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={running || !selectedDraw}
          className={`${mode === 'publish' ? 'btn-impact' : 'btn-primary'} disabled:opacity-60`}
        >
          {running ? (
            <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Running…</>
          ) : (
            `${mode === 'simulate' ? '▶ Simulate' : '🚀 Publish'} draw`
          )}
        </button>

        {/* Admin notes (appended history) */}
        {draw?.admin_notes && (
          <div className="mt-6">
            <p className="label mb-2">Simulation Log</p>
            <pre className="bg-slate-900 rounded-xl p-4 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-48 border border-white/10">
              {draw.admin_notes}
            </pre>
          </div>
        )}

        {/* Engine result */}
        {result && (
          <div className="mt-4">
            <p className="label mb-2">Engine Response</p>
            <pre className="bg-impact-500/5 border border-impact-500/20 rounded-xl p-4 text-xs text-impact-300 overflow-x-auto max-h-48">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
