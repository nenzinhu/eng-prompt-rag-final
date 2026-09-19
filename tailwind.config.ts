import type { Config } from 'tailwindcss'

// Paleta monocromática grafite (docs/superpowers/specs/2026-09-19-visual-grafite-design.md).
// O branco é o único destaque; cor só aparece em mensagens de estado.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        topo: '#0a0a0a',
        cartao: '#242424',
        'cartao-hover': '#2c2c2c',
        campo: '#161616',
        borda: '#333333',
        'borda-forte': '#474747',
        texto: '#f2f2f2',
        'texto-suave': '#a3a3a3',
        'texto-apagado': '#949494',
        destaque: '#ffffff',
        'destaque-fim': '#d6d6d6',
        erro: '#f87171',
        ok: '#22c55e',
        atencao: '#f59e0b',
      },
      fontFamily: {
        sans: ['var(--font-barlow)', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
