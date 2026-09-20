'use client'

import { useState } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { TrechoResp } from '@/lib/types'

/**
 * "Ver no contexto": abre a página indexada inteira de onde veio a citação.
 *
 * O trecho da evidência aparece cortado em 3 linhas, o que não basta para o
 * aluno conferir se a resposta tem mesmo apoio no material — que é a promessa
 * do app. A rota `/api/trecho` lê só o índice: não gasta cota de IA.
 */
export default function TrechoNoContexto({
  fonte,
  pagina,
}: {
  fonte: string
  pagina?: number | null
}) {
  const [aberto, setAberto] = useState(false)
  const [dados, setDados] = useState<TrechoResp | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function alternar() {
    if (aberto) {
      setAberto(false)
      return
    }
    setAberto(true)
    if (dados || carregando) return
    setCarregando(true)
    setErro('')
    try {
      setDados(await api.trecho(fonte, pagina))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a página.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={alternar}
        aria-expanded={aberto}
        className="flex items-center gap-1.5 font-mono text-[0.67rem] text-muted transition-colors hover:text-cyan"
      >
        {carregando ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <BookOpen className="h-3 w-3" aria-hidden="true" />
        )}
        {aberto ? 'ocultar a página' : 'ver no contexto'}
      </button>

      {aberto && (
        <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/20 p-3">
          {carregando && <div className="text-[0.78rem] text-muted">Abrindo a página…</div>}
          {erro && <div className="text-[0.78rem] text-amber-300">{erro}</div>}
          {dados?.paginas.map((p) => (
            <div key={p.pagina ?? 'unica'} className="mb-3 last:mb-0">
              <div
                className={`mb-1 font-mono text-[0.65rem] uppercase tracking-wider ${
                  p.pagina === pagina ? 'text-cyan' : 'text-muted/70'
                }`}
              >
                {p.pagina ? `pág. ${p.pagina}` : 'trecho'}
                {p.pagina === pagina ? ' · citada' : ' · vizinha'}
              </div>
              <p className="whitespace-pre-wrap text-[0.78rem] leading-relaxed text-muted">
                {p.texto}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
