'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Wand2, GraduationCap, ShieldCheck, Download, TriangleAlert, MessageCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import { useProviderModel } from '@/lib/useProviderModel'
import type { AuditarResp, ProvidersResp, PerguntarResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import EvidenceList from '../EvidenceList'
import WarnBanner from '../WarnBanner'
import Markdown from '../Markdown'
import RespostaAuditada from '../RespostaAuditada'
import AnexoImagem from '../AnexoImagem'

export default function PerguntarTab({
  providers,
  persona = 'padrao',
  titulo = 'Pergunta livre — resposta gerada pela IA com base nas apostilas',
  placeholder = 'Ex: Como funciona few-shot prompting? Me mostra um exemplo em Python.',
}: {
  providers: ProvidersResp
  persona?: string
  titulo?: string
  placeholder?: string
}) {
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

  const resultCardRef = useRef<HTMLDivElement>(null)
  const enviarBtnRef = useRef<HTMLButtonElement>(null)

  // Entrada suave do card de resposta sempre que um novo resultado chega.
  useLayoutEffect(() => {
    if (!resultado || !resultCardRef.current || prefersReducedMotion()) return
    gsap.fromTo(
      resultCardRef.current,
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }
    )
  }, [resultado])

  async function enviar() {
    if (!pergunta.trim()) return
    setLoading(true)
    setErro('')
    setRespostaSimples('')
    setPerguntasVerificacao([])
    setRespostasVerificacao({})
    setAuditoria(null)
    try {
      const d = await api.perguntar(pergunta, provider, modelo, persona)
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
      const d = await api.perguntar(perguntaVerificacao, provider, modelo, persona)
      setRespostasVerificacao((r) => ({ ...r, [idx]: d.resposta }))
    } catch (e) {
      setRespostasVerificacao((r) => ({
        ...r,
        [idx]: e instanceof Error ? e.message : 'Erro ao gerar resposta',
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
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">{titulo}</p>
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
        placeholder={placeholder}
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
          ref={enviarBtnRef}
          onClick={enviar}
          onMouseEnter={() => gsap.to(enviarBtnRef.current, { scale: 1.03, duration: 0.2, ease: 'power2.out' })}
          onMouseLeave={() => gsap.to(enviarBtnRef.current, { scale: 1, duration: 0.25, ease: 'power2.out' })}
          onMouseDown={() => gsap.to(enviarBtnRef.current, { scale: 0.96, duration: 0.1 })}
          onMouseUp={() => gsap.to(enviarBtnRef.current, { scale: 1.03, duration: 0.15 })}
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
          <div className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!loading && !erro && resultado && (
          <div ref={resultCardRef} className="glass grad-border rounded-xl overflow-hidden">
            <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              Resposta — {resultado.provider} / {resultado.modelo}
            </div>
            <div className="p-5">
              {resultado.pouco_embasado && <WarnBanner confianca={resultado.confianca_media} />}
              <div className="mb-4">
                <Markdown>{resultado.resposta}</Markdown>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={explicarMaisSimples}
                  disabled={simplificando}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[0.78rem] font-medium text-text transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                >
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {simplificando ? 'Simplificando…' : 'Explicar mais simples'}
                </button>
                <button
                  onClick={testarEntendimento}
                  disabled={verificando}
                  title="Testar meu entendimento"
                  aria-label="Testar meu entendimento"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:opacity-40"
                >
                  {verificando ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <GraduationCap className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  onClick={() => auditar(resultado.resposta)}
                  disabled={auditando}
                  title={auditando ? 'Auditando…' : 'Auditar frases agora'}
                  aria-label="Auditar frases agora"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:opacity-40"
                >
                  {auditando ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  onClick={exportarMarkdown}
                  title="Exportar .md"
                  aria-label="Exportar como Markdown"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </button>
                <label className="ml-1 flex items-center gap-1.5 text-[0.72rem] text-muted">
                  <input
                    type="checkbox"
                    checked={auditarAuto}
                    onChange={(e) => setAuditarAuto(e.target.checked)}
                    className="accent-cyan"
                  />
                  Auditar automaticamente
                </label>
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
            <MessageCircle className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">A resposta da IA aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
