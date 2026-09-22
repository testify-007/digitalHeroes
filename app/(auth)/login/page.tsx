'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Metadata } from 'next'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }
    
    // Check role to redirect appropriately
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', authData.user.id)
      .single()

    if (profile?.user_role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/dashboard')
    }
    
    router.refresh()
  }

  const handleMagicLink = async () => {
    if (!email) { setError('Enter your email first.'); return }
    setMagicLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })
    if (error) { setError(error.message); setMagicLoading(false); return }
    setMagicSent(true)
    setMagicLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      {/* Background orb */}
      <div className="fixed inset-0 bg-hero-mesh pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Card */}
        <div className="glass p-8 shadow-card">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-impact-500
                            flex items-center justify-center text-white font-black mx-auto mb-4">
              DH
            </div>
            <h1 className="text-2xl font-black text-slate-900">Welcome back</h1>
            <p className="text-slate-600 text-sm mt-1">Sign in to your Digital Heroes account</p>
          </div>

          {magicSent ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-impact-500/20 border border-impact-500/30
                              flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-impact-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="font-bold text-slate-900 text-lg mb-2">Check your inbox</h2>
              <p className="text-slate-600 text-sm">We sent a magic link to <strong className="text-slate-900">{email}</strong>. Click it to sign in.</p>
            </div>
          ) : (
            <form onSubmit={handlePassword} className="space-y-5">
              {error && (
                <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                  {error}
                </div>
              )}

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
                  id="password" type="password" required autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="input" placeholder="••••••••"
                />
              </div>

              <button
                type="submit" disabled={loading}
                className="btn-primary w-full justify-center disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              <div className="relative flex items-center">
                <div className="flex-1 border-t border-slate-200" />
                <span className="px-3 text-xs text-slate-500">or</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>

              <button
                type="button" onClick={handleMagicLink} disabled={magicLoading}
                className="btn-secondary w-full justify-center disabled:opacity-60"
              >
                {magicLoading ? 'Sending…' : '✉️ Send magic link'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-slate-500 mt-6">
            No account?{' '}
            <Link href="/register" className="text-brand-400 hover:text-brand-600 font-medium transition-colors">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
