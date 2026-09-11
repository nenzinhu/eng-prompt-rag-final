'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { AuditarResp, ProvidersResp, PerguntarResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import EvidenceList from '../EvidenceList'
import WarnBanner from '../WarnBanner'
import Markdown from '../Markdown'
import RespostaAuditada from '../RespostaAuditada'
import AnexoImagem from '../AnexoImagem'

export default function PerguntarTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [pergunta, setPergunta] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<PerguntarResp | null>(null)

  // Auditoria de fidelidade (frase por frase).
  const [auditando, setAuditando] = useState(false)
  const [auditoria, setAuditoria] = useState<AuditarResp | null>(null)
  const [auditarAuto, setAuditarAuto] = useState(true)

  const [simplificando, setSimplificando] = useState(false)
  const [respostaSimples, setRespostaSimples] = useState('')

  const [verificando, setVerificando] = useState(false)
  const [perguntasVerificacao, setPerguntasVerificacao] = useState<string[]>([])
  const [respostasVerificacao, setRespostasVerificacao] = useState<Record<number, string>>({})
  const [carregandoVerificacaoIdx, setCarregandoVerificacaoIdx] = useState<number | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [anexoReset, setAnexoReset] = useState(0)

  async function enviar() {
    if (!pergunta.trim()) return
    setLoading(true)
    setErro('')
    setRespostaSimples('')
    setPerguntasVerificacao([])
    setRespostasVerificacao({})
    setAuditoria(null)
    try {
      const d = await api.perguntar(pergunta, provider, modelo)
      setResultado(d)
      // Dispara a auditoria frase por frase automaticamente, se ligada.
      if (auditarAuto && d.resposta) {
        void auditar(d.resposta)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar resposta')
      setResultado(null)
    } finally {
      setLoading(false)
    }
  }

  async function auditar(texto: string) {
    setAuditando(true)
    try {
      const a = await api.auditar(texto)
      setAuditoria(a)
    } catch {
      // Auditoria é um extra — se falhar, não quebra a resposta exibida.
      setAuditoria(null)
    } finally {
      setAuditando(false)
    }
  }

  async function explicarMaisSimples() {
    if (!resultado) return
    setSimplificando(true)
    try {
      const d = await api.simplificar(pergunta, resultado.resposta, resultado.contexto, provider, modelo)
      setRespostaSimples(d.resposta)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao simplificar resposta')
    } finally {
      setSimplificando(false)
    }
  }

  async function testarEntendimento() {
    if (!resultado) return
    setVerificando(true)
    try {
      const d = await api.verificar(pergunta, resultado.resposta, resultado.contexto, provider, modelo)
      setPerguntasVerificacao(d.perguntas)
      setRespostasVerificacao({})
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar perguntas de verificação')
    } finally {
      setVerificando(false)
    }
  }

  async function responderVerificacao(idx: number, perguntaVerificacao: string) {
    if (respostasVerificacao[idx] || carregandoVerificacaoIdx !== null) return
    setCarregandoVerificacaoIdx(idx)
    try {
      const d = await api.perguntar(perguntaVerificacao, provider, modelo)
      setRespostasVerificacao((r) => ({ ...r, [idx]: d.resposta }))
    } catch (e) {
      setRespostasVerificacao((r) => ({
        ...r,
        [idx]: e instanceof Error ? `⚠️ ${e.message}` : '⚠️ Erro ao gerar resposta',
      }))
    } finally {
      setCarregandoVerificacaoIdx(null)
    }
  }

  function exportarMarkdown() {
    if (!resultado) return
    const linhas = [
      `# Pergunta`,
      '',
      pergunta,
      '',
      `# Resposta (${resultado.provider} / ${resultado.modelo})`,
      '',
      resultado.resposta,
      '',
      `# Fontes`,
      '',
      ...resultado.contexto.map(
        (c) => `- **${c.fonte}**${c.pagina ? ` (pág. ${c.pagina})` : ''}: ${c.conteudo}`
      ),
    ]
    const blob = new Blob([linhas.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `resposta-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Pergunta livre — resposta gerada pela IA com base nas apostilas
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
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        placeholder="Ex: Como funciona few-shot prompting? Me mostra um exemplo em Python."
        className="glass min-h-[120px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <AnexoImagem
        texto={pergunta}
        setTexto={setPergunta}
        desabilitado={loading}
        onProcessando={setOcrLoading}
        aplicarFormatoAlternativas={false}
        resetToken={anexoReset}
        dica="Envie um print do enunciado — o texto entra na caixa acima, aqui no navegador"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={enviar}
          disabled={loading || ocrLoading || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Pensando…' : 'Perguntar'}
        </button>
        <button
          onClick={() => {
            setPergunta('')
            setResultado(null)
            setErro('')
            setAnexoReset((t) => t + 1)
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
        >
          Limpar
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">Buscando no material e gerando resposta…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            ⚠️ {erro}
          </div>
        )}
        {!loading && !erro && resultado && (
          <div className="glass grad-border rounded-xl overflow-hidden">
            <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              Resposta — {resultado.provider} / {resultado.modelo}
            </div>
            <div className="p-5">
              {resultado.pouco_embasado && <WarnBanner confianca={resultado.confianca_media} />}
              <div className="mb-4">
                <Markdown>{resultado.resposta}</Markdown>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={explicarMaisSimples}
                  disabled={simplificando}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[0.78rem] font-medium text-text transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                >
                  {simplificando ? 'Simplificando…' : '🧩 Explica de novo, mais simples'}
                </button>
                <button
                  onClick={testarEntendimento}
                  disabled={verificando}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[0.78rem] font-medium text-text transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                >
                  {verificando ? 'Gerando perguntas…' : '🎓 Testar meu entendimento'}
                </button>
                <button
                  onClick={() => auditar(resultado.resposta)}
                  disabled={auditando}
                  className={`rounded-lg border px-3.5 py-2 text-[0.78rem] font-medium transition-colors disabled:opacity-40 ${
                    auditarAuto
                      ? 'border-cyan/25 bg-cyan/10 text-cyan hover:bg-cyan/20'
                      : 'border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
                  }`}
                  title={auditarAuto ? 'Auditoria automática ligada' : 'Auditoria automática desligada — clique para auditar'}
                >
                  {auditando ? 'Verificando…' : '🔎 Auditar frases'}
                </button>
                <button
                  onClick={() => setAuditarAuto((v) => !v)}
                  className={`rounded-lg border px-3.5 py-2 text-[0.78rem] font-medium transition-colors ${
                    auditarAuto
                      ? 'border-white/10 bg-white/[0.03] text-muted hover:text-text'
                      : 'border-cyan/25 bg-cyan/10 text-cyan hover:bg-cyan/20'
                  }`}
                >
                  {auditarAuto ? 'AUTO: verificar a cada resposta' : 'Manual: verificar sob demanda'}
                </button>
                <button
                  onClick={exportarMarkdown}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[0.78rem] font-medium text-text transition-colors hover:bg-white/[0.06]"
                >
                  ⬇️ Exportar .md
                </button>
              </div>

              {auditando && auditoria === null && (
                <RespostaAuditada texto={resultado.resposta} auditadas={null} auditando />
              )}
              {auditoria && <RespostaAuditada texto={resultado.resposta} auditadas={auditoria.frases} auditando={false} />}

              {respostaSimples && (
                <div className="mb-4 rounded-lg border border-cyan/20 bg-cyan/[0.05] p-4">
                  <div className="mb-2 font-mono text-[0.68rem] uppercase tracking-wider text-cyan">
                    Versão mais simples
                  </div>
                  <Markdown>{respostaSimples}</Markdown>
                </div>
              )}

              {perguntasVerificacao.length > 0 && (
                <div className="mb-4 rounded-lg border border-violet/20 bg-violet/[0.05] p-4">
                  <div className="mb-2 font-mono text-[0.68rem] uppercase tracking-wider text-violet">
                    Perguntas para testar seu entendimento — clique para ver a resposta
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {perguntasVerificacao.map((p, i) => (
                      <div key={i}>
                        <button
                          onClick={() => responderVerificacao(i, p)}
                          className="w-full rounded-lg px-2 py-1.5 text-left text-[0.85rem] text-text transition-colors hover:bg-white/[0.05]"
                        >
                          <span className="text-violet">•</span> {p}
                        </button>
                        {carregandoVerificacaoIdx === i && (
                          <div className="ml-4 mt-1 text-[0.78rem] text-muted">Pensando…</div>
                        )}
                        {respostasVerificacao[i] && (
                          <div className="ml-4 mt-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                            <Markdown>{respostasVerificacao[i]}</Markdown>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <EvidenceList items={resultado.contexto} />
            </div>
          </div>
        )}
        {!loading && !erro && !resultado && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <span className="text-2xl opacity-50">💬</span>
            <span className="text-[0.82rem]">A resposta da IA aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
