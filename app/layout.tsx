import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navigation from '@/components/navigation'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s | Digital Heroes',
    default: 'Digital Heroes — Track. Win. Give.',
  },
  description:
    'Digital Heroes combines golf performance tracking with monthly prize draws and charitable giving. Every subscription funds the charities you care about most.',
  keywords: ['golf', 'charity', 'fundraising', 'prize draw', 'Stableford'],
  openGraph: {
    type: 'website',
    title: 'Digital Heroes — Track. Win. Give.',
    description: 'Golf performance tracking meets charitable impact. Subscribe, enter monthly draws, and fund the causes you love.',
    siteName: 'Digital Heroes',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#020617] text-white antialiased">
        <Navigation />
        <main>{children}</main>
        <footer className="border-t border-white/10 mt-24 py-12">
          <div className="section">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                {/* Logo mark */}
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600
                                flex items-center justify-center text-white font-black text-sm">
                  DH
                </div>
                <span className="font-bold text-white">Digital Heroes</span>
              </div>
              <nav className="flex gap-6 text-sm text-slate-400">
                <a href="/" className="hover:text-white transition-colors">Home</a>
                <a href="/donate" className="hover:text-white transition-colors">Donate</a>
                <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
              </nav>
              <p className="text-xs text-slate-600">
                © {new Date().getFullYear()} Digital Heroes. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
