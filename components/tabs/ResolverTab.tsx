'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ProvidersResp, ResolverResp } from '@/lib/types'
import { lerAcuracia, registrarResultado, resetarAcuracia, type AcuraciaStats } from '@/lib/accuracy'
import ProviderSelect from '../ProviderSelect'
import EvidenceList from '../EvidenceList'
import WarnBanner from '../WarnBanner'
import Markdown from '../Markdown'

export default function ResolverTab({
  providers,
  onEnviarGlossario,
}: {
  providers: ProvidersResp
  onEnviarGlossario?: (texto: string) => void
}) {
  const firstProvider = Object.keys(providers)[0] ?? ''
  const [provider, setProvider] = useState(firstProvider)
  const [modelo, setModelo] = useState(providers[firstProvider]?.models?.[0] ?? '')
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<ResolverResp | null>(null)
  const [avaliado, setAvaliado] = useState(false)
  const [acuracia, setAcuracia] = useState<AcuraciaStats>({ acertos: 0, total: 0 })

  useEffect(() => {
    setAcuracia(lerAcuracia())
  }, [])

  function marcarResultado(acertou: boolean) {
    setAcuracia(registrarResultado(acertou))
    setAvaliado(true)
  }

  function formatarAlternativas(texto: string): string {
    return texto
      .replace(/\s*\b([A-E])\)\s*/g, (_match, letra: string, offset: number) => {
        const prefixo = offset === 0 ? '' : '\n\n'
        return `${prefixo}${letra}) `
      })
      .trim()
  }

  function onColar(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const colado = e.clipboardData.getData('text')
    if (!colado) return
    e.preventDefault()
    const el = e.currentTarget
    const inicio = el.selectionStart ?? texto.length
    const fim = el.selectionEnd ?? texto.length
    const formatado = formatarAlternativas(colado)
    const novoTexto = texto.slice(0, inicio) + formatado + texto.slice(fim)
    setTexto(novoTexto)
  }

  async function analisar() {
    if (!texto.trim()) return
    setLoading(true)
    setErro('')
    setAvaliado(false)
    try {
      const d = await api.resolver(texto, provider, modelo)
      setResultado(d)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na análise')
      setResultado(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Análise de questões de múltipla escolha (IA + RAG)
      </p>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <div className="font-mono text-[0.72rem] text-muted">
          🎯 Acurácia da IA:{' '}
          <span className="font-semibold text-text">
            {acuracia.total > 0 ? `${Math.round((acuracia.acertos / acuracia.total) * 100)}%` : '—'}
          </span>{' '}
          <span className="text-muted">
            ({acuracia.acertos}/{acuracia.total} questões)
          </span>
        </div>
        {acuracia.total > 0 && (
          <button
            onClick={() => setAcuracia(resetarAcuracia())}
            className="font-mono text-[0.68rem] text-muted underline-offset-2 hover:text-text hover:underline"
          >
            zerar
          </button>
        )}
      </div>
      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={setProvider}
        onModeloChange={setModelo}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2.5 text-[0.8rem] leading-relaxed text-muted">
            <strong className="font-medium text-text">Cole a questão completa</strong> com todas as alternativas (A,
            B, C, D…). A IA busca no material e escolhe a alternativa correta, explicando o raciocínio.
          </p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={onColar}
            placeholder={
              'Qual é a principal vantagem do few-shot prompting?\n\nA) Reduz drasticamente o número de tokens\nB) Melhora a consistência sem necessidade de fine-tuning\nC) Aumenta a velocidade de inferência do modelo\nD) Elimina alucinações por completo'
            }
            className="glass min-h-[240px] w-full rounded-xl p-4 font-mono text-[0.8rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={analisar}
              disabled={loading}
              className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {loading ? 'Analisando…' : 'Analisar Questão'}
            </button>
            <button
              onClick={() => {
                setTexto('')
                setResultado(null)
                setErro('')
              }}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
            >
              Limpar
            </button>
          </div>
        </div>

        <div>
          {loading && (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
              <span className="text-[0.82rem]">Buscando no material e raciocinando…</span>
            </div>
          )}
          {!loading && erro && (
            <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
              ⚠️ {erro}
            </div>
          )}
          {!loading && !erro && resultado && !resultado.resposta && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-muted">
              <div className="mb-2 text-2xl">⚠️</div>
              <p className="mb-3 text-[0.82rem]">
                A IA não conseguiu identificar a alternativa correta com confiança.
              </p>
              <div className="text-left">
                <Markdown>{resultado.explicacao}</Markdown>
              </div>
            </div>
          )}
          {!loading && !erro && resultado && resultado.resposta && (
            <div className="glass grad-border overflow-hidden rounded-xl">
              <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
                Resultado — {resultado.provider} / {resultado.modelo}
              </div>
              <div className="p-5">
                {resultado.pouco_embasado && <WarnBanner confianca={resultado.confianca_media} />}
                <div className="mb-4 flex items-start gap-3.5 rounded-xl border border-cyan/25 bg-cyan/[0.06] p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan font-mono text-lg font-bold text-[#08070c]">
                    {resultado.resposta}
                  </div>
                  <div>
                    <div className="mb-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-cyan">
                      ✓ Resposta escolhida pela IA
                    </div>
                    <div className="text-[0.88rem] font-medium leading-snug text-text">
                      {resultado.conteudo_resposta}
                    </div>
                  </div>
                </div>
                <div className="mb-4">
                  <Markdown>{resultado.explicacao}</Markdown>
                </div>

                {onEnviarGlossario && (
                  <button
                    onClick={() => onEnviarGlossario(texto)}
                    className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[0.78rem] font-medium text-text transition-colors hover:bg-white/[0.06]"
                  >
                    📖 Extrair termos técnicos desta questão
                  </button>
                )}

                <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5">
                  {!avaliado ? (
                    <>
                      <div className="mb-2 text-[0.78rem] text-muted">
                        A IA acertou? (compare com o gabarito da questão)
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => marcarResultado(true)}
                          className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-1.5 text-[0.78rem] font-medium text-emerald-300 transition-colors hover:bg-emerald-400/20"
                        >
                          ✅ Acertou
                        </button>
                        <button
                          onClick={() => marcarResultado(false)}
                          className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3.5 py-1.5 text-[0.78rem] font-medium text-rose-300 transition-colors hover:bg-rose-400/20"
                        >
                          ❌ Errou
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-[0.78rem] text-muted">✓ Resultado registrado na acurácia acima.</div>
                  )}
                </div>

                <EvidenceList items={resultado.contexto} />
              </div>
            </div>
          )}
          {!loading && !erro && !resultado && (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
              <span className="text-2xl opacity-50">🎯</span>
              <span className="text-[0.82rem]">A resposta aparecerá aqui após a análise</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
