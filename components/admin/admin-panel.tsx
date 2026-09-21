'use client'

import { useState } from 'react'
import AnalyticsPanel from './analytics-panel'
import DrawPanel from './draw-panel'
import CharityPanel from './charity-panel'
import WinnersPanel from './winners-panel'
import UsersPanel from './users-panel'

const TABS = [
  { id: 'analytics',  label: 'Analytics',  icon: '📊' },
  { id: 'draws',      label: 'Draws',      icon: '🎯' },
  { id: 'charities',  label: 'Charities',  icon: '❤️' },
  { id: 'winners',    label: 'Winners',    icon: '🏆' },
  { id: 'users',      label: 'Users',      icon: '👥' },
]

interface Props {
  analytics: { totalUsers: number; activeSubs: number; totalDonated: number }
  draws: any[]
  charities: any[]
  pendingWinners: any[]
  profiles: any[]
}

export default function AdminPanel({ analytics, draws, charities, pendingWinners, profiles }: Props) {
  const [active, setActive] = useState('analytics')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-2xl border border-white/10 mb-8 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex-1 min-w-max flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                        text-sm font-semibold transition-all duration-200 ${
              active === tab.id
                ? 'bg-brand-600 text-white shadow-glow-indigo'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.id === 'winners' && pendingWinners.filter(w => w.proof_status === 'submitted').length > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold">
                {pendingWinners.filter(w => w.proof_status === 'submitted').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Panel content */}
      {active === 'analytics' && <AnalyticsPanel analytics={analytics} draws={draws} />}
      {active === 'draws'     && <DrawPanel draws={draws} />}
      {active === 'charities' && <CharityPanel charities={charities} />}
      {active === 'winners'   && <WinnersPanel winners={pendingWinners} />}
      {active === 'users'     && <UsersPanel profiles={profiles} />}
    </div>
  )
}
