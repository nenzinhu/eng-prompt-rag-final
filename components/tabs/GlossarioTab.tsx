'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { ProvidersResp, TermoGlossario } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import AnexoImagem from '../AnexoImagem'
import Exemplos from '../Exemplos'

/**
 * Exemplos de um termo, aceitando o formato antigo.
 *
 * Termos gravados antes desta mudança têm um único `exemplo` (texto); os novos
 * vêm em `exemplos` (lista). Assim o glossário antigo continua renderizando.
 */
function exemplosDe(t: TermoGlossario): string[] {
  if (t.exemplos?.length) return t.exemplos
  return t.exemplo ? [t.exemplo] : []
}

export default function GlossarioTab({
  providers,
  seed,
}: {
  providers: ProvidersResp
  seed?: { texto: string; tick: number }
}) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [tema, setTema] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [termos, setTermos] = useState<TermoGlossario[] | null>(null)
  const [aviso, setAviso] = useState('')

  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [termosSalvos, setTermosSalvos] = useState<TermoGlossario[]>([])
  const [ocrLoading, setOcrLoading] = useState(false)
  const [anexoReset, setAnexoReset] = useState(0)

  async function buscarSalvos(q: string) {
    setBuscando(true)
    try {
      const d = await api.glossarioTermosSalvos(q)
      setTermosSalvos(d.termos)
    } catch {
      setTermosSalvos([])
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    buscarSalvos('')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => buscarSalvos(busca), 350)
    return () => clearTimeout(t)
  }, [busca])

  async function gerar(temaForcado?: string) {
    if (!pronto) return
    setLoading(true)
    setErro('')
    setAviso('')
    try {
      const d = await api.glossario(temaForcado ?? tema, provider, modelo)
      setTermos(d.termos)
      setAviso(d.aviso_salvamento ?? d.aviso_geracao ?? '')
      buscarSalvos(busca)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar glossário')
      setTermos(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!seed || !seed.texto.trim()) return
    setTema(seed.texto)
    gerar(seed.texto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.tick])

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Sumário de termos técnicos das apostilas, explicados de forma simples
      </p>

      <div className="glass mb-6 rounded-xl p-4">
        <div className="mb-2.5 font-mono text-[0.68rem] uppercase tracking-wider text-cyan">
          🔎 Buscar termo já salvo
        </div>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Ex: byte, bit, few-shot..."
          className="glass w-full rounded-lg p-3 font-mono text-[0.82rem] text-text outline-none placeholder:text-muted focus:border-violet/40"
        />
        <div className="mt-3">
          {buscando && <div className="text-[0.78rem] text-muted">Buscando…</div>}
          {!buscando && termosSalvos.length === 0 && (
            <div className="text-[0.78rem] text-muted">
              {busca.trim() ? 'Nenhum termo salvo encontrado com esse filtro.' : 'Nenhum termo salvo ainda — gere um sumário abaixo.'}
            </div>
          )}
          {!buscando && termosSalvos.length > 0 && (
            <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto pr-1">
              {termosSalvos.map((t, i) => (
                <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="mb-0.5 font-mono text-[0.78rem] font-semibold text-cyan">{t.termo}</div>
                  <div className="text-[0.8rem] leading-relaxed text-muted">{t.explicacao}</div>
                  {exemplosDe(t).length > 0 && (
                    <ol className="mt-1.5 flex flex-col gap-1">
                      {exemplosDe(t).map((ex, j) => (
                        <li key={j} className="text-[0.75rem] italic leading-relaxed text-muted/80">
                          <span className="font-mono not-italic text-[0.65rem] text-violet">Ex {j + 1}: </span>
                          {ex}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mb-2.5 font-mono text-[0.68rem] uppercase tracking-wider text-violet">
        ✨ Gerar novo sumário
      </p>
      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />
      <textarea
        value={tema}
        onChange={(e) => setTema(e.target.value)}
        placeholder={
          'Opcional: foque num assunto (ex: few-shot prompting, RAG, embeddings...) ou cole uma questão completa — os termos técnicos dela entram no sumário'
        }
        className="glass min-h-[90px] w-full rounded-xl p-3.5 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <AnexoImagem
        texto={tema}
        setTexto={setTema}
        desabilitado={loading}
        onProcessando={setOcrLoading}
        aplicarFormatoAlternativas={false}
        resetToken={anexoReset}
        dica="Envie um print da questão — os termos técnicos dela entram no sumário"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => gerar()}
          disabled={loading || ocrLoading || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Gerando…' : 'Gerar sumário'}
        </button>
        {termos && termos.length > 0 && (
          <button
            onClick={() => {
              setTermos(null)
              setTema('')
              setErro('')
              setAnexoReset((t) => t + 1)
            }}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="mt-6">
        {aviso && (
          <div className="mb-4 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3.5 py-2.5 text-[0.8rem] text-amber-300">
            ⚠️ {aviso}
          </div>
        )}
        {loading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">Lendo o material e identificando termos técnicos…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            ⚠️ {erro}
          </div>
        )}
        {!loading && !erro && termos && termos.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-muted">
            <p className="text-[0.82rem]">Não encontrei termos técnicos claros nesse trecho do material.</p>
          </div>
        )}
        {!loading && !erro && termos && termos.length > 0 && (
          <div className="flex flex-col gap-2">
            {termos.map((t, i) => (
              <div key={i} className="glass rounded-xl p-4">
                <div className="mb-1 font-mono text-[0.8rem] font-semibold text-cyan">{t.termo}</div>
                <div className="text-[0.85rem] leading-relaxed text-text">{t.explicacao}</div>
                {exemplosDe(t).length > 0 && (
                  <div className="mt-3">
                    <Exemplos itens={exemplosDe(t)} rotulo={`Exemplos de “${t.termo}”`} destaque="cyan" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!loading && !erro && !termos && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <span className="text-2xl opacity-50">📖</span>
            <span className="text-[0.82rem]">O sumário de termos aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
