/**
 * lib/supabase/client.ts
 *
 * Browser-side Supabase client for use inside Client Components ('use client').
 * Uses the @supabase/ssr createBrowserClient which manages the auth session
 * via cookies — keeping the browser and server auth state in sync automatically.
 *
 * ⚠️  Only the ANON key is used here. Never import the service-role key in
 *     any file that is bundled for the browser.
 *
 * Usage:
 *   'use client'
 *   import { createClient } from '@/lib/supabase/client'
 *   const supabase = createClient()
 */
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
