'use client'

import { useEffect, useState } from 'react'
import { Scale, TriangleAlert, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { CompararAlvo, CompararResp, NivelConcordancia, ProvidersResp } from '@/lib/types'
import Markdown from '../Markdown'
import EvidenceList from '../EvidenceList'
import WarnBanner from '../WarnBanner'
import TituloAba from '../TituloAba'

const MAX_MODELOS = 4
const MIN_MODELOS = 2

const EXEMPLO =
  'O que é o Método NEOSA e quais são os seus pilares?'

interface Slot extends CompararAlvo {
  id: number
}

const CORES: Record<NivelConcordancia, { borda: string; texto: string; fundo: string; titulo: string }> = {
  alta: {
    borda: 'border-ok/30',
    texto: 'text-ok',
    fundo: 'bg-ok/10',
    titulo: 'Os modelos concordam',
  },
  media: {
    borda: 'border-atencao/30',
    texto: 'text-atencao',
    fundo: 'bg-atencao/10',
    titulo: 'Concordância parcial',
  },
  baixa: {
    borda: 'border-erro/30',
    texto: 'text-erro',
    fundo: 'bg-erro/10',
    titulo: 'Os modelos divergem',
  },
  indefinida: {
    borda: 'border-white/15',
    texto: 'text-texto-suave',
    fundo: 'bg-white/[0.04]',
    titulo: 'Não foi possível comparar',
  },
}

export default function CompararTab({ providers }: { providers: ProvidersResp }) {
  const chaves = Object.keys(providers)
  const [slots, setSlots] = useState<Slot[]>([])
  const [pergunta, setPergunta] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<CompararResp | null>(null)

  // Monta os slots iniciais com provedores distintos (a graça é comparar
  // modelos diferentes, não dois do mesmo provedor).
  useEffect(() => {
    if (!chaves.length) return
    setSlots((atual) => {
      if (atual.length) return atual
      return chaves.slice(0, 3).map((p, i) => ({
        id: i,
        provider: p,
        modelo: providers[p]?.models?.[0] ?? '',
      }))
    })
  }, [chaves.join(','), providers]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (s.length >= MAX_MODELOS) return s
      const usados = new Set(s.map((x) => x.provider))
      const livre = chaves.find((c) => !usados.has(c)) ?? chaves[0] ?? ''
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
    try {
      const d = await api.comparar(
        pergunta,
        slots.map((s) => ({ provider: s.provider, modelo: s.modelo })),
      )
      setResultado(d)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao comparar')
      setResultado(null)
    } finally {
      setLoading(false)
    }
  }

  const cores = resultado ? CORES[resultado.nivel_concordancia] : null

  return (
    <div>
      <TituloAba
        titulo="Comparar modelos"
        descricao="A mesma pergunta para vários modelos. Onde eles discordarem é onde vale estudar."
      />

      {/* Seletores de modelo */}
      <div className="mb-4 flex flex-col gap-2">
        {slots.map((slot, i) => (
          <div key={slot.id} className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-[0.68rem] text-texto-suave">
              Modelo {i + 1}
            </span>
            <select
              value={slot.provider}
              onChange={(e) => atualizar(slot.id, 'provider', e.target.value)}
              className="campo text-[0.92rem] px-3 py-2"
            >
              {Object.entries(providers).map(([k, v]) => (
                <option key={k} value={k} className="bg-cartao">
                  {v.label}
                </option>
              ))}
            </select>
            <select
              value={slot.modelo}
              onChange={(e) => atualizar(slot.id, 'modelo', e.target.value)}
              className="campo text-[0.92rem] min-w-0 flex-1 px-3 py-2"
            >
              {(providers[slot.provider]?.models ?? []).map((m) => (
                <option key={m} value={m} className="bg-cartao">
                  {m}
                </option>
              ))}
            </select>
            {slots.length > MIN_MODELOS && (
              <button
                onClick={() => remover(slot.id)}
                className="rounded-lg border border-white/10 px-2.5 py-2 text-texto-suave transition-colors hover:border-erro/30 hover:text-erro"
                title="Remover este modelo"
                aria-label="Remover este modelo"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {slots.length < MAX_MODELOS && (
          <button
            onClick={adicionar}
            className="self-start rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-[0.75rem] text-texto-suave transition-colors hover:border-borda-forte hover:text-texto"
          >
            + adicionar modelo
          </button>
        )}
      </div>

      <textarea
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        placeholder={`Ex: ${EXEMPLO}`}
        className="campo text-[0.92rem] min-h-[110px] w-full p-4 leading-relaxed"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={enviar}
          disabled={loading || slots.length < MIN_MODELOS}
          className="btn-primario"
        >
          {loading ? 'Consultando…' : `Comparar ${slots.length} modelos`}
        </button>
        <button
          onClick={() => {
            setPergunta('')
            setResultado(null)
            setErro('')
          }}
          className="btn-secundario px-5 py-2.5 text-sm"
        >
          Limpar
        </button>
        <button
          onClick={() => setPergunta(EXEMPLO)}
          className="btn-secundario px-5 py-2.5 text-sm"
        >
          Usar exemplo
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-texto-suave">
            <div className="carregando h-6 w-6" />
            <span className="text-[0.82rem]">
              Consultando os modelos em paralelo… (o tempo é o do mais lento)
            </span>
          </div>
        )}

        {!loading && erro && (
          <div className="aviso-erro text-texto flex items-center justify-center gap-2 p-6 text-center text-[0.85rem]">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}

        {!loading && !erro && resultado && cores && (
          <div className="flex flex-col gap-4">
            {/* Veredito */}
            <div className={`rounded-xl border ${cores.borda} ${cores.fundo} px-4 py-3.5`}>
              <div className={`font-semibold ${cores.texto}`}>
                {cores.titulo}
                <span className="ml-2 text-[0.7rem] font-normal opacity-80">
                  ({resultado.nivel_concordancia})
                </span>
              </div>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-texto-suave">
                {resultado.modelos_ok < 2
                  ? 'Menos de dois modelos responderam — não há o que comparar. Veja os erros abaixo.'
                  : resultado.divergencia_numerica
                    ? 'Os modelos citam números diferentes para a mesma pergunta — sinal concreto de conflito. Confira o material antes de confiar em qualquer um.'
                    : resultado.sem_fatos
                      ? 'Pergunta conceitual, sem números nem nomes para comparar automaticamente. Leia as conclusões abaixo lado a lado.'
                      : 'Os modelos citam os mesmos números e nomes. Mesmo assim, leia as conclusões: acordo entre modelos não é garantia de correção.'}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-texto-suave">
                <span>responderam: {resultado.modelos_ok}/{resultado.modelos_total}</span>
                <span>confiança no material: {Math.round(resultado.confianca_media * 100)}%</span>
                <span>semelhança das conclusões: {Math.round(resultado.similaridade_conclusoes * 100)}%</span>
              </div>
            </div>

            {/* Divergências concretas */}
            {(resultado.numeros_exclusivos.length > 0 || resultado.nomes_exclusivos.length > 0) && (
              <div className="cartao p-4">
                <div className="rotulo mb-2">
                  Citado por apenas um modelo
                </div>
                <div className="flex flex-wrap gap-2">
                  {resultado.numeros_exclusivos.map((f) => (
                    <span
                      key={`n-${f.fato}-${f.modelo}`}
                      className="aviso-atencao text-texto px-2.5 py-1 text-[0.72rem]"
                      title={f.modelo}
                    >
                      {f.fato}
                      <span className="ml-1.5 opacity-60">{f.modelo.split('/')[0]}</span>
                    </span>
                  ))}
                  {resultado.nomes_exclusivos.slice(0, 12).map((f) => (
                    <span
                      key={`p-${f.fato}-${f.modelo}`}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[0.72rem] text-texto-suave"
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
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {resultado.respostas.map((r) => (
                <div key={r.rotulo} className="cartao flex flex-col overflow-hidden">
                  <div className="border-b border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                    <div className="truncate text-[0.68rem] text-texto" title={r.rotulo}>
                      {r.modelo}
                    </div>
                    <div className="text-[0.62rem] text-texto-suave">
                      {r.provider} · {r.segundos}s
                    </div>
                  </div>
                  <div className="flex-1 p-3.5">
                    {r.erro ? (
                      <div className="flex items-start gap-1.5 text-[0.8rem] leading-relaxed text-erro">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {r.erro}
                      </div>
                    ) : (
                      <>
                        {r.resposta_direta && (
                          <div className="mb-3 rounded-lg border border-borda-forte bg-cartao-hover p-2.5">
                            <div className="rotulo mb-1 text-texto">
                              conclusão
                            </div>
                            <div className="text-[0.84rem] leading-snug text-texto">
                              {r.resposta_direta}
                            </div>
                          </div>
                        )}
                        <Markdown>{r.resposta}</Markdown>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {resultado.pouco_embasado && <WarnBanner confianca={resultado.confianca_media} />}

            <div className="cartao p-4">
              <EvidenceList items={resultado.contexto} />
            </div>
          </div>
        )}

        {!loading && !erro && !resultado && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-texto-suave">
            <Scale className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">As respostas dos modelos aparecerão aqui lado a lado</span>
          </div>
        )}
      </div>
    </div>
  )
}
