import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase OAuth / magic-link callback.
 * Exchanges the `code` query param for a session, sets cookies, and redirects.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.exchangeCodeForSession(code)
    
    // Check role for redirect if they didn't specify a specific 'next' param
    if (authData?.user && !url.searchParams.has('next')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_role')
        .eq('id', authData.user.id)
        .single()
        
      if (profile?.user_role === 'admin') {
        return NextResponse.redirect(new URL('/admin', url.origin))
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
