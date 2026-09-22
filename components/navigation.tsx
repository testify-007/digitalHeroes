'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Track auth state changes
  useEffect(() => {
    const fetchRole = async (userId: string) => {
      const { data } = await supabase.from('profiles').select('user_role').eq('id', userId).single()
      setIsAdmin(data?.user_role === 'admin')
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) fetchRole(data.user.id)
    })
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchRole(session.user.id)
      } else {
        setIsAdmin(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Translucent on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const navLinks = [
    { href: '/',        label: 'Home' },
    { href: '/donate',  label: 'Donate' },
    { href: '/dashboard', label: 'Dashboard', auth: true },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin Panel', auth: true }] : []),
  ]

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <div className="section">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600
                            flex items-center justify-center text-white font-black text-sm
                            shadow-glow-indigo group-hover:scale-105 transition-transform duration-200">
              DH
            </div>
            <span className="font-bold text-slate-900 text-lg hidden sm:block">
              Digital <span className="gradient-text-brand">Heroes</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link => {
              if (link.auth && !user) return null
              const active = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    active
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>

          {/* Auth controls */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600 max-w-[160px] truncate">
                  {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="btn-secondary !px-4 !py-2 !text-sm"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <Link href="/login" className="btn-secondary !px-4 !py-2 !text-sm">
                  Sign in
                </Link>
                <Link href="/register" className="btn-primary !px-4 !py-2 !text-sm">
                  Get started
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-sm">
          <div className="section py-4 flex flex-col gap-2">
            {navLinks.map(link => {
              if (link.auth && !user) return null
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="px-4 py-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                >
                  {link.label}
                </Link>
              )
            })}
            <div className="flex gap-3 pt-2 border-t border-slate-200 mt-2">
              {user ? (
                <button onClick={handleSignOut} className="btn-secondary !text-sm flex-1">
                  Sign out
                </button>
              ) : (
                <>
                  <Link href="/login"    className="btn-secondary !text-sm flex-1" onClick={() => setMenuOpen(false)}>Sign in</Link>
                  <Link href="/register" className="btn-primary  !text-sm flex-1" onClick={() => setMenuOpen(false)}>Get started</Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
