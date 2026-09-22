'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })

    if (error) { setError(error.message); setLoading(false); return }
    setSuccess(true)
  }

  if (success) return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="fixed inset-0 bg-hero-mesh pointer-events-none" />
      <div className="relative z-10 glass p-10 max-w-md w-full text-center shadow-card">
        <div className="w-16 h-16 rounded-full bg-impact-100 border border-impact-200
                        flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-impact-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">You&apos;re in!</h2>
        <p className="text-slate-600 mb-6">
          Check your email at <strong className="text-slate-900">{email}</strong> to confirm your account, then subscribe to unlock draws and score tracking.
        </p>
        <Link href="/login" className="btn-primary justify-center">Go to sign in</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="fixed inset-0 bg-hero-mesh pointer-events-none" />
      <div className="relative z-10 w-full max-w-md">
        <div className="glass p-8 shadow-card">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-impact-500
                            flex items-center justify-center text-white font-black mx-auto mb-4">
              DH
            </div>
            <h1 className="text-2xl font-black text-slate-900">Create your account</h1>
            <p className="text-slate-600 text-sm mt-1">Start your Digital Heroes journey</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-5">
            {error && (
              <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="label">Full name</label>
              <input
                id="fullName" type="text" required
                value={fullName} onChange={e => setFullName(e.target.value)}
                className="input" placeholder="Jordan Smith"
              />
            </div>

            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email" type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password" type="password" required autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="Min. 8 characters"
              />
            </div>

            <p className="text-xs text-slate-500">
              By signing up, you agree to our terms. Your subscription will fund your chosen charity on a monthly basis.
            </p>

            <button
              type="submit" disabled={loading}
              className="btn-primary w-full justify-center disabled:opacity-60"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already a member?{' '}
            <Link href="/login" className="text-brand-400 hover:text-brand-600 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
