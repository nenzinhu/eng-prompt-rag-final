'use client'

import { useState } from 'react'
import { Search, TriangleAlert, CircleSlash, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequisicao } from '@/lib/useRequisicao'
import type { BuscarResultado } from '@/lib/types'
import TituloAba from '../TituloAba'

export default function BuscarTab() {
  const [query, setQuery] = useState('')
  const { dados: resultados, carregando: loading, erro, executar } = useRequisicao<BuscarResultado[] | null>(null)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    await executar(() => api.buscar(query, 6).then((d) => d.resultados), 'Erro na busca')
  }

  return (
    <div>
      <TituloAba
        titulo="Buscar"
        descricao="Busca direta no material do curso, sem gerar resposta."
      />
      <form onSubmit={buscar} className="mb-6 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cole um trecho, palavra-chave ou conceito…"
          className="campo text-[0.92rem] flex-1 px-4 py-2.5 text-[0.9rem]"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-primario"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {loading && (
        <div className="flex min-h-[160px] items-center justify-center text-texto-suave">
          <div className="carregando h-6 w-6" />
        </div>
      )}
      {!loading && erro && (
        <div className="aviso-erro text-texto flex items-center justify-center gap-2 p-6 text-center text-[0.85rem]">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {erro}
        </div>
      )}
      {!loading && !erro && resultados && resultados.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-texto-suave">
          <CircleSlash className="h-6 w-6 opacity-50" aria-hidden="true" />
          Nenhum resultado encontrado
        </div>
      )}
      {!loading && !erro && resultados && resultados.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {resultados.map((r, i) => (
            <div key={i} className="cartao p-4 transition-colors hover:border-white/20">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 truncate rounded bg-cartao-hover px-2 py-0.5 text-[0.7rem] text-texto">
                  <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {r.fonte}
                    {r.pagina ? ` · pág. ${r.pagina}` : ''}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1.5 text-[0.68rem] text-texto-suave">
                  <div className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="bg-destaque h-full rounded-full"
                      style={{ width: `${Math.round(r.relevancia * 100)}%` }}
                    />
                  </div>
                  {Math.round(r.relevancia * 100)}%
                </div>
              </div>
              <div className="whitespace-pre-wrap text-[0.875rem] leading-relaxed text-texto">
                <span className="mr-1 text-[0.68rem] text-texto-suave">{i + 1}.</span>
                {r.conteudo}
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && !erro && !resultados && (
        <div className="flex flex-col items-center py-12 text-center text-texto-suave">
          <Search className="mb-2 h-6 w-6 opacity-50" aria-hidden="true" />
          <div className="mb-1 font-medium text-texto">Pronto para buscar</div>
          Digite qualquer conceito do curso — RAG, few-shot, embeddings, fine-tuning…
        </div>
      )}
    </div>
  )
}
