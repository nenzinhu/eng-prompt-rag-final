'use client'

import { useEffect, useState } from 'react'
import { Scale, TriangleAlert, X } from 'lucide-react'
import { api } from '@/lib/api'
import { estimarAcerto } from '@/lib/acerto'
import { lerAcuracia, registrarResultado, type AcuraciaStats } from '@/lib/accuracy'
import type { CompararAlvo, CompararResp, NivelConcordancia, ProvidersResp } from '@/lib/types'
import Markdown from '../Markdown'
import EvidenceList from '../EvidenceList'
import WarnBanner from '../WarnBanner'

const MAX_MODELOS = 4
const MIN_MODELOS = 2

const EXEMPLO =
  'O que é o Método NEOSA e quais são os seus pilares?'

interface Slot extends CompararAlvo {
  id: number
}

const CORES: Record<NivelConcordancia, { borda: string; texto: string; fundo: string; titulo: string }> = {
  alta: {
    borda: 'border-emerald-400/30',
    texto: 'text-emerald-300',
    fundo: 'bg-emerald-400/10',
    titulo: 'Os modelos concordam',
  },
  media: {
    borda: 'border-amber-300/30',
    texto: 'text-amber-300',
    fundo: 'bg-amber-300/10',
    titulo: 'Concordância parcial',
  },
  baixa: {
    borda: 'border-rose-400/30',
    texto: 'text-rose-300',
    fundo: 'bg-rose-400/10',
    titulo: 'Os modelos divergem',
  },
  indefinida: {
    borda: 'border-white/15',
    texto: 'text-muted',
    fundo: 'bg-white/[0.04]',
    titulo: 'Não foi possível comparar',
  },
}

const CORES_ACERTO = {
  alta: 'text-emerald-300 bg-emerald-400',
  media: 'text-amber-300 bg-amber-300',
  baixa: 'text-rose-300 bg-rose-400',
} as const

