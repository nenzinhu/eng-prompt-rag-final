'use client'

import { useState } from 'react'
import { FlaskConical, TriangleAlert, History, Trash2, Copy, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import { useHistorico } from '@/lib/useHistorico'
import type { ProvidersResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import Markdown from '../Markdown'

const MAX_SYSTEM = 2000 // mesmo teto de api/index.py (MAX_CHARS_LAB_SYSTEM)
const MAX_USER = 4000 // mesmo teto de api/index.py (MAX_CHARS_LAB_USER)

const EXEMPLO_SYSTEM = 'Você é um assistente que responde só com fatos, sem inventar.'
const EXEMPLO_USER = 'Explique o que é few-shot prompting em até 3 frases, com um exemplo.'

/**
 * Laboratório de Prompts — o aluno escreve o próprio prompt e vê a resposta crua.
 *
 * Diferente de todas as outras abas (Perguntar, Professor, Aprender…), aqui não
 * há persona nem RAG: o texto do aluno vai direto ao modelo, do jeito que ele
 * escreveu. É o espaço para praticar o próprio ofício do curso — escrever
 * prompts — em vez de só consumir respostas já prontas.
 */
export default function LaboratorioTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [userPrompt, setUserPrompt] = useState('')

  const [executando, setExecutando] = useState(false)
  const [resposta, setResposta] = useState('')
  const [respostaModelo, setRespostaModelo] = useState('')
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)

  const { itens: historico, adicionar: adicionarHistorico, limpar: limparHistorico } = useHistorico('laboratorio')

  async function executar() {
    const alvo = userPrompt.trim()
    if (!alvo) return
    setExecutando(true)
    setErro('')
    setCopiado(false)
    try {
      const d = await api.laboratorio(systemPrompt.trim(), alvo, provider, modelo)
      setResposta(d.resposta)
      setRespostaModelo(d.modelo)
      adicionarHistorico(d.resposta, alvo)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao executar o prompt')
    } finally {
      setExecutando(false)
    }
  }

  function copiarResposta() {
    if (!resposta) return
    navigator.clipboard?.writeText(resposta).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    })
  }

  function preencherExemplo() {
    setSystemPrompt(EXEMPLO_SYSTEM)
    setUserPrompt(EXEMPLO_USER)
  }

  const restanteSystem = MAX_SYSTEM - systemPrompt.length
  const restanteUser = MAX_USER - userPrompt.length

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Laboratório de Prompts — escreva seu próprio prompt e veja a resposta crua do modelo, sem persona nem material do curso
      </p>

      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />

      {/* Passo 1 — prompt de sistema (opcional) */}
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[0.75rem] font-medium text-muted">1. Prompt de sistema (opcional) — define o papel do modelo</p>
        <button
          onClick={preencherExemplo}
          className="text-[0.72rem] text-muted underline-offset-2 hover:text-text hover:underline"
        >
          preencher exemplo
        </button>
      </div>
      <textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        placeholder="Ex: Você é um professor que só responde com base em fatos verificáveis…"
        maxLength={MAX_SYSTEM}
        className="glass min-h-[70px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <p className="mt-1 text-right font-mono text-[0.68rem] text-muted">{restanteSystem} restantes</p>

      {/* Passo 2 — prompt do usuário */}
      <p className="mb-1.5 text-[0.75rem] font-medium text-muted">2. Prompt do usuário — o que você quer pedir ao modelo</p>
      <textarea
        value={userPrompt}
        onChange={(e) => setUserPrompt(e.target.value)}
        placeholder="Escreva o prompt que você quer testar…"
        maxLength={MAX_USER}
        className="glass min-h-[120px] w-full rounded-xl p-4 text-[0.88rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <p className="mt-1 text-right font-mono text-[0.68rem] text-muted">{restanteUser} restantes</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void executar()}
          disabled={executando || !userPrompt.trim() || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {executando ? 'Executando…' : 'Executar prompt'}
        </button>
      </div>

      {erro && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-center text-[0.85rem] text-rose-300">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {erro}
        </div>
      )}

      {executando && (
        <div className="mt-6 flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
          <span className="text-[0.82rem]">Executando o prompt…</span>
        </div>
      )}

      {!executando && !resposta && !erro && (
        <div className="mt-6 flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
          <FlaskConical className="h-6 w-6 opacity-50" aria-hidden="true" />
          <span className="text-[0.82rem]">Escreva um prompt e veja exatamente o que o modelo responde</span>
        </div>
      )}

      {!executando && resposta && (
        <div className="glass grad-border mt-6 overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
            <span>resposta crua · {respostaModelo}</span>
            <button
              onClick={copiarResposta}
              className="flex items-center gap-1 text-muted transition-colors hover:text-text"
              aria-label="Copiar resposta"
            >
              {copiado ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copiado ? 'copiado' : 'copiar'}
            </button>
          </div>
          <div className="p-5">
            <Markdown>{resposta}</Markdown>
          </div>
        </div>
      )}

      {historico.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Meus prompts
            </div>
            <button
              onClick={limparHistorico}
              className="flex items-center gap-1 text-[0.72rem] text-muted transition-colors hover:text-rose-300"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Limpar histórico
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {historico.map((h) => (
              <button
                key={h.id}
                onClick={() => setResposta(h.resposta)}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-[0.78rem] text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
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
