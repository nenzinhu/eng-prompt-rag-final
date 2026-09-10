'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import type { BuscarResultado } from '@/lib/types'

export default function BuscarTab() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultados, setResultados] = useState<BuscarResultado[] | null>(null)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setErro('')
    try {
      const d = await api.buscar(query, 6)
      setResultados(d.resultados)
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : 'Erro na busca')
      setResultados(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Busca semântica bruta no material do curso (sem geração de resposta)
      </p>
      <form onSubmit={buscar} className="mb-6 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cole um trecho, palavra-chave ou conceito…"
          className="glass flex-1 rounded-lg px-4 py-2.5 text-[0.9rem] text-text outline-none placeholder:text-muted focus:border-violet/40"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {loading && (
        <div className="flex min-h-[160px] items-center justify-center text-muted">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
        </div>
      )}
      {!loading && erro && (
        <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
          ⚠️ {erro}
        </div>
      )}
      {!loading && !erro && resultados && resultados.length === 0 && (
        <div className="py-12 text-center text-muted">
          <div className="mb-2 text-2xl">🛑</div>
          Nenhum resultado encontrado
        </div>
      )}
      {!loading && !erro && resultados && resultados.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {resultados.map((r, i) => (
            <div key={i} className="glass rounded-xl p-4 transition-colors hover:border-white/20">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate rounded bg-cyan/10 px-2 py-0.5 font-mono text-[0.7rem] text-cyan">
                  📄 {r.fonte}
                  {r.pagina ? ` · pág. ${r.pagina}` : ''}
                </span>
                <div className="flex shrink-0 items-center gap-1.5 font-mono text-[0.68rem] text-muted">
                  <div className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet to-cyan"
                      style={{ width: `${Math.round(r.relevancia * 100)}%` }}
                    />
                  </div>
                  {Math.round(r.relevancia * 100)}%
                </div>
              </div>
              <div className="whitespace-pre-wrap text-[0.875rem] leading-relaxed text-text">
                <span className="mr-1 font-mono text-[0.68rem] text-muted">{i + 1}.</span>
                {r.conteudo}
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && !erro && !resultados && (
        <div className="py-12 text-center text-muted">
          <div className="mb-2 text-2xl">🔍</div>
          <div className="mb-1 font-medium text-text">Pronto para buscar</div>
          Digite qualquer conceito do curso — RAG, few-shot, embeddings, fine-tuning…
        </div>
      )}
    </div>
  )
}