export default function CompararTab({
  providers,
  duplo = false,
}: {
  providers: ProvidersResp
  /** Modo "Duas IAs" do Estudar: exatamente dois modelos lado a lado e estimativa de acerto. */
  duplo?: boolean
}) {
  const maxModelos = duplo ? 2 : MAX_MODELOS
  const chaves = Object.keys(providers)
  // Só provedores com chave de API configurada podem ir num slot: escolher um
  // sem chave dava erro naquele card, sem o aluno ter feito nada.
  const configurados = chaves.filter((p) => providers[p]?.configurado)
  const [slots, setSlots] = useState<Slot[]>([])
  const [pergunta, setPergunta] = useState('')
  const [respostaAluno, setRespostaAluno] = useState('')
  const [avaliados, setAvaliados] = useState<Record<number, boolean>>({})
  const [estatisticas, setEstatisticas] = useState<Record<string, AcuraciaStats>>({})
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<CompararResp | null>(null)

  function chaveModelo(provider: string, modelo: string) {
    return `comparar_acuracia_v1:${JSON.stringify([provider, modelo])}`
  }

  function marcarResultado(i: number, acertou: boolean) {
    const r = resultado?.respostas[i]
    if (!r || r.erro || avaliados[i]) return
    const chave = chaveModelo(r.provider, r.modelo)
    const stats = registrarResultado(acertou, chave)
    setEstatisticas((s) => ({ ...s, [chave]: stats }))
    setAvaliados((s) => ({ ...s, [i]: true }))
  }

  // Monta os slots iniciais com provedores distintos (a graça é comparar
  // modelos diferentes, não dois do mesmo provedor).
  useEffect(() => {
    if (!configurados.length) return
    setSlots((atual) => {
      if (atual.length) return atual
      const iniciais = configurados.slice(0, duplo ? 2 : 3).map((p, i) => ({
        id: i,
        provider: p,
        modelo: providers[p]?.models?.[0] ?? '',
      }))
      // Com um só provedor configurado, compara dois modelos dele.
      const unico = configurados[0]
      const segundo = providers[unico]?.models?.[1]
      if (iniciais.length === 1 && segundo) iniciais.push({ id: 1, provider: unico, modelo: segundo })
      return iniciais
    })
  }, [configurados.join(','), providers]) // eslint-disable-line react-hooks/exhaustive-deps

  function atualizar(id: number, campo: 'provider' | 'modelo', valor: string) {
    setSlots((s) =>
      s.map((slot) => {
        if (slot.id !== id) return slot
        if (campo === 'provider') {
          return { ...slot, provider: valor, modelo: providers[valor]?.models?.[0] ?? '' }
        }
        return { ...slot, modelo: valor }
      }),
    )
  }

  function adicionar() {
    setSlots((s) => {
      if (s.length >= maxModelos) return s
      const usados = new Set(s.map((x) => x.provider))
      const livre = configurados.find((c) => !usados.has(c)) ?? configurados[0] ?? ''
      const proximoId = Math.max(0, ...s.map((x) => x.id)) + 1
      return [...s, { id: proximoId, provider: livre, modelo: providers[livre]?.models?.[0] ?? '' }]
    })
  }

  function remover(id: number) {
    setSlots((s) => (s.length <= MIN_MODELOS ? s : s.filter((x) => x.id !== id)))
  }

  async function enviar() {
    if (!pergunta.trim() || slots.length < MIN_MODELOS) return
    setLoading(true)
    setErro('')
    setAvaliados({})
    try {
      const d = await api.comparar(
        pergunta,
        slots.map((s) => ({ provider: s.provider, modelo: s.modelo })),
        respostaAluno,
      )
      setResultado(d)
      setEstatisticas(Object.fromEntries(d.respostas.map((r) => {
        const chave = chaveModelo(r.provider, r.modelo)
        return [chave, lerAcuracia(chave)]
      })))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui comparar os modelos. Tente novamente.')
      setResultado(null)
    } finally {
      setLoading(false)
    }
  }

  const cores = resultado ? CORES[resultado.nivel_concordancia] : null
  const acerto = duplo && resultado ? estimarAcerto(resultado) : null

  return (
    <div>
      <div className="mb-6">
        <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-cyan">Perspectivas lado a lado</p>
        <h2 className="font-display text-[1.8rem] leading-tight text-text sm:text-[2.2rem]">{duplo ? 'Duas IAs. Uma questão.' : 'Compare antes de concluir.'}</h2>
      </div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        {duplo
          ? 'Duas IAs analisam sua questão e resposta — confira o resultado com o gabarito'
          : 'Mesma pergunta, vários modelos — onde eles discordarem é onde vale estudar'}
      </p>

      {/* Seletores de modelo */}
      <div className={`mb-5 grid gap-3 ${duplo ? 'sm:grid-cols-2' : ''}`}>
        {slots.map((slot, i) => (
          <div key={slot.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-surface/70 p-4">
            <span className="mb-1 w-full text-[0.75rem] font-semibold text-cyan">
              IA {i + 1}
            </span>
            <select
              value={slot.provider}
              aria-label={`Provedor da IA ${i + 1}`}
              onChange={(e) => atualizar(slot.id, 'provider', e.target.value)}
              className="glass min-h-11 w-full min-w-0 rounded-lg px-3 py-2 text-[0.8rem] text-text outline-none"
            >
              {Object.entries(providers).map(([k, v]) => (
                <option key={k} value={k} disabled={!v.configurado} className="bg-surface">
                  {v.label}
                </option>
              ))}
            </select>
            <select
              value={slot.modelo}
              aria-label={`Modelo da IA ${i + 1}`}
              onChange={(e) => atualizar(slot.id, 'modelo', e.target.value)}
              className="glass min-h-11 w-full min-w-0 rounded-lg px-3 py-2 text-[0.78rem] text-text outline-none"
            >
              {(providers[slot.provider]?.models ?? []).map((m) => (
                <option key={m} value={m} className="bg-surface">
                  {m}
                </option>
              ))}
            </select>
            {slots.length > MIN_MODELOS && (
              <button
                onClick={() => remover(slot.id)}
                className="rounded-lg border border-white/10 px-2.5 py-2 text-muted transition-colors hover:border-rose-400/30 hover:text-rose-300"
                title="Remover este modelo"
                aria-label="Remover este modelo"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {slots.length < maxModelos && (
          <button
            onClick={adicionar}
            disabled={!configurados.length}
            className="self-start rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-[0.75rem] text-muted transition-colors hover:border-violet/40 hover:text-text"
          >
            + adicionar modelo
          </button>
        )}
      </div>

      {!configurados.length && <p role="status" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-[0.85rem] leading-relaxed text-amber-200">Nenhuma IA está disponível no momento. O administrador precisa configurar os modelos para habilitar a comparação.</p>}

      <textarea
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        placeholder={`Ex: ${EXEMPLO}`}
        className="glass min-h-[110px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />

      <label className="mt-3 block text-[0.8rem] text-muted">
        Sua resposta para analisar (opcional)
        <textarea
          value={respostaAluno}
          onChange={(e) => setRespostaAluno(e.target.value)}
          maxLength={4000}
          placeholder="Ex.: marquei B porque…"
          className="glass mt-2 min-h-[90px] w-full rounded-xl p-3 text-text outline-none"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={enviar}
          disabled={loading || slots.length < MIN_MODELOS}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Consultando…' : 'Comparar'}
        </button>
        <button
          onClick={() => {
            setPergunta('')
            setRespostaAluno('')
            setAvaliados({})
            setResultado(null)
            setErro('')
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
        >
          Limpar
        </button>
        <button
          onClick={() => setPergunta(EXEMPLO)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
        >
          Usar exemplo
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">
              Consultando os modelos em paralelo… (o tempo é o do mais lento)
            </span>
          </div>
        )}

        {!loading && erro && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}

        {!loading && !erro && resultado && cores && (
          <div className="flex flex-col gap-4">
            <p className="text-[0.8rem] text-muted">
              {resultado.base_resposta === 'ia'
                ? resultado.motivo_sem_rag === 'busca_indisponivel'
                  ? 'Somente IA: a consulta à apostila está indisponível.'
                  : 'Somente IA: não foi encontrado material relevante na apostila.'
                : 'Apostila + IA: os modelos receberam os mesmos trechos.'}
            </p>
            {acerto && (
              <div className="glass rounded-xl px-4 py-3.5" role="status">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.85rem] font-semibold text-text">Indicador de concordância e apoio</span>
                  <span className={`font-mono text-2xl font-bold ${CORES_ACERTO[acerto.faixa].split(' ')[0]}`}>
                    {acerto.percentual}%
                  </span>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
                  role="meter"
                  aria-label="Indicador de concordância e apoio"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={acerto.percentual}
                >
                  <div
                    className={`h-full rounded-full ${CORES_ACERTO[acerto.faixa].split(' ')[1]}`}
                    style={{ width: `${acerto.percentual}%` }}
                  />
                </div>
                <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">
                  {acerto.motivo} Este indicador é uma heurística, não uma probabilidade de acerto nem acurácia medida.
                  Confira com o gabarito e registre o resultado de cada IA abaixo.
                </p>
              </div>
            )}

            {/* Veredito */}
            <div className={`rounded-xl border ${cores.borda} ${cores.fundo} px-4 py-3.5`}>
              <div className={`font-semibold ${cores.texto}`}>
                {cores.titulo}
                <span className="ml-2 font-mono text-[0.7rem] font-normal opacity-80">
                  ({resultado.nivel_concordancia})
                </span>
              </div>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted">
                {resultado.modelos_ok < 2
                  ? 'Menos de dois modelos responderam — não há o que comparar. Veja os erros abaixo.'
                  : resultado.divergencia_numerica
                    ? 'Os modelos citam números diferentes para a mesma pergunta — sinal concreto de conflito. Confira o material antes de confiar em qualquer um.'
                    : resultado.sem_fatos
                      ? 'Pergunta conceitual, sem números nem nomes para comparar automaticamente. Leia as conclusões abaixo lado a lado.'
                      : 'Os modelos citam os mesmos números e nomes. Mesmo assim, leia as conclusões: acordo entre modelos não é garantia de correção.'}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.68rem] text-muted">
                <span>responderam: {resultado.modelos_ok}/{resultado.modelos_total}</span>
                <span>{resultado.base_resposta === 'ia' ? 'sem apoio da apostila' : `similaridade da busca: ${Math.round(resultado.confianca_media * 100)}%`}</span>
                <span>semelhança das conclusões: {Math.round(resultado.similaridade_conclusoes * 100)}%</span>
              </div>
            </div>

            {/* Divergências concretas */}
            {(resultado.numeros_exclusivos.length > 0 || resultado.nomes_exclusivos.length > 0) && (
              <div className="glass rounded-xl p-4">
                <div className="mb-2 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
                  Citado por apenas um modelo
                </div>
                <div className="flex flex-wrap gap-2">
                  {resultado.numeros_exclusivos.map((f) => (
                    <span
                      key={`n-${f.fato}-${f.modelo}`}
                      className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 font-mono text-[0.72rem] text-amber-200"
                      title={f.modelo}
                    >
                      {f.fato}
                      <span className="ml-1.5 opacity-60">{f.modelo.split('/')[0]}</span>
                    </span>
                  ))}
                  {resultado.nomes_exclusivos.slice(0, 12).map((f) => (
                    <span
                      key={`p-${f.fato}-${f.modelo}`}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[0.72rem] text-muted"
                      title={f.modelo}
                    >
                      {f.fato}
                      <span className="ml-1.5 opacity-60">{f.modelo.split('/')[0]}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Respostas lado a lado */}
            <div className={`grid gap-4 md:grid-cols-2 ${duplo ? '' : 'xl:grid-cols-3'}`}>
              {resultado.respostas.map((r, i) => (
                <div key={`${i}-${r.rotulo}`} className="glass grad-border flex flex-col overflow-hidden rounded-xl">
                  <div className="border-b border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                    <div className="truncate font-mono text-[0.68rem] text-cyan" title={r.rotulo}>
                      {r.modelo}
                    </div>
                    <div className="font-mono text-[0.62rem] text-muted">
                      {r.provider} · {r.segundos}s
                      {acerto?.alternativas[i] && <> · marcou {acerto.alternativas[i]}</>}
                    </div>
                  </div>
                  <div className="flex-1 p-3.5">
                    {r.erro ? (
                      <div className="flex items-start gap-1.5 text-[0.8rem] leading-relaxed text-rose-300">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {r.erro}
                      </div>
                    ) : (
                      <>
                        {r.resposta_direta && (
                          <div className="mb-3 rounded-lg border border-violet/25 bg-violet/[0.08] p-2.5">
                            <div className="mb-1 font-mono text-[0.6rem] uppercase tracking-wider text-violet/80">
                              conclusão
                            </div>
                            <div className="text-[0.84rem] leading-snug text-text">
                              {r.resposta_direta}
                            </div>
                          </div>
                        )}
                        <Markdown>{r.resposta}</Markdown>
                        <div className="mt-4 border-t border-white/10 pt-3 text-[0.78rem] text-muted">
                          {(() => {
                            const stats = estatisticas[chaveModelo(r.provider, r.modelo)]
                            return <p>Acertos conferidos: {stats?.total
                              ? `${Math.round(stats.acertos / stats.total * 100)}% (${stats.acertos}/${stats.total})`
                              : 'sem avaliações'}</p>
                          })()}
                          {avaliados[i] ? <p className="mt-2">Resultado registrado.</p> : (
                            <div className="mt-2">
                              <p>Compare esta IA com o gabarito:</p>
                              <div className="mt-2 flex gap-2">
                                <button onClick={() => marcarResultado(i, true)} className="rounded-lg border border-emerald-400/25 px-3 py-1.5 text-emerald-300">Acertou</button>
                                <button onClick={() => marcarResultado(i, false)} className="rounded-lg border border-rose-400/25 px-3 py-1.5 text-rose-300">Errou</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {resultado.base_resposta !== 'ia' && resultado.pouco_embasado && <WarnBanner confianca={resultado.confianca_media} />}

            <div className="glass rounded-xl p-4">
              <EvidenceList items={resultado.contexto} />
            </div>
          </div>
        )}

        {!loading && !erro && !resultado && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <Scale className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">As respostas dos modelos aparecerão aqui lado a lado</span>
          </div>
        )}
      </div>
    </div>
  )
}
