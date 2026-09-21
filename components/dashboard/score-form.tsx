'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props { userId: string }

export default function ScoreForm({ userId }: Props) {
  const router = useRouter()
  const [score, setScore]       = useState('')
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0])
  const [course, setCourse]     = useState('')
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const num = parseInt(score)
    if (isNaN(num) || num < 1 || num > 45) {
      setError('Score must be between 1 and 45.')
      return
    }
    if (new Date(date) > new Date()) {
      setError('Score date cannot be in the future.')
      return
    }

    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { error: dbErr } = await supabase.from('golf_scores').insert({
      user_id: userId,
      score: num,
      score_date: date,
      course_name: course || null,
      notes: notes || null,
    })

    setLoading(false)
    if (dbErr) {
      if (dbErr.code === '23505') setError('You already have a score logged for that date.')
      else setError(dbErr.message)
      return
    }

    setSuccess(true)
    setScore(''); setCourse(''); setNotes('')
    setDate(new Date().toISOString().split('T')[0])
    router.refresh()
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-3 rounded-xl bg-impact-500/10 border border-impact-500/30 text-impact-400 text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Score logged successfully!
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="score" className="label">Stableford score</label>
          <input
            id="score" type="number" min={1} max={45} required
            value={score} onChange={e => setScore(e.target.value)}
            className="input" placeholder="e.g. 36"
          />
          <p className="text-xs text-slate-600 mt-1">Range: 1 – 45 points</p>
        </div>
        <div>
          <label htmlFor="score-date" className="label">Date played</label>
          <input
            id="score-date" type="date" required
            value={date} max={new Date().toISOString().split('T')[0]}
            onChange={e => setDate(e.target.value)}
            className="input [color-scheme:dark]"
          />
        </div>
      </div>

      <div>
        <label htmlFor="course" className="label">Course <span className="text-slate-600">(optional)</span></label>
        <input
          id="course" type="text"
          value={course} onChange={e => setCourse(e.target.value)}
          className="input" placeholder="e.g. Wentworth East"
        />
      </div>

      <div>
        <label htmlFor="notes" className="label">Notes <span className="text-slate-600">(optional)</span></label>
        <input
          id="notes" type="text"
          value={notes} onChange={e => setNotes(e.target.value)}
          className="input" placeholder="Weather, conditions, etc."
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
        {loading ? 'Saving…' : 'Log score'}
      </button>
    </form>
  )
}
