import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette — charity-first, no golf clichés
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#312e81',
        },
        prize: {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        impact: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
      },
      // Extend opacity scale to include non-standard values used in @apply
      opacity: {
        '3':  '0.03',
        '8':  '0.08',
        '15': '0.15',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'float':        'float 6s ease-in-out infinite',
        'shimmer':      'shimmer 2s linear infinite',
        'pulse-glow':   'pulse-glow 3s ease-in-out infinite',
        'fade-up':      'fade-up 0.6s ease-out forwards',
        'spin-slow':    'spin 8s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':       { transform: 'translateY(-12px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%':       { opacity: '1',   transform: 'scale(1.05)' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-mesh':
          'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.3) 0%, transparent 70%),' +
          'radial-gradient(ellipse 60% 50% at 80% 80%, rgba(16,185,129,0.12) 0%, transparent 70%)',
      },
      boxShadow: {
        'glow-indigo': '0 0 40px -10px rgba(99,102,241,0.6)',
        'glow-amber':  '0 0 40px -10px rgba(245,158,11,0.5)',
        'glow-emerald':'0 0 40px -10px rgba(16,185,129,0.4)',
        'card':        '0 4px 24px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [forms],
}
export default config
