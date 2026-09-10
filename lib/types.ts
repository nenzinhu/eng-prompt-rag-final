export interface StatusResp {
  status: 'ready' | 'empty'
  total: number
}

export interface ProviderInfo {
  label: string
  models: string[]
  configurado: boolean
}

export type ProvidersResp = Record<string, ProviderInfo>

export interface Evidencia {
  conteudo: string
  fonte: string
  pagina?: number
  relevancia?: number
}

export interface BuscarResultado {
  conteudo: string
  fonte: string
  pagina?: number
  relevancia: number
}

export interface BuscarResp {
  resultados: BuscarResultado[]
}

export interface PerguntarResp {
  resposta: string
  contexto: Evidencia[]
  pouco_embasado: boolean
  confianca_media: number
  provider: string
  modelo: string
}

export interface ResolverResp {
  questao: string
  alternativas: Record<string, string>
  resposta: string | null
  conteudo_resposta: string
  explicacao: string
  pouco_embasado: boolean
  confianca_media: number
  contexto: Evidencia[]
  provider: string
  modelo: string
}

export interface PdfsResp {
  arquivos: string[]
}

export interface IngerirResp {
  ok: boolean
  arquivo?: string
  processado?: number
  total?: number
  proximo_offset?: number
  done?: boolean
  erro?: string
}

export interface UploadResp {
  salvos: string[]
}
