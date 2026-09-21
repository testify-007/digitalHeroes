interface Props { profiles: any[] }

export default function UsersPanel({ profiles }: Props) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="glass p-6">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
        Members ({profiles.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Subscription</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => {
              const sub = Array.isArray(p.subscription) ? p.subscription[0] : p.subscription
              return (
                <tr key={p.id}>
                  <td className="text-white font-medium">{p.full_name ?? '—'}</td>
                  <td className="text-slate-400">{p.email ?? '—'}</td>
                  <td>
                    {p.user_role === 'admin'
                      ? <span className="badge-lapsed">Admin</span>
                      : <span className="badge-inactive">Member</span>
                    }
                  </td>
                  <td>
                    {sub
                      ? <span className={sub.status === 'active' ? 'badge-active' : 'badge-lapsed'}>
                          {sub.status} · {sub.plan_type}
                        </span>
                      : <span className="badge-inactive">None</span>
                    }
                  </td>
                  <td className="text-slate-500">{fmt(p.created_at)}</td>
                </tr>
              )
            })}
            {profiles.length === 0 && (
              <tr><td colSpan={5} className="text-center text-slate-600 py-8">No users yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
