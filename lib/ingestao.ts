/**
 * Laço de indexação de um documento em lotes (aba PDFs).
 *
 * Vive fora do componente para ser testado sem navegador. Os defeitos que a
 * análise de 17/09/2026 achou aqui eram todos de "sucesso anunciado sem ter
 * acontecido" (A1-06, A1-07):
 * - um 409 (reindexação bloqueada) virava `done` e aparecia como "✓ 0 chunks";
 * - cinco falhas seguidas terminavam em "✓ Concluído" mesmo assim;
 * - a retentativa era imediata e repetia até erro definitivo (422, 404).
 */
import { ApiError } from './api'
import type { IngerirResp, PreviaIngestaoResp } from './types'

export type ResultadoIngestao =
  | { situacao: 'ok'; arquivo: string; chunks: number }
  /** Nenhum trecho extraído: o índice antigo foi mantido. */
  | { situacao: 'vazio'; arquivo: string }
  | { situacao: 'bloqueado'; arquivo: string; analise: PreviaIngestaoResp | null }
  | { situacao: 'falhou'; arquivo: string; mensagem: string }

type TipoLog = 'ok' | 'err' | 'info' | 'alert'

export interface OpcoesIngestao {
  ingerir: (
    arquivo: string,
    offset: number,
    forcar: boolean,
    corteId?: number,
    ultimoId?: number,
  ) => Promise<IngerirResp>
  log: (tipo: TipoLog, msg: string) => void
  esperar?: (ms: number) => Promise<void>
}

/** Espera antes de cada nova tentativa: 1, 2, 4, 8 e 16 s. */
export const ESPERAS_MS = [1000, 2000, 4000, 8000, 16000]

/** Vale a pena tentar de novo? Rede caída, tempo esgotado, limite e erro do servidor. */
export function erroPassageiro(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true
  return e.status === 408 || e.status === 429 || e.status >= 500
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function ingerirArquivo(
  arquivo: string,
  forcar: boolean,
  { ingerir, log, esperar = dormir }: OpcoesIngestao,
): Promise<ResultadoIngestao> {
  let offset = 0
  let corteId: number | undefined
  let ultimoId: number | undefined
  let tentativa = 0

  for (;;) {
    try {
      const d = await ingerir(arquivo, offset, forcar && offset === 0, corteId, ultimoId)
      if (offset === 0) corteId = d.corte_id
      ultimoId = d.ultimo_id ?? undefined
      tentativa = 0
      if (!d.total) {
        log('alert', `⚠ ${arquivo}: nenhum trecho extraído — o conteúdo antigo continua no índice`)
        for (const a of d.avisos ?? []) log('alert', `   ⚠ ${a}`)
        return { situacao: 'vazio', arquivo }
      }
      offset = d.proximo_offset ?? d.total
      log('info', `  … ${offset}/${d.total} chunks`)
      if (d.done) {
        log('ok', `✓ ${arquivo}: ${d.total} chunks`)
        return { situacao: 'ok', arquivo, chunks: d.total }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const detalhe = e.detalhe as (Partial<PreviaIngestaoResp> & { mensagem?: string }) | undefined
        log('alert', `⛔ ${arquivo}: ${detalhe?.mensagem ?? 'reindexação bloqueada'}`)
        for (const a of detalhe?.avisos ?? []) log('alert', `   ⚠ ${a}`)
        const analise = detalhe && typeof detalhe.chunks_novos === 'number' ? (detalhe as PreviaIngestaoResp) : null
        return { situacao: 'bloqueado', arquivo, analise }
      }
      const mensagem = e instanceof Error ? e.message : 'erro desconhecido'
      if (!erroPassageiro(e) || tentativa >= ESPERAS_MS.length) {
        const parcial =
          offset > 0 ? ' Parte do conteúdo novo ficou no índice junto com o antigo: reindexe de novo para trocar tudo.' : ''
        log('err', `✗ ${arquivo}: ${mensagem} — o conteúdo antigo continua no índice.${parcial}`)
        return { situacao: 'falhou', arquivo, mensagem }
      }
      const espera = ESPERAS_MS[tentativa]
      tentativa++
      log('info', `  ↻ ${arquivo}: ${mensagem} — nova tentativa em ${espera / 1000}s`)
      await esperar(espera)
    }
  }
}

/** "Concluído" só quando todos os arquivos foram indexados de verdade. */
export function resumirIngestao(resultados: ResultadoIngestao[]): {
  concluido: boolean
  totalChunks: number
  pendencias: string[]
} {
  const pendencias = resultados.flatMap((r) => {
    if (r.situacao === 'bloqueado') return [`${r.arquivo}: bloqueado — confirme abaixo ou envie outro arquivo`]
    if (r.situacao === 'falhou') return [`${r.arquivo}: falhou (${r.mensagem})`]
    if (r.situacao === 'vazio') return [`${r.arquivo}: nenhum trecho extraído`]
    return []
  })
  const totalChunks = resultados.reduce((soma, r) => soma + (r.situacao === 'ok' ? r.chunks : 0), 0)
  return { concluido: pendencias.length === 0, totalChunks, pendencias }
}
