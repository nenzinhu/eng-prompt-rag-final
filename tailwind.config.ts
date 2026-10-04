import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0c1416',
        surface: '#142023',
        'surface-2': '#1b2a2e',
        border: 'rgba(255,255,255,0.08)',
        'border-2': 'rgba(255,255,255,0.14)',
        violet: '#b4c7e7',
        cyan: '#8bd5bf',
        lime: '#c9e8a2',
        hotpink: '#8bd5bf',
        text: '#f0f1e9',
        muted: '#a0b2b5',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'serif'],
        sans: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
