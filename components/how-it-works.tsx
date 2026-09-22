'use client'

const STEPS = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    color: 'from-brand-500 to-purple-500',
    glow: 'group-hover:shadow-glow-indigo',
    step: '01',
    title: 'Track Performance',
    desc: 'Log your Stableford scores (1–45) after each round. Your rolling five-score average builds your competitive profile.',
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
      </svg>
    ),
    color: 'from-prize-400 to-amber-600',
    glow: 'group-hover:shadow-glow-amber',
    step: '02',
    title: 'Enter Monthly Draws',
    desc: 'Active subscribers receive automatic entry into every monthly prize draw. No extra steps required.',
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    color: 'from-impact-500 to-emerald-300',
    glow: 'group-hover:shadow-glow-emerald',
    step: '03',
    title: 'Win Prize Pools',
    desc: 'Three match tiers — 5-match (40%), 4-match (35%), 3-match (25%). Unmatched jackpots roll over and grow.',
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    color: 'from-rose-400 to-pink-500',
    glow: 'group-hover:shadow-[0_0_40px_-10px_rgba(244,63,94,0.5)]',
    step: '04',
    title: 'Fund Real Change',
    desc: 'Choose your charity and set your contribution percentage (min 10%). Every subscription directly funds their mission.',
  },
]

export default function HowItWorks() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {STEPS.map((s, i) => (
        <div
          key={s.step}
          className="glass group p-6 flex flex-col gap-4 transition-all duration-300
                     hover:-translate-y-2 hover:border-slate-300 cursor-default"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          {/* Step number */}
          <p className="text-xs font-bold text-slate-400 tracking-widest">{s.step}</p>

          {/* Icon */}
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.color}
                           flex items-center justify-center text-white flex-shrink-0
                           transition-all duration-300 ${s.glow}`}>
            {s.icon}
          </div>

          {/* Text */}
          <div>
            <h3 className="font-bold text-slate-900 text-lg mb-2">{s.title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
