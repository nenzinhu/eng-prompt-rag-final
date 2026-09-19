'use client'

import { useRef, useState } from 'react'
import { Wand2, GraduationCap, ShieldCheck, Download, TriangleAlert, MessageCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { AuditarResp, ProvidersResp, PerguntarResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import EvidenceList from '../EvidenceList'
import WarnBanner from '../WarnBanner'
import Markdown from '../Markdown'
import RespostaAuditada from '../RespostaAuditada'
import AnexoImagem from '../AnexoImagem'
import TituloAba from '../TituloAba'

export default function PerguntarTab({
  providers,
  persona = 'padrao',
  titulo = 'Perguntar — Resposta gerada pela IA com base nas apostilas, com fonte e página.',
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
  // Enquanto o texto ainda chega em pedaços: as ações sobre a resposta esperam o fim.
  const [recebendo, setRecebendo] = useState(false)
  // Muda uma vez por pergunta — a animação de entrada não repete a cada pedaço.
  const [rodada, setRodada] = useState(0)

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


  // Uma pergunta por vez (análise de 17/09/2026, A1-11): o botão voltava a ficar
  // ativo no meio do stream, e duas respostas — ou a auditoria atrasada da
  // anterior — escreviam na mesma tela. Cada envio abre uma rodada nova; tudo o
  // que chega de rodada antiga é descartado, e o stream anterior é cancelado.
  const rodadaAtualRef = useRef(0)
  const cancelarRef = useRef<AbortController | null>(null)
  // A pergunta que gerou a resposta na tela — a caixa de texto pode já ter outra.
  const [perguntaFeita, setPerguntaFeita] = useState('')

  function encerrarRodada() {
    cancelarRef.current?.abort()
    cancelarRef.current = null
    return ++rodadaAtualRef.current
  }

  async function enviar() {
    if (!pergunta.trim()) return
    const minha = encerrarRodada()
    const vale = () => rodadaAtualRef.current === minha
    const cancelar = new AbortController()
    cancelarRef.current = cancelar
    const texto = pergunta
    setPerguntaFeita(texto)
    setLoading(true)
    setErro('')
    setRespostaSimples('')
    setPerguntasVerificacao([])
    setRespostasVerificacao({})
    setAuditoria(null)
    setAuditando(false)
    setSimplificando(false)
    setVerificando(false)
    setResultado(null)
    try {
      const d = await api.perguntarStream(
        texto,
        provider,
        modelo,
        persona,
        (meta) => {
          if (!vale()) return
          // Fontes chegam antes do texto: o card aparece e o texto vai enchendo.
          setResultado({ ...meta, resposta: '' })
          setRodada((n) => n + 1)
          setRecebendo(true)
          setLoading(false)
        },
        (acumulado) => {
          if (vale()) setResultado((r) => (r ? { ...r, resposta: acumulado } : r))
        },
        cancelar.signal,
      )
      if (!vale()) return
      setResultado(d)
      // Dispara a auditoria frase por frase automaticamente, se ligada. Resposta
      // interrompida não é auditada sozinha: gastaria cota verificando meio texto.
      if (auditarAuto && d.resposta && !d.interrompida) {
        void auditar(d.resposta)
      }
    } catch (e) {
      if (!vale()) return
      setErro(e instanceof Error ? e.message : 'Erro ao gerar resposta')
      setResultado(null)
    } finally {
      if (vale()) {
        setLoading(false)
        setRecebendo(false)
        cancelarRef.current = null
      }
    }
  }

  function limpar() {
    encerrarRodada()
    setPergunta('')
    setPerguntaFeita('')
    setResultado(null)
    setErro('')
    setLoading(false)
    setRecebendo(false)
    setAuditando(false)
    setAuditoria(null)
    setAnexoReset((t) => t + 1)
  }

  async function auditar(texto: string) {
    const minha = rodadaAtualRef.current
    setAuditando(true)
    try {
      const a = await api.auditar(texto)
      if (rodadaAtualRef.current === minha) setAuditoria(a)
    } catch {
      // Auditoria é um extra — se falhar, não quebra a resposta exibida.
      if (rodadaAtualRef.current === minha) setAuditoria(null)
    } finally {
      if (rodadaAtualRef.current === minha) setAuditando(false)
    }
  }

  async function explicarMaisSimples() {
    if (!resultado) return
    const minha = rodadaAtualRef.current
    setSimplificando(true)
    try {
      const d = await api.simplificar(perguntaFeita, resultado.resposta, resultado.contexto, provider, modelo)
      if (rodadaAtualRef.current === minha) setRespostaSimples(d.resposta)
    } catch (e) {
      if (rodadaAtualRef.current === minha) setErro(e instanceof Error ? e.message : 'Erro ao simplificar resposta')
    } finally {
      if (rodadaAtualRef.current === minha) setSimplificando(false)
    }
  }

  async function testarEntendimento() {
    if (!resultado) return
    const minha = rodadaAtualRef.current
    setVerificando(true)
    try {
      const d = await api.verificar(perguntaFeita, resultado.resposta, resultado.contexto, provider, modelo)
      if (rodadaAtualRef.current !== minha) return
      setPerguntasVerificacao(d.perguntas)
      setRespostasVerificacao({})
    } catch (e) {
      if (rodadaAtualRef.current === minha) {
        setErro(e instanceof Error ? e.message : 'Erro ao gerar perguntas de verificação')
      }
    } finally {
      if (rodadaAtualRef.current === minha) setVerificando(false)
    }
  }

  async function responderVerificacao(idx: number, perguntaVerificacao: string) {
    if (respostasVerificacao[idx] || carregandoVerificacaoIdx !== null) return
    const minha = rodadaAtualRef.current
    setCarregandoVerificacaoIdx(idx)
    try {
      const d = await api.perguntar(perguntaVerificacao, provider, modelo, persona)
      if (rodadaAtualRef.current === minha) setRespostasVerificacao((r) => ({ ...r, [idx]: d.resposta }))
    } catch (e) {
      if (rodadaAtualRef.current !== minha) return
      setRespostasVerificacao((r) => ({
        ...r,
        [idx]: e instanceof Error ? e.message : 'Erro ao gerar resposta',
      }))
    } finally {
      if (rodadaAtualRef.current === minha) setCarregandoVerificacaoIdx(null)
    }
  }

  function exportarMarkdown() {
    if (!resultado) return
    const linhas = [
      `# Pergunta`,
      '',
      perguntaFeita,
      '',
      `# Resposta (${resultado.provider} / ${resultado.modelo})`,
      '',
      resultado.resposta,
      '',
      ...(resultado.interrompida ? [`> ⚠ Resposta incompleta: ${resultado.interrompida}`, ''] : []),
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
      <TituloAba titulo={titulo.split(' — ')[0]} descricao={titulo.split(' — ').slice(1).join(' — ') || undefined} />
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
        className="campo text-[0.92rem] min-h-[120px] w-full p-4 leading-relaxed"
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
          disabled={loading || recebendo || ocrLoading || !pronto}
          className="btn-primario"
        >
          {loading ? 'Pensando…' : recebendo ? 'Escrevendo…' : 'Perguntar'}
        </button>
        <button
          onClick={limpar}
          className="btn-secundario px-5 py-2.5 text-sm"
        >
          Limpar
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-texto-suave">
            <div className="carregando h-6 w-6" />
            <span className="text-[0.82rem]">Buscando no material e gerando resposta…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="aviso-erro text-texto flex items-center justify-center gap-2 p-6 text-center text-[0.85rem]">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!loading && !erro && resultado && (
          <div key={rodada} className="cartao surgir overflow-hidden">
            <div className="rotulo border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
              Resposta — {resultado.provider} / {resultado.modelo}
            </div>
            <div className="p-5">
              {resultado.pouco_embasado && <WarnBanner confianca={resultado.confianca_media} />}
              <div className="mb-4">
                <Markdown>{resultado.resposta}</Markdown>
              </div>

              {resultado.interrompida && (
                <div
                  role="alert"
                  className="aviso-atencao text-texto mb-4 flex items-start gap-2 px-3.5 py-2.5 text-[0.8rem]"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="font-semibold">Resposta incompleta:</strong> a IA parou no meio (
                    {resultado.interrompida}). O texto acima está cortado — pergunte de novo ou troque de modelo.
                  </span>
                </div>
              )}

              {recebendo && (
                <div className="mb-4 flex items-center gap-2 text-[0.75rem] text-texto-suave" aria-live="polite">
                  <div className="carregando h-3 w-3" />
                  Escrevendo…
                </div>
              )}

              <div className={`mb-4 flex flex-wrap items-center gap-2 ${recebendo ? 'hidden' : ''}`}>
                <button
                  onClick={explicarMaisSimples}
                  disabled={simplificando}
                  className="btn-secundario flex items-center gap-1.5 px-3.5 py-2 text-[0.78rem]"
                >
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {simplificando ? 'Simplificando…' : 'Explicar mais simples'}
                </button>
                <button
                  onClick={testarEntendimento}
                  disabled={verificando}
                  title="Testar meu entendimento"
                  aria-label="Testar meu entendimento"
                  className="btn-icone"
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
                  className="btn-icone"
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
                  className="btn-icone"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </button>
                <label className="ml-1 flex items-center gap-1.5 text-[0.72rem] text-texto-suave">
                  <input
                    type="checkbox"
                    checked={auditarAuto}
                    onChange={(e) => setAuditarAuto(e.target.checked)}
                    className="accent-white"
                  />
                  Auditar automaticamente
                </label>
              </div>

              {auditando && auditoria === null && (
                <RespostaAuditada texto={resultado.resposta} auditadas={null} auditando />
              )}
              {auditoria && <RespostaAuditada texto={resultado.resposta} auditadas={auditoria.frases} auditando={false} />}

              {respostaSimples && (
                <div className="mb-4 rounded-lg border border-borda-forte bg-cartao-hover p-4">
                  <div className="rotulo mb-2 text-texto">
                    Versão mais simples
                  </div>
                  <Markdown>{respostaSimples}</Markdown>
                </div>
              )}

              {perguntasVerificacao.length > 0 && (
                <div className="mb-4 rounded-lg border border-borda-forte bg-cartao-hover p-4">
                  <div className="rotulo mb-2 text-texto">
                    Perguntas para testar seu entendimento — clique para ver a resposta
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {perguntasVerificacao.map((p, i) => (
                      <div key={i}>
                        <button
                          onClick={() => responderVerificacao(i, p)}
                          className="w-full rounded-lg px-2 py-1.5 text-left text-[0.85rem] text-texto transition-colors hover:bg-white/[0.05]"
                        >
                          <span className="text-texto">•</span> {p}
                        </button>
                        {carregandoVerificacaoIdx === i && (
                          <div className="ml-4 mt-1 text-[0.78rem] text-texto-suave">Pensando…</div>
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
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-texto-suave">
            <MessageCircle className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">A resposta da IA aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
