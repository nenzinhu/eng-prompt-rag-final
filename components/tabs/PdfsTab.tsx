'use client'

import { useRef, useState } from 'react'
import { api } from '@/lib/api'

interface LogEntry {
  type: 'ok' | 'err' | 'info'
  msg: string
}

export default function PdfsTab({ onStatusChange }: { onStatusChange?: () => void }) {
  const [pending, setPending] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFiles(files: File[]) {
    const valid = files.filter((f) => f.name.endsWith('.pdf'))
    setPending((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...valid.filter((f) => !names.has(f.name))]
    })
  }

  function logLine(type: LogEntry['type'], msg: string) {
    setLog((prev) => [...prev, { type, msg }])
  }

  async function runIngest() {
    setIndexing(true)
    try {
      const { arquivos } = await api.pdfs()
      if (!arquivos.length) {
        logLine('err', '✗ Nenhum PDF no Storage.')
        return
      }
      let totalChunks = 0
      for (const nome of arquivos) {
        logLine('info', `🔄 Indexando "${nome}"…`)
        let offset = 0
        let done = false
        let ultimoTotal = 0
        let tentativas = 0
        while (!done) {
          try {
            const d = await api.ingerir(nome, offset)
            tentativas = 0
            offset = d.proximo_offset ?? d.total ?? 0
            done = !!d.done
            ultimoTotal = d.total ?? 0
            if (ultimoTotal > 0) logLine('info', `  … ${offset}/${ultimoTotal} chunks`)
          } catch {
            tentativas++
            if (tentativas > 5) {
              logLine('err', `✗ ${nome}: falhou após várias tentativas`)
              break
            }
          }
        }
        if (done) {
          totalChunks += ultimoTotal
          logLine('ok', `✓ ${nome}: ${ultimoTotal} chunks`)
        }
      }
      logLine('ok', `✓ Concluído — ${totalChunks} chunks no total`)
      onStatusChange?.()
    } catch {
      logLine('err', '✗ Erro de conexão')
    } finally {
      setIndexing(false)
    }
  }

  async function enviar() {
    if (!pending.length) return
    setUploading(true)
    logLine('info', `⬆ Enviando ${pending.length} arquivo(s)…`)
    try {
      const d = await api.upload(pending)

      for (const nome of d.salvos) {
        logLine('ok', `✓ ${nome}: novo arquivo salvo no Storage`)
      }
      for (const s of d.substituidos ?? []) {
        logLine(
          'info',
          s.arquivo === s.substituiu
            ? `↻ ${s.arquivo}: versão atualizada substituiu a anterior`
            : `↻ ${s.arquivo}: mesclado com "${s.substituiu}" (mesmo conteúdo, nome diferente)`,
        )
      }
      for (const i of d.ignorados ?? []) {
        logLine('info', `⏭ ${i.arquivo}: ignorado — ${i.motivo}`)
      }

      const nadaMudou = !d.salvos.length && !(d.substituidos ?? []).length
      setPending([])
      if (nadaMudou) {
        logLine('info', '⏭ Nada a reindexar — nenhum arquivo mudou.')
        return
      }
      await runIngest()
    } catch {
      logLine('err', '✗ Erro no upload')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Ingestão e indexação de materiais
      </p>

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
        <div className="mb-2.5 text-3xl">📄</div>
        <p className="text-[0.85rem] text-muted">
          <strong className="font-medium text-text">Arraste PDFs ou clique para selecionar</strong>
          <br />
          Arquivos .pdf são enviados ao Supabase Storage e indexados
          <br />
          <span className="text-[0.78rem]">
            Arquivo repetido é ignorado; mesmo conteúdo com nome diferente substitui o anterior.
          </span>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {pending.length > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          {pending.map((f, i) => (
            <div key={f.name} className="glass flex items-center gap-2 rounded-lg px-3 py-2 text-[0.82rem]">
              <span>📕</span>
              <span className="flex-1 truncate font-mono text-[0.78rem] text-text">{f.name}</span>
              <button
                onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}
                className="px-0.5 text-muted transition-colors hover:text-rose-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={enviar}
          disabled={!pending.length || uploading}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {uploading ? 'Enviando…' : '⬆ Enviar e Indexar'}
        </button>
        <button
          onClick={runIngest}
          disabled={indexing}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06] disabled:opacity-40"
        >
          {indexing ? 'Indexando…' : '↺ Reindexar PDFs existentes'}
        </button>
      </div>

      {log.length > 0 && (
        <pre className="glass max-h-[280px] overflow-y-auto rounded-xl p-3.5 font-mono text-[0.76rem] leading-relaxed">
          {log.map((l, i) => (
            <span
              key={i}
              className={
                l.type === 'ok' ? 'block text-cyan' : l.type === 'err' ? 'block text-rose-400' : 'block text-muted'
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
