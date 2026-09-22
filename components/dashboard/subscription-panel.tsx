interface Subscription {
  status: string
  plan_type: string
  current_period_end: string
  stripe_sub_id: string
}

export default function SubscriptionPanel({ subscription }: { subscription: Subscription | null }) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="glass p-6">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">Subscription</h2>

      {subscription ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="badge-active">
              <span className="w-1.5 h-1.5 rounded-full bg-impact-400 animate-pulse" />
              Active
            </span>
            <span className="text-sm text-slate-600 capitalize">{subscription.plan_type} plan</span>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Renews</span>
              <span className="text-slate-900 font-medium">{fmt(subscription.current_period_end)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Status</span>
              <span className="text-impact-400 font-medium capitalize">{subscription.status}</span>
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Draw entries are added automatically each month.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="badge-inactive">Inactive</span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            You need an active subscription to log scores, enter draws, and support charities.
          </p>
          <a
            href="/api/subscribe"
            className="btn-primary w-full justify-center text-sm"
          >
            Subscribe now
          </a>
        </div>
      )}
    </div>
  )
}
