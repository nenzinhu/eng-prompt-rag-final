'use client'

import { useState } from 'react'
import {
  Baby,
  GraduationCap,
  Wrench,
  Lightbulb,
  TriangleAlert,
  CircleCheck,
  CircleAlert,
  CircleX,
  HelpCircle,
  History,
  Trash2,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import { useHistorico } from '@/lib/useHistorico'
import type { AprenderAvaliarResp, AprenderExplicarResp, NivelAprender, ProvidersResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import AnexoImagem from '../AnexoImagem'
import Markdown from '../Markdown'
import EvidenceList from '../EvidenceList'
import TituloAba from '../TituloAba'

const NIVEIS: { id: NivelAprender; titulo: string; descricao: string; icone: LucideIcon }[] = [
  { id: 'simples', titulo: 'Simples', descricao: 'como para alguém de 10 anos, com analogia', icone: Baby },
  { id: 'estudante', titulo: 'Estudante', descricao: 'conceito, exemplo e erro comum', icone: GraduationCap },
  { id: 'tecnico', titulo: 'Técnico', descricao: 'termos corretos e detalhes', icone: Wrench },
]

interface Tentativa {
  explicacao: string
  avaliacao: AprenderAvaliarResp
}

function corDaNota(nota: number): string {
  if (nota >= 80) return 'aviso-ok text-texto'
  if (nota >= 50) return 'aviso-atencao text-texto'
  return 'aviso-erro text-texto'
}

function ListaAvaliacao({ titulo, itens, icone: Icone, cor }: { titulo: string; itens: string[]; icone: LucideIcon; cor: string }) {
  if (!itens.length) return null
  return (
    <div>
      <div className={`mb-1.5 flex items-center gap-1.5 text-[0.78rem] font-semibold ${cor}`}>
        <Icone className="h-4 w-4" aria-hidden="true" />
        {titulo}
      </div>
      <ul className="flex flex-col gap-1 pl-6 text-[0.84rem] leading-relaxed text-texto">
        {itens.map((item, i) => (
          <li key={i} className="list-disc">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Aprender — explicação em níveis + técnica Feynman.
 *
 * 1. O aluno escolhe o tema e o nível e recebe a explicação (com fontes).
 * 2. Reexplica com as próprias palavras.
 * 3. Recebe nota, acertos, lacunas e confusões, e pode tentar de novo.
 */
export default function AprenderTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [tema, setTema] = useState('')
  const [nivel, setNivel] = useState<NivelAprender>('simples')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrAluno, setOcrAluno] = useState(false)
  const [anexoReset, setAnexoReset] = useState(0)

  const [explicando, setExplicando] = useState(false)
  const [explicacao, setExplicacao] = useState<AprenderExplicarResp | null>(null)
  const [temaExplicado, setTemaExplicado] = useState('')

  const [minhaExplicacao, setMinhaExplicacao] = useState('')
  const [avaliando, setAvaliando] = useState(false)
  const [tentativas, setTentativas] = useState<Tentativa[]>([])
  const [erro, setErro] = useState('')

  const { itens: historico, adicionar: adicionarHistorico, limpar: limparHistorico } = useHistorico('aprender')

  /** `texto` é o tema a explicar: o digitado (botão Explicar) ou o já explicado (troca de nível). */
  async function explicar(nivelEscolhido: NivelAprender, texto: string) {
    const alvo = texto.trim()
    if (!alvo) return
    setNivel(nivelEscolhido)
    setExplicando(true)
    setErro('')
    try {
      const d = await api.aprenderExplicar(alvo, nivelEscolhido, provider, modelo)
      if (alvo !== temaExplicado) {
        setTentativas([])
        setMinhaExplicacao('')
      }
      setExplicacao(d)
      setTemaExplicado(alvo)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar a explicação')
    } finally {
      setExplicando(false)
    }
  }

  async function avaliar() {
    if (!explicacao || !minhaExplicacao.trim()) return
    setAvaliando(true)
    setErro('')
    try {
      const a = await api.aprenderAvaliar(temaExplicado, minhaExplicacao, explicacao.contexto, provider, modelo)
      setTentativas((t) => [...t, { explicacao: minhaExplicacao, avaliacao: a }])
      const nota = a.nota === null ? 'sem nota' : `nota ${a.nota}`
      adicionarHistorico(minhaExplicacao, `${temaExplicado} · ${nota}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao avaliar sua explicação')
    } finally {
      setAvaliando(false)
    }
  }

  function recomecar() {
    setTema('')
    setExplicacao(null)
    setTemaExplicado('')
    setMinhaExplicacao('')
    setTentativas([])
    setErro('')
    setAnexoReset((n) => n + 1)
  }

  const ultima = tentativas[tentativas.length - 1]
  const ocupado = explicando || avaliando || ocrLoading || ocrAluno

  return (
    <div>
      <TituloAba
        titulo="Aprender"
        descricao="Entenda no seu nível e prove que entendeu explicando com as suas palavras (técnica Feynman)."
      />

      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />

      {/* Passo 1 — tema e nível */}
      <p className="mb-1.5 text-[0.75rem] font-medium text-texto-suave">1. O que você quer aprender?</p>
      <textarea
        value={tema}
        onChange={(e) => setTema(e.target.value)}
        placeholder="Ex: few-shot prompting, chain-of-thought, o que é um embedding…"
        className="campo text-[0.92rem] min-h-[80px] w-full p-4 leading-relaxed"
      />
      <AnexoImagem
        texto={tema}
        setTexto={setTema}
        desabilitado={explicando}
        onProcessando={setOcrLoading}
        aplicarFormatoAlternativas={false}
        resetToken={anexoReset}
        dica="Print, PDF ou DOCX do conteúdo — o texto entra na caixa acima, com OCR"
      />

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Nível da explicação">
        {NIVEIS.map((n) => {
          const Icone = n.icone
          const ativo = n.id === nivel
          return (
            <button
              key={n.id}
              onClick={() => (explicacao ? void explicar(n.id, temaExplicado) : setNivel(n.id))}
              disabled={explicando}
              aria-pressed={ativo}
              className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                ativo ? 'border-destaque bg-cartao-hover' : 'border-borda bg-cartao hover:border-borda-forte hover:bg-cartao-hover'
              }`}
            >
              <div className="flex items-center gap-2 text-[0.85rem] font-semibold text-texto">
                <Icone className="h-4 w-4 shrink-0 text-texto" aria-hidden="true" />
                {n.titulo}
              </div>
              <div className="mt-0.5 text-[0.74rem] leading-snug text-texto-suave">{n.descricao}</div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void explicar(nivel, tema)}
          disabled={ocupado || !tema.trim() || !pronto}
          className="btn-primario"
        >
          {explicando ? 'Explicando…' : 'Explicar'}
        </button>
        <button
          onClick={recomecar}
          className="btn-secundario px-5 py-2.5 text-sm"
        >
          Recomeçar
        </button>
      </div>

      {erro && (
        <div className="aviso-erro text-texto mt-4 flex items-center justify-center gap-2 p-4 text-center text-[0.85rem]">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {erro}
        </div>
      )}

      {explicando && (
        <div className="mt-6 flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-texto-suave">
          <div className="carregando h-6 w-6" />
          <span className="text-[0.82rem]">Montando a explicação no nível escolhido…</span>
        </div>
      )}

      {!explicando && !explicacao && !erro && (
        <div className="mt-6 flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-texto-suave">
          <Lightbulb className="h-6 w-6 opacity-50" aria-hidden="true" />
          <span className="text-[0.82rem]">Escolha um tema e um nível para começar</span>
        </div>
      )}

      {!explicando && explicacao && (
        <>
          <div className="cartao mt-6 overflow-hidden">
            <div className="rotulo border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
              {temaExplicado.slice(0, 80)} · nível {NIVEIS.find((n) => n.id === explicacao.nivel)?.titulo}
            </div>
            <div className="p-5">
              {explicacao.pouco_embasado && (
                <p className="mb-3 flex items-center gap-1.5 text-[0.76rem] text-atencao">
                  <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  O material das apostilas cobre pouco este tema — confira as fontes.
                </p>
              )}
              <Markdown>{explicacao.resposta}</Markdown>
              <p className="mt-4 text-[0.74rem] text-texto-suave">
                Não ficou claro? Troque o nível nos botões acima e a explicação é refeita.
              </p>
            </div>
            <div className="border-t border-white/[0.06] p-4">
              <EvidenceList items={explicacao.contexto} />
            </div>
          </div>

          {/* Passo 2 — Feynman */}
          <div className="mt-6">
            <p className="mb-1.5 text-[0.75rem] font-medium text-texto-suave">
              2. Agora explique com suas palavras, como se fosse ensinar alguém
            </p>
            <textarea
              value={minhaExplicacao}
              onChange={(e) => setMinhaExplicacao(e.target.value)}
              placeholder="Sem copiar — escreva do seu jeito, simples. É assim que a gente descobre o que entendeu de verdade."
              className="campo text-[0.92rem] min-h-[120px] w-full p-4 leading-relaxed"
            />
            <AnexoImagem
              texto={minhaExplicacao}
              setTexto={setMinhaExplicacao}
              desabilitado={avaliando}
              onProcessando={setOcrAluno}
              aplicarFormatoAlternativas={false}
              resetToken={anexoReset}
              dica="Escreveu no caderno? Mande a foto — o texto entra na caixa acima"
            />
            <div className="mt-3">
              <button
                onClick={avaliar}
                disabled={ocupado || !minhaExplicacao.trim() || !pronto}
                className="rounded-lg bg-gradient-to-b from-destaque to-destaque-fim px-5 py-2.5 text-sm font-semibold text-topo transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {avaliando ? 'Avaliando…' : tentativas.length ? 'Avaliar de novo' : 'Avaliar meu entendimento'}
              </button>
            </div>
          </div>

          {/* Passo 3 — avaliação */}
          {ultima && !avaliando && (
            <div className="cartao mt-6 p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <p className="text-[0.75rem] font-medium text-texto-suave">3. Avaliação</p>
                {ultima.avaliacao.nota !== null && (
                  <span
                    className={`rounded-md border px-3 py-1 text-[0.9rem] font-semibold ${corDaNota(ultima.avaliacao.nota)}`}
                  >
                    {ultima.avaliacao.nota}/100
                  </span>
                )}
                {tentativas.length > 1 && (
                  <span className="text-[0.7rem] text-texto-suave" aria-label="Evolução das notas">
                    {tentativas.map((t) => (t.avaliacao.nota === null ? '–' : t.avaliacao.nota)).join(' → ')}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <ListaAvaliacao titulo="O que você acertou" itens={ultima.avaliacao.acertos} icone={CircleCheck} cor="text-ok" />
                <ListaAvaliacao titulo="O que faltou" itens={ultima.avaliacao.lacunas} icone={CircleAlert} cor="text-atencao" />
                <ListaAvaliacao titulo="O que está confuso" itens={ultima.avaliacao.confusoes} icone={CircleX} cor="text-erro" />
                {ultima.avaliacao.comentario && (
                  <div className="text-[0.86rem] leading-relaxed text-texto">
                    <Markdown>{ultima.avaliacao.comentario}</Markdown>
                  </div>
                )}
                {ultima.avaliacao.proxima_pergunta && (
                  <div className="rounded-lg border border-borda-forte bg-cartao-hover p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[0.78rem] font-semibold text-texto">
                      <HelpCircle className="h-4 w-4" aria-hidden="true" />
                      Pense nisto e tente de novo
                    </div>
                    <p className="text-[0.86rem] leading-relaxed text-texto">{ultima.avaliacao.proxima_pergunta}</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Sem copiar"]')?.focus()}
                className="mt-4 flex items-center gap-1.5 text-[0.76rem] text-texto-suave underline-offset-2 hover:text-texto hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reescrever minha explicação
              </button>
            </div>
          )}
        </>
      )}

      {historico.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="rotulo flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Minhas explicações
            </div>
            <button
              onClick={limparHistorico}
              className="flex items-center gap-1 text-[0.72rem] text-texto-suave transition-colors hover:text-erro"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Limpar
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {historico.map((h) => (
              <button
                key={h.id}
                onClick={() => setMinhaExplicacao(h.resposta)}
                className="border-borda bg-cartao hover:border-borda-forte hover:bg-cartao-hover rounded-lg border px-3 py-2 text-left text-[0.78rem] text-texto-suave transition-colors hover:text-texto"
              >
                {h.resumo}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
