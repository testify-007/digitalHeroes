'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Charity { id: string; name: string; description: string | null; logo_url: string | null }

const PRESET_AMOUNTS = [5, 10, 25, 50, 100]

// ── Card number formatter ────────────────────────────────────────────────────
const fmtCard = (v: string) =>
  v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()

// ── Expiry formatter (MM/YY) ─────────────────────────────────────────────────
const fmtExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

// ── Detect card brand from first digit ───────────────────────────────────────
function CardIcon({ number }: { number: string }) {
  const n = number.replace(/\s/g, '')
  if (n.startsWith('4'))   return <span className="text-xs font-bold text-blue-400">VISA</span>
  if (n.startsWith('5'))   return <span className="text-xs font-bold text-red-400">MC</span>
  if (n.startsWith('3'))   return <span className="text-xs font-bold text-prize-400">AMEX</span>
  return (
    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  )
}

// ── Payment form stage ───────────────────────────────────────────────────────
function PaymentForm({
  charityId,
  charityName,
  amount,
  onBack,
}: {
  charityId: string
  charityName: string
  amount: number
  onBack: () => void
}) {
  const router = useRouter()

  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry]         = useState('')
  const [cvc, setCvc]               = useState('')
  const [name, setName]             = useState('')
  const [paying, setPaying]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()

    // Basic mock validation
    if (cardNumber.replace(/\s/g, '').length < 13) {
      setError('Please enter a valid card number.')
      return
    }
    if (expiry.length < 5) {
      setError('Please enter a valid expiry date.')
      return
    }
    if (cvc.length < 3) {
      setError('Please enter your CVC.')
      return
    }
    if (!name.trim()) {
      setError('Please enter the name on your card.')
      return
    }

    setPaying(true)
    setError(null)

    // Simulate a brief processing delay for realism
    await new Promise(r => setTimeout(r, 1400))

    try {
      const res = await fetch('/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charityId,
          amountMinor: Math.round(amount * 100),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Payment failed. Please try again.')
        setPaying(false)
        return
      }

      router.push('/donate/success')
    } catch {
      setError('Network error. Please check your connection.')
      setPaying(false)
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      {/* Amount summary */}
      <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest">Donating to</p>
          <p className="text-white font-semibold">{charityName}</p>
        </div>
        <p className="text-2xl font-black gradient-text-prize">£{amount.toFixed(2)}</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Card number */}
      <div>
        <label htmlFor="card-number" className="label">Card number</label>
        <div className="relative">
          <input
            id="card-number"
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 5678 9012 3456"
            value={cardNumber}
            onChange={e => setCardNumber(fmtCard(e.target.value))}
            className="input pr-12"
            required
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2">
            <CardIcon number={cardNumber} />
          </span>
        </div>
      </div>

      {/* Expiry + CVC row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="card-expiry" className="label">Expiry</label>
          <input
            id="card-expiry"
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={expiry}
            onChange={e => setExpiry(fmtExpiry(e.target.value))}
            className="input"
            required
          />
        </div>
        <div>
          <label htmlFor="card-cvc" className="label">CVC</label>
          <div className="relative">
            <input
              id="card-cvc"
              type="text"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              maxLength={4}
              value={cvc}
              onChange={e => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="input pr-10"
              required
            />
            <svg
              className="w-4 h-4 text-slate-600 absolute right-4 top-1/2 -translate-y-1/2"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Name on card */}
      <div>
        <label htmlFor="card-name" className="label">Name on card</label>
        <input
          id="card-name"
          type="text"
          autoComplete="cc-name"
          placeholder="Jordan Smith"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input"
          required
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onBack} disabled={paying} className="btn-secondary flex-1 justify-center">
          ← Back
        </button>
        <button
          type="submit"
          disabled={paying}
          className="btn-impact flex-1 justify-center disabled:opacity-70"
        >
          {paying ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Processing…
            </span>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Pay £{amount.toFixed(2)}
            </>
          )}
        </button>
      </div>

      {/* Trust badge */}
      <p className="text-xs text-center text-slate-600 flex items-center justify-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Payments are encrypted and processed securely.
      </p>
    </form>
  )
}

// ── Main export — charity + amount selection ─────────────────────────────────
interface Props { charities: Charity[]; preselectedId: string | null }

export default function DonateForm({ charities, preselectedId }: Props) {
  const [charityId, setCharityId] = useState(preselectedId ?? charities[0]?.id ?? '')
  const [amount, setAmount]       = useState(10)
  const [custom, setCustom]       = useState('')
  const [stage, setStage]         = useState<'select' | 'pay'>('select')
  const [error, setError]         = useState<string | null>(null)

  const finalAmount = custom ? parseFloat(custom) : amount
  const selectedCharity = charities.find(c => c.id === charityId)

  const handleContinue = () => {
    if (!charityId)                      { setError('Please select a charity.'); return }
    if (!finalAmount || finalAmount < 1) { setError('Minimum donation is £1.'); return }
    setError(null)
    setStage('pay')
  }

  if (stage === 'pay' && selectedCharity) {
    return (
      <PaymentForm
        charityId={charityId}
        charityName={selectedCharity.name}
        amount={finalAmount}
        onBack={() => setStage('select')}
      />
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Charity selector */}
      <div>
        <label className="label">Choose a charity</label>
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {charities.map(c => (
            <button
              key={c.id}
              onClick={() => setCharityId(c.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                charityId === c.id
                  ? 'bg-impact-500/15 border-impact-500/40 text-white'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                {c.logo_url
                  ? <img src={c.logo_url} alt={c.name} className="w-full h-full object-cover rounded-xl" />
                  : <span className="text-xs font-black text-white/60">{c.name.slice(0, 2).toUpperCase()}</span>
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{c.name}</p>
                {c.description && (
                  <p className="text-xs text-slate-500 truncate">{c.description}</p>
                )}
              </div>
              {charityId === c.id && (
                <svg className="w-5 h-5 text-impact-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Amount picker */}
      <div>
        <label className="label">Choose an amount</label>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {PRESET_AMOUNTS.map(a => (
            <button
              key={a}
              onClick={() => { setAmount(a); setCustom('') }}
              className={`py-3 rounded-xl border text-sm font-bold transition-all ${
                amount === a && !custom
                  ? 'bg-brand-600/30 border-brand-500/50 text-brand-400'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
              }`}
            >
              £{a}
            </button>
          ))}
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">£</span>
          <input
            type="number"
            min={1}
            step="0.01"
            value={custom}
            onChange={e => { setCustom(e.target.value); setAmount(0) }}
            placeholder="Custom amount"
            className="input pl-8"
          />
        </div>
      </div>

      <button
        onClick={handleContinue}
        disabled={!charityId}
        className="btn-impact w-full justify-center text-base disabled:opacity-60"
      >
        Continue → Pay £{(finalAmount || 0).toFixed(2)}
      </button>
    </div>
  )
}
