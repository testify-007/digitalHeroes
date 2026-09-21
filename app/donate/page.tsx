import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import DonateForm from '@/components/donate/donate-form'

export const metadata: Metadata = {
  title: 'Donate',
  description: 'Make a standalone one-off donation directly to your chosen charity through Digital Heroes.',
}

interface Props {
  searchParams: Promise<{ charity?: string }>
}

export default async function DonatePage({ searchParams }: Props) {
  const { charity: preselectedId } = await searchParams
  const supabase = await createClient()

  const { data: charities } = await supabase
    .from('charities')
    .select('id, name, description, logo_url')
    .eq('is_published', true)
    .order('name')

  return (
    <div className="min-h-screen pt-20 pb-16">
      <div className="fixed inset-0 bg-hero-mesh pointer-events-none" />

      <div className="section relative z-10 py-16">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                            bg-gradient-to-br from-impact-500 to-emerald-300
                            shadow-glow-emerald mb-6">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h1 className="text-4xl font-black gradient-text mb-3">Make a Donation</h1>
            <p className="text-slate-400 text-lg">
              No subscription needed. Give directly to the causes you care about.
            </p>
          </div>

          {/* Form card */}
          <div className="glass p-8 shadow-card">
            <DonateForm
              charities={charities ?? []}
              preselectedId={preselectedId ?? null}
            />
          </div>

          {/* Trust signals */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-8 text-xs text-slate-600">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-impact-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
              Secured by Stripe
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-impact-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm1 11H9v-2h2v2zm0-4H9V7h2v2z" />
              </svg>
              100% goes to the charity
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-impact-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
              </svg>
              Instant receipt
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
