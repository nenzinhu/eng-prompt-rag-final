'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Upload, Search, X, TriangleAlert } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { lerTokenAdmin, salvarTokenAdmin, limparTokenAdmin } from '@/lib/admin'
import { ingerirArquivo, resumirIngestao, type ResultadoIngestao } from '@/lib/ingestao'
import type { PreviaIngestaoResp } from '@/lib/types'
import AdminToken from '../AdminToken'

interface LogEntry {
  type: 'ok' | 'err' | 'info' | 'alert'
  msg: string
}

/** Corpo do 409 devolvido quando o upload apagaria conteúdo indexado. */
interface BloqueioUpload {
  /** Arquivo da fila que foi bloqueado — é só ele que a confirmação libera. */
  arquivo?: string
  /** Bloqueio que nenhuma confirmação resolve (ex.: nome de outro documento). */
  sem_forcar?: boolean
  mensagem?: string
  fonte_afetada?: string
  chunks_existentes?: number
  chars_existentes?: number
  chars_novos?: number
  perda_texto_percentual?: number
  avisos?: string[]
}

export default function PdfsTab({ onStatusChange }: { onStatusChange?: () => void }) {
  const [pending, setPending] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Token de administrador — as rotas de escrita são protegidas no servidor.
  const [token, setToken] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [erroToken, setErroToken] = useState('')
  const [valido, setValido] = useState(false)
  const [maxMb, setMaxMb] = useState(25)
  const [motivoLimite, setMotivoLimite] = useState('')
  const [extensoes, setExtensoes] = useState<string[]>(['.pdf'])

  // Resultado da prévia: a reindexação só roda depois de o usuário ver os números.
  const [analises, setAnalises] = useState<PreviaIngestaoResp[]>([])
  const [bloqueado, setBloqueado] = useState(false)
  const [bloqueioUpload, setBloqueioUpload] = useState<BloqueioUpload | null>(null)

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setMaxMb(c.max_upload_mb)
        setMotivoLimite(c.limite_upload_motivo ?? '')
        setExtensoes(c.extensoes)
      })
      .catch(() => undefined)

    const salvo = lerTokenAdmin()
    if (salvo) {
      setToken(salvo)
      api
        .adminVerificar(salvo)
        .then(() => setValido(true))
        .catch(() => {
          limparTokenAdmin()
          setToken('')
        })
    }
  }, [])

  function addFiles(files: File[]) {
    const aceitos: File[] = []
    const recusas: string[] = []
    for (const f of files) {
      if (!extensoes.some((e) => f.name.toLowerCase().endsWith(e))) {
        recusas.push(`⏭ ${f.name}: formato não aceito (use ${extensoes.join(', ')})`)
        continue
      }
      // Recusar aqui, e não no servidor: acima do teto a requisição nem chega ao
      // código (a plataforma corta antes), e o erro que voltava não dizia nada.
      if (f.size > maxMb * 1024 * 1024) {
        const tamanho = (f.size / 1024 / 1024).toFixed(1)
        recusas.push(
          `⛔ ${f.name}: ${tamanho} MB — o limite é ${maxMb} MB por arquivo. ${motivoLimite}`,
        )
        continue
      }
      aceitos.push(f)
    }
    for (const r of recusas) logLine('alert', r)
    if (!aceitos.length) return
    setPending((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...aceitos.filter((f) => !names.has(f.name))]
    })
  }

  function logLine(type: LogEntry['type'], msg: string) {
    setLog((prev) => [...prev, { type, msg }])
  }

  async function entrar(usuario: string, senha: string) {
    setVerificando(true)
    setErroToken('')
    try {
      const d = await api.adminLogin(usuario, senha)
      salvarTokenAdmin(d.token)
      setToken(d.token)
      setValido(true)
    } catch (e) {
      setErroToken(e instanceof Error ? e.message : 'Não foi possível entrar')
    } finally {
      setVerificando(false)
    }
  }

  function sair() {
    limparTokenAdmin()
    setToken('')
    setValido(false)
    setAnalises([])
    setBloqueado(false)
  }

  /** Consulta o que a reindexação faria com cada documento — sem gravar nada. */
  async function verificar(arquivos?: string[]) {
    setIndexing(true)
    setAnalises([])
    setBloqueado(false)
    try {
      const nomes = arquivos ?? (await api.pdfs(token)).arquivos
      if (!nomes.length) {
        logLine('err', '✗ Nenhum documento no Storage.')
        return
      }
      const resultados: PreviaIngestaoResp[] = []
      for (const nome of nomes) {
        const a = await api.previaIngestao(nome, token)
        resultados.push(a)
        logLine(
          'info',
          `🔎 "${nome}": ${a.chunks_existentes} chunks hoje → ${a.chunks_novos} depois` +
            (a.perda_texto_percentual > 0 ? ` · texto −${a.perda_texto_percentual}%` : ' · texto preservado'),
        )
        for (const aviso of a.avisos) logLine('alert', `   ⚠ ${aviso}`)
      }
      setAnalises(resultados)
      const travado = resultados.some((a) => !a.ok)
      setBloqueado(travado)
      if (travado) {
        logLine('err', '✗ Reindexação bloqueada: confirme abaixo se é mesmo isso.')
      } else {
        logLine('ok', '✓ Nada indica perda de conteúdo — pode reindexar.')
      }
    } catch (e) {
      logLine('err', `✗ ${e instanceof Error ? e.message : 'Erro ao verificar'}`)
    } finally {
      setIndexing(false)
    }
  }

  /**
   * Indexa de fato. `forcar` (todos, ou a lista de nomes) é obrigatório quando a
   * prévia ou o upload acusaram perda. "Concluído" só aparece se TODOS os
   * arquivos entraram: bloqueio, falha e extração vazia viram pendência.
   */
  async function runIngest(arquivos: string[], forcar: boolean | string[] = false) {
    setIndexing(true)
    try {
      const resultados: ResultadoIngestao[] = []
      for (const nome of arquivos) {
        logLine('info', `🔄 Indexando "${nome}"…`)
        const forcarEste = forcar === true || (Array.isArray(forcar) && forcar.includes(nome))
        resultados.push(
          await ingerirArquivo(nome, forcarEste, {
            ingerir: (a, offset, f, corte, ultimo) => api.ingerir(a, offset, token, f, corte, ultimo),
            log: logLine,
          }),
        )
      }
      const resumo = resumirIngestao(resultados)
      if (resumo.concluido) {
        logLine('ok', `✓ Concluído — ${resumo.totalChunks} chunks no total`)
      } else {
        logLine('err', '✗ Terminou com pendências — não está tudo indexado:')
        for (const p of resumo.pendencias) logLine('err', `   • ${p}`)
      }
      // Bloqueados voltam para o painel de confirmação em vez de sumirem.
      const bloqueados = resultados.flatMap((r) => (r.situacao === 'bloqueado' && r.analise ? [r.analise] : []))
      setAnalises(bloqueados)
      setBloqueado(bloqueados.length > 0)
      onStatusChange?.()
    } finally {
      setIndexing(false)
    }
  }

  /**
   * Envia um arquivo por requisição. Antes, todos iam juntos: um bloqueio no
   * meio deixava os anteriores no Storage sem indexar. `forcarArquivo` libera
   * só o arquivo que o usuário confirmou, nunca os outros da fila.
   */
  async function enviar(forcarArquivo?: string) {
    if (!pending.length) return
    setUploading(true)
    setBloqueioUpload(null)
    logLine('info', `⬆ Enviando ${pending.length} arquivo(s)…`)
    const mudou: string[] = []
    const forcados: string[] = []
    const ficam: File[] = []
    try {
      for (let i = 0; i < pending.length; i++) {
        const f = pending[i]
        const forcar = f.name === forcarArquivo
        try {
          const d = await api.upload([f], token, forcar)
          for (const nome of d.salvos) logLine('ok', `✓ ${nome}: novo arquivo salvo no Storage`)
          for (const s of d.substituidos ?? []) {
            logLine(
              'info',
              s.arquivo === s.substituiu
                ? `↻ ${s.arquivo}: versão atualizada substituiu a anterior`
                : `↻ ${s.arquivo}: mesclado com "${s.substituiu}" (mesmo conteúdo, nome diferente)`,
            )
          }
          for (const ig of d.ignorados ?? []) logLine('info', `⏭ ${ig.arquivo}: ignorado — ${ig.motivo}`)
          const alterados = [...d.salvos, ...(d.substituidos ?? []).map((s) => s.arquivo)]
          mudou.push(...alterados)
          if (forcar) forcados.push(...alterados)
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            // Para aqui: o bloqueado e os que vêm depois continuam na fila.
            const detalhe = (e.detalhe as BloqueioUpload | undefined) ?? {}
            logLine('alert', `⛔ ${f.name}: ${detalhe.mensagem ?? 'upload bloqueado para não perder conteúdo.'}`)
            for (const a of detalhe.avisos ?? []) logLine('alert', `   ⚠ ${a}`)
            setBloqueioUpload({ ...detalhe, arquivo: f.name })
            ficam.push(...pending.slice(i))
            break
          }
          logLine('err', `✗ ${f.name}: ${e instanceof Error ? e.message : 'erro no upload'} — continua na fila`)
          ficam.push(f)
        }
      }
      setPending(ficam)
      if (mudou.length) {
        // O upload confirmado precisa da mesma confirmação na indexação, senão
        // a ingestão aplica o mesmo critério e bloqueia (análise de 17/09, A1-07).
        await runIngest(mudou, forcados)
      } else if (!ficam.length) {
        logLine('info', '⏭ Nada a reindexar — nenhum arquivo mudou.')
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Ingestão e indexação de materiais
      </p>

      <AdminToken
        token={token}
        onEntrar={entrar}
        onSair={sair}
        valido={valido}
        verificando={verificando}
        erro={erroToken}
      />

      {valido && (
        <>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              addFiles(Array.from(e.dataTransfer.files))
            }}
            className={`glass mb-4 cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
              dragOver ? 'border-violet bg-violet/[0.04]' : 'border-white/10'
            }`}
          >
            <FileText className="mx-auto mb-2.5 h-7 w-7 text-cyan" aria-hidden="true" />
            <p className="text-[0.85rem] text-muted">
              <strong className="font-medium text-text">Arraste arquivos ou clique para selecionar</strong>
              <br />
              {extensoes.join(' · ')} (até {maxMb} MB cada) vão para o Supabase Storage e são indexados
              <br />
              <span className="text-[0.78rem]">
                Arquivo repetido é ignorado; mesmo conteúdo com nome diferente substitui o anterior.
              </span>
              {motivoLimite && (
                <>
                  <br />
                  <span className="text-[0.75rem] text-amber-300/90">Limite de {maxMb} MB porque {motivoLimite}.</span>
                </>
              )}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={extensoes.join(',')}
              className="hidden"
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
            />
          </div>

          {pending.length > 0 && (
            <div className="mb-4 flex flex-col gap-1.5">
              {pending.map((f, i) => (
                <div key={f.name} className="glass flex items-center gap-2 rounded-lg px-3 py-2 text-[0.82rem]">
                  <FileText className="h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
                  <span className="flex-1 truncate font-mono text-[0.78rem] text-text">{f.name}</span>
                  <button
                    onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remover ${f.name}`}
                    className="px-0.5 text-muted transition-colors hover:text-rose-400"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => enviar()}
              disabled={!pending.length || uploading}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {uploading ? 'Enviando…' : 'Enviar e Indexar'}
            </button>
            <button
              onClick={() => verificar()}
              disabled={indexing}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06] disabled:opacity-40"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {indexing ? 'Verificando…' : 'Verificar antes de reindexar'}
            </button>
          </div>

          {bloqueioUpload && (
            <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4">
              <div className="mb-2 font-mono text-[0.68rem] uppercase tracking-wider text-rose-300">
                Upload bloqueado — risco de perder conteúdo
              </div>
              <p className="mb-2 text-[0.8rem] leading-relaxed text-muted">
                {bloqueioUpload.mensagem ?? 'O arquivo enviado substituiria um documento já indexado.'}
              </p>
              {bloqueioUpload.fonte_afetada && bloqueioUpload.chunks_existentes !== undefined && (
                <div className="mb-2 font-mono text-[0.75rem] text-text">
                  {bloqueioUpload.fonte_afetada}: {bloqueioUpload.chunks_existentes} chunks indexados hoje
                  {bloqueioUpload.perda_texto_percentual
                    ? ` · perda de ${bloqueioUpload.perda_texto_percentual}% do texto`
                    : ''}
                </div>
              )}
              <ul className="mb-3 flex flex-col gap-1">
                {(bloqueioUpload.avisos ?? []).map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[0.78rem] leading-relaxed text-amber-300">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {a}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {!bloqueioUpload.sem_forcar && bloqueioUpload.arquivo && (
                  <button
                    onClick={() =>
                      window.confirm(
                        `Confirmar mesmo assim? Os chunks atuais serão trocados pelos de "${bloqueioUpload.arquivo}". Os outros arquivos da fila continuam passando pela verificação normal.`,
                      ) && enviar(bloqueioUpload.arquivo)
                    }
                    className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-[0.8rem] font-medium text-rose-300 transition-colors hover:bg-rose-400/20"
                  >
                    Confirmar substituição de qualquer forma
                  </button>
                )}
                <button
                  onClick={() => setBloqueioUpload(null)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-[0.8rem] font-medium text-text transition-colors hover:bg-white/[0.06]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {analises.length > 0 && (
            <div className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="mb-2 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
                O que a reindexação faria
              </div>
              <div className="flex flex-col gap-1 font-mono text-[0.75rem]">
                {analises.map((a) => (
                  <div key={a.arquivo} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate text-text">{a.arquivo}</span>
                    <span className={a.ok ? 'text-muted' : 'text-amber-300'}>
                      {a.chunks_existentes} → {a.chunks_novos} chunks
                      {a.perda_texto_percentual > 0
                        ? ` · texto −${a.perda_texto_percentual}%`
                        : ' · texto preservado'}
                    </span>
                  </div>
                ))}
              </div>

              {bloqueado ? (
                <div className="mt-3">
                  <p className="mb-2 flex items-start gap-1.5 text-[0.8rem] leading-relaxed text-amber-300">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      Ao fim da reindexação, os chunks atuais desses documentos são trocados pelos novos. Se
                      a extração cobrir menos texto que o índice atual, conteúdo se perde — foi assim que 384
                      chunks de um PDF ausente ficaram em risco.
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        window.confirm(
                          'Confirmar a reindexação MESMO com risco de perda de conteúdo? Os chunks atuais serão substituídos pelos novos.',
                        ) && runIngest(analises.map((a) => a.arquivo), true)
                      }
                      className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-[0.8rem] font-medium text-rose-300 transition-colors hover:bg-rose-400/20"
                    >
                      Confirmar reindexação mesmo assim
                    </button>
                    <button
                      onClick={() => {
                        setAnalises([])
                        setBloqueado(false)
                      }}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-[0.8rem] font-medium text-text transition-colors hover:bg-white/[0.06]"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => runIngest(analises.map((a) => a.arquivo))}
                  className="mt-3 rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-2 text-[0.8rem] font-medium text-cyan transition-colors hover:bg-cyan/20"
                >
                  Reindexar agora
                </button>
              )}
            </div>
          )}
        </>
      )}

      {log.length > 0 && (
        <pre className="glass max-h-[280px] overflow-y-auto rounded-xl p-3.5 font-mono text-[0.76rem] leading-relaxed">
          {log.map((l, i) => (
            <span
              key={i}
              className={
                l.type === 'ok'
                  ? 'block text-cyan'
                  : l.type === 'err'
                    ? 'block text-rose-400'
                    : l.type === 'alert'
                      ? 'block text-amber-300'
                      : 'block text-muted'
              }
            >
              {l.msg}
            </span>
          ))}
        </pre>
      )}
    </div>
  )
}
