interface Charity {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  upcoming_events: Array<{ title: string; date: string; location: string }> | null
}

export default function CharityCard({ charity }: { charity: Charity }) {
  const events = charity.upcoming_events ?? []
  const nextEvent = events[0]

  return (
    <div className="glass-hover p-6 flex flex-col gap-4 group">
      {/* Logo / initials */}
      <div className="flex items-start justify-between">
        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200
                        flex items-center justify-center overflow-hidden flex-shrink-0">
          {charity.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={charity.logo_url} alt={charity.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-black text-slate-400">
              {charity.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        {events.length > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-impact-500/15 text-impact-400
                           border border-impact-500/30 font-medium">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Name + description */}
      <div>
        <h3 className="font-bold text-slate-900 text-lg group-hover:text-brand-600 transition-colors">
          {charity.name}
        </h3>
        {charity.description && (
          <p className="text-slate-600 text-sm mt-1 line-clamp-3 leading-relaxed">
            {charity.description}
          </p>
        )}
      </div>

      {/* Next event */}
      {nextEvent && (
        <div className="mt-auto pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-1">Next event</p>
          <p className="text-sm text-slate-700 font-medium">{nextEvent.title}</p>
          <p className="text-xs text-slate-500">
            {new Date(nextEvent.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            {nextEvent.location && ` · ${nextEvent.location}`}
          </p>
        </div>
      )}
    </div>
  )
}
