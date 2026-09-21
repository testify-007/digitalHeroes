import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Donation Successful' }

export default function DonateSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="fixed inset-0 bg-hero-mesh pointer-events-none" />
      <div className="relative z-10 glass p-12 max-w-lg w-full text-center shadow-card">
        {/* Animated heart */}
        <div className="w-20 h-20 rounded-full bg-impact-500/20 border border-impact-500/30
                        flex items-center justify-center mx-auto mb-6 animate-pulse-glow">
          <svg className="w-10 h-10 text-impact-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>

        <h1 className="text-3xl font-black gradient-text-impact mb-3">
          Thank you for giving!
        </h1>
        <p className="text-slate-400 mb-8 text-lg">
          Your donation has been processed. A receipt is on its way to your inbox.
          Together we&apos;re making a real difference.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/donate" className="btn-impact justify-center">
            Donate again
          </Link>
          <Link href="/" className="btn-secondary justify-center">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
