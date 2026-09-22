interface Score {
  id: string
  score: number
  score_date: string
  course_name: string | null
  notes: string | null
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 36 ? 'bg-impact-500/20 text-impact-400 border-impact-500/30' :
    score >= 28 ? 'bg-brand-500/20  text-brand-400  border-brand-500/30'  :
                  'bg-slate-100 text-slate-500 border-slate-200'
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-bold border ${color}`}>
      {score} pts
    </span>
  )
}

export default function ScoreList({ scores }: { scores: Score[] }) {
  if (!scores.length) return (
    <div className="text-center py-10 text-slate-600">
      <svg className="w-10 h-10 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-sm">No scores yet. Log your first round above!</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {scores.map((s, i) => (
        <div
          key={s.id}
          className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200
                     hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="text-center w-10">
              <p className="text-xs font-bold text-slate-600 uppercase">
                {new Date(s.score_date).toLocaleDateString('en-GB', { month: 'short' })}
              </p>
              <p className="text-xl font-black text-slate-900 leading-none">
                {new Date(s.score_date).getDate()}
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-900 text-sm">
                {s.course_name ?? 'Round logged'}
              </p>
              {s.notes && <p className="text-xs text-slate-600 mt-0.5">{s.notes}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ScoreBadge score={s.score} />
            {i === 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30">
                Latest
              </span>
            )}
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-600 text-right pt-1">Showing your last 5 scores</p>
    </div>
  )
}
