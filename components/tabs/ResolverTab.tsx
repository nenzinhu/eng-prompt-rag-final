'use client'

import { useEffect, useState } from 'react'
import { Package, Target, TriangleAlert, CircleCheck, X, BookOpen, GraduationCap } from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { ProvidersResp, ResolverResp } from '@/lib/types'
import { lerAcuracia, registrarResultado, resetarAcuracia, type AcuraciaStats } from '@/lib/accuracy'
import ProviderSelect from '../ProviderSelect'
import EvidenceList from '../EvidenceList'
import WarnBanner from '../WarnBanner'
import Markdown from '../Markdown'
import AnexoImagem from '../AnexoImagem'
import Exemplos from '../Exemplos'
import { formatarAlternativas } from '@/lib/texto'

interface ResultadoLote {
  questao: string
  resp?: ResolverResp
  erro?: string
}

export default function ResolverTab({
  providers,
  onEnviarGlossario,
}: {
  providers: ProvidersResp
  onEnviarGlossario?: (texto: string) => void
}) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<ResolverResp | null>(null)
  const [avaliado, setAvaliado] = useState(false)
  const [verDetalhada, setVerDetalhada] = useState(false)
  const [acuracia, setAcuracia] = useState<AcuraciaStats>({ acertos: 0, total: 0 })

  const [ocrLoading, setOcrLoading] = useState(false)
  const [anexoReset, setAnexoReset] = useState(0)

  const [modoLote, setModoLote] = useState(false)
  const [textoLote, setTextoLote] = useState('')
  const [processandoLote, setProcessandoLote] = useState(false)
  const [progressoLote, setProgressoLote] = useState({ atual: 0, total: 0 })
  const [resultadosLote, setResultadosLote] = useState<ResultadoLote[]>([])

  useEffect(() => {
    setAcuracia(lerAcuracia())
  }, [])

  function marcarResultado(acertou: boolean) {
    setAcuracia(registrarResultado(acertou))
    setAvaliado(true)
  }

  function onColar(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const colado = e.clipboardData.getData('text')
    if (!colado) return
    e.preventDefault()
    const alvo = modoLote ? textoLote : texto
    const setAlvo = modoLote ? setTextoLote : setTexto
    const el = e.currentTarget
    const inicio = el.selectionStart ?? alvo.length
    const fim = el.selectionEnd ?? alvo.length
    const formatado = formatarAlternativas(colado)
    setAlvo(alvo.slice(0, inicio) + formatado + alvo.slice(fim))
  }

  async function analisar() {
    if (!texto.trim()) return
    setLoading(true)
    setErro('')
    setAvaliado(false)
    setVerDetalhada(false)
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

  async function analisarLote() {
    const blocos = textoLote
      .split(/\n\s*\n\s*\n|\n{3,}/)
      .map((b) => b.trim())
      .filter(Boolean)
    // Se não houver separação clara por linhas em branco duplas, tenta por padrão comum "QUESTÃO N"
    const questoes =
      blocos.length > 1 ? blocos : textoLote.split(/(?=^\s*QUEST[ÃA]O\s*\d+)/im).map((b) => b.trim()).filter(Boolean)

    if (questoes.length === 0) return
    setProcessandoLote(true)
    setResultadosLote([])
    setProgressoLote({ atual: 0, total: questoes.length })

    const resultados: ResultadoLote[] = []
    for (let i = 0; i < questoes.length; i++) {
      try {
        const resp = await api.resolver(questoes[i], provider, modelo)
        resultados.push({ questao: questoes[i], resp })
      } catch (e) {
        resultados.push({ questao: questoes[i], erro: e instanceof Error ? e.message : 'Erro na análise' })
      }
      setProgressoLote({ atual: i + 1, total: questoes.length })
      setResultadosLote([...resultados])
    }
    setProcessandoLote(false)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
          Análise de questões de múltipla escolha (IA + RAG)
        </p>
        <button
          onClick={() => {
            setModoLote((m) => !m)
            setErro('')
          }}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.72rem] font-medium transition-colors ${
            modoLote
              ? 'border-violet/30 bg-violet/10 text-violet'
              : 'border-white/10 bg-white/[0.03] text-muted hover:text-text'
          }`}
        >
          <Package className="h-3.5 w-3.5" aria-hidden="true" />
          {modoLote ? 'Modo lote (ativo)' : 'Ativar modo lote'}
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <div className="flex items-center gap-1.5 font-mono text-[0.72rem] text-muted">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          Acurácia da IA:{' '}
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
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />

      {!modoLote ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2.5 text-[0.8rem] leading-relaxed text-muted">
              <strong className="font-medium text-text">Cole a questão completa</strong> com todas as alternativas (A,
              B, C, D…), ou envie um print. A IA busca no material e escolhe a alternativa correta, explicando o
              raciocínio.
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
            <AnexoImagem
              texto={texto}
              setTexto={setTexto}
              desabilitado={loading}
              onProcessando={setOcrLoading}
              resetToken={anexoReset}
              dica="Envie um print ou foto da questão — o texto entra na caixa acima, aqui no navegador"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={analisar}
                disabled={loading || ocrLoading || !pronto}
                className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {loading ? 'Analisando…' : 'Analisar Questão'}
              </button>
              <button
                onClick={() => {
                  setTexto('')
                  setResultado(null)
                  setErro('')
                  setAnexoReset((t) => t + 1)
                }}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
              >
                Limpar
              </button>
            </div>
          </div>

          <div>
            {(loading || ocrLoading) && (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
                <span className="text-[0.82rem]">
                  {ocrLoading ? 'Reconhecendo texto na imagem…' : 'Buscando no material e raciocinando…'}
                </span>
              </div>
            )}
            {!loading && !ocrLoading && erro && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {erro}
              </div>
            )}
            {!loading && !ocrLoading && erro === '' && resultado && !resultado.resposta && (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-muted">
                <TriangleAlert className="mx-auto mb-2 h-6 w-6 opacity-70" aria-hidden="true" />
                <p className="mb-3 text-[0.82rem]">
                  A IA não conseguiu identificar a alternativa correta com confiança.
                </p>
                <div className="text-left">
                  <Markdown>{resultado.explicacao_rapida || resultado.explicacao}</Markdown>
                </div>
              </div>
            )}
            {!loading && !ocrLoading && !erro && resultado && resultado.resposta && (
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
                      <div className="mb-0.5 flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-wider text-cyan">
                        <CircleCheck className="h-3 w-3" aria-hidden="true" />
                        Resposta escolhida pela IA
                      </div>
                      <div className="text-[0.88rem] font-medium leading-snug text-text">
                        {resultado.conteudo_resposta}
                      </div>
                    </div>
                  </div>

                  {(resultado.por_que_correta || (resultado.exemplos?.length ?? 0) > 0) && (
                    <div className="mb-4 rounded-xl border border-violet/25 bg-violet/[0.06] p-4">
                      <div className="mb-2 flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-violet">
                        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                        Professor auxiliar — por que a {resultado.resposta} está correta
                      </div>
                      {resultado.por_que_correta ? (
                        <div className="mb-4">
                          <Markdown>{resultado.por_que_correta}</Markdown>
                        </div>
                      ) : null}
                      <Exemplos itens={resultado.exemplos} rotulo="Exemplos para fixar" />
                    </div>
                  )}

                  <div className="mb-2 flex gap-1.5 font-mono text-[0.68rem] uppercase tracking-wider">
                    <button
                      onClick={() => setVerDetalhada(false)}
                      className={`rounded-md px-2.5 py-1 transition-colors ${
                        !verDetalhada ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-text'
                      }`}
                    >
                      Resumida
                    </button>
                    {resultado.explicacao_detalhada && (
                      <button
                        onClick={() => setVerDetalhada(true)}
                        className={`rounded-md px-2.5 py-1 transition-colors ${
                          verDetalhada ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-text'
                        }`}
                      >
                        Detalhada
                      </button>
                    )}
                  </div>
                  <div className="mb-4">
                    <Markdown>
                      {verDetalhada
                        ? resultado.explicacao_detalhada || resultado.explicacao_rapida
                        : resultado.explicacao_rapida || resultado.explicacao}
                    </Markdown>
                  </div>

                  {Object.keys(resultado.alternativas_erradas || {}).length > 0 && (
                    <div className="mb-4">
                      <div className="mb-2 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
                        Por que as outras estão erradas
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {Object.entries(resultado.alternativas_erradas).map(([letra, motivo]) => (
                          <div
                            key={letra}
                            className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
                          >
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rose-400/15 font-mono text-[0.72rem] font-bold text-rose-300">
                              {letra}
                            </div>
                            <div className="text-[0.8rem] leading-relaxed text-muted">{motivo}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {onEnviarGlossario && (
                    <button
                      onClick={() => onEnviarGlossario(texto)}
                      className="mb-4 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[0.78rem] font-medium text-text transition-colors hover:bg-white/[0.06]"
                    >
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      Extrair termos técnicos desta questão
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
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-1.5 text-[0.78rem] font-medium text-emerald-300 transition-colors hover:bg-emerald-400/20"
                          >
                            <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Acertou
                          </button>
                          <button
                            onClick={() => marcarResultado(false)}
                            className="flex items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3.5 py-1.5 text-[0.78rem] font-medium text-rose-300 transition-colors hover:bg-rose-400/20"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            Errou
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[0.78rem] text-muted">
                        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Resultado registrado na acurácia acima.
                      </div>
                    )}
                  </div>

                  <EvidenceList items={resultado.contexto} />
                </div>
              </div>
            )}
            {!loading && !ocrLoading && !erro && !resultado && (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
                <Target className="h-6 w-6 opacity-50" aria-hidden="true" />
                <span className="text-[0.82rem]">A resposta aparecerá aqui após a análise</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-2.5 text-[0.8rem] leading-relaxed text-muted">
            Cole <strong className="font-medium text-text">várias questões</strong> separadas por linha em branco
            (ou &ldquo;QUESTÃO 1&rdquo;, &ldquo;QUESTÃO 2&rdquo;...), ou envie um print de cada uma. Todas são analisadas em sequência.
          </p>
          <textarea
            value={textoLote}
            onChange={(e) => setTextoLote(e.target.value)}
            onPaste={onColar}
            placeholder={
              'QUESTÃO 1\nEnunciado...\nA) ...\nB) ...\n\nQUESTÃO 2\nEnunciado...\nA) ...\nB) ...'
            }
            className="glass min-h-[260px] w-full rounded-xl p-4 font-mono text-[0.8rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
          />
          <AnexoImagem
            texto={textoLote}
            setTexto={setTextoLote}
            desabilitado={processandoLote}
            onProcessando={setOcrLoading}
            resetToken={anexoReset}
            dica="Um print por questão — o texto entra no campo, na ordem em que você anexar"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={analisarLote}
              disabled={processandoLote || ocrLoading || !pronto}
              className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {processandoLote
                ? `Analisando ${progressoLote.atual}/${progressoLote.total}…`
                : 'Analisar todas'}
            </button>
            <button
              onClick={() => {
                setTextoLote('')
                setResultadosLote([])
                setErro('')
                setAnexoReset((t) => t + 1)
              }}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
            >
              Limpar
            </button>
          </div>

          {erro && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-center text-[0.85rem] text-rose-300">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              {erro}
            </div>
          )}

          {resultadosLote.length > 0 && (
            <div className="mt-5 flex flex-col gap-3">
              {resultadosLote.map((r, i) => (
                <div key={i} className="glass rounded-xl p-4">
                  <div className="mb-2 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
                    Questão {i + 1}
                  </div>
                  {r.erro && (
                    <div className="flex items-center gap-1.5 text-[0.82rem] text-rose-300">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {r.erro}
                    </div>
                  )}
                  {r.resp && (
                    <div className="flex items-start gap-3">
                      {r.resp.resposta ? (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan font-mono text-sm font-bold text-[#08070c]">
                          {r.resp.resposta}
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 font-mono text-sm text-muted">
                          ?
                        </div>
                      )}
                      <div className="flex-1">
                        {r.resp.resposta && (
                          <div className="mb-1 text-[0.85rem] font-medium text-text">{r.resp.conteudo_resposta}</div>
                        )}
                        <div className="text-[0.8rem] leading-relaxed text-muted">
                          {r.resp.explicacao_rapida || r.resp.explicacao}
                        </div>
                        {r.resp.por_que_correta && (
                          <div className="mt-2 text-[0.8rem] leading-relaxed text-text">
                            <span className="inline-flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-wider text-violet">
                              <GraduationCap className="h-3 w-3" aria-hidden="true" />
                              Por que está correta:{' '}
                            </span>
                            {r.resp.por_que_correta}
                          </div>
                        )}
                        {(r.resp.exemplos?.length ?? 0) > 0 && (
                          <div className="mt-2">
                            <Exemplos itens={r.resp.exemplos} rotulo="Exemplos" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
