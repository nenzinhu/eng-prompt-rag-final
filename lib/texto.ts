/**
 * Formatação do texto que o aluno cola ou extrai de uma imagem.
 *
 * Vive fora dos componentes porque é usada em três abas (Resolver, Perguntar e
 * Glossário) e é pura — não toca em rede, DOM nem estado.
 */

/**
 * Separa alternativas grudadas numa mesma linha em blocos.
 *
 * Ao colar de uma página (ou extrair por OCR), a questão chega como
 * "Enunciado A) x B) y" — tudo em uma linha. O backend identifica as
 * alternativas pela quebra de linha (`rag_core.extrair_alternativas`), então
 * sem isso a questão é lida como texto corrido e nenhuma alternativa é
 * encontrada.
 *
 * Só quebra numa SEQUÊNCIA que começa em "A)" e segue em ordem. Antes bastava
 * um `A)` solto: "Sobre a fase A) do projeto" virava duas linhas e o enunciado
 * era cortado ao meio (bug B-22).
 */
export function formatarAlternativas(texto: string): string {
  type Marca = { inicio: number; fim: number; letra: string; ordem: number }
  const marcas: Marca[] = []
  const padrao = /(^|[\s([])([A-Ea-e])\)\s*/g
  let achado: RegExpExecArray | null
  while ((achado = padrao.exec(texto)) !== null) {
    marcas.push({
      inicio: achado.index + achado[1].length,
      fim: achado.index + achado[0].length,
      letra: achado[2],
      ordem: achado[2].toUpperCase().charCodeAt(0) - 65,
    })
  }

  // Maior corrida A, B, C… — é o que caracteriza uma lista de alternativas.
  let melhor: Marca[] = []
  let corrida: Marca[] = []
  for (const marca of marcas) {
    if (marca.ordem === corrida.length) {
      corrida.push(marca)
      continue
    }
    if (corrida.length >= melhor.length) melhor = corrida
    corrida = marca.ordem === 0 ? [marca] : []
  }
  if (corrida.length >= melhor.length) melhor = corrida
  if (melhor.length < 2) return texto.trim()

  let saida = ''
  let posicao = 0
  for (const marca of melhor) {
    saida += texto.slice(posicao, marca.inicio).trimEnd()
    if (saida) saida += '\n\n'
    saida += `${marca.letra}) `
    posicao = marca.fim
  }
  return (saida + texto.slice(posicao)).trim()
}

/**
 * Separador entre questões no modo lote: DUAS linhas em branco.
 *
 * Não pode ser uma linha em branco só, porque `formatarAlternativas` usa `\n\n`
 * entre as alternativas — com um separador de uma linha, cada alternativa
 * viraria uma "questão".
 */
export const SEPARADOR_QUESTAO = '\n\n\n'

/**
 * Divide o texto do modo lote em questões.
 *
 * Antes isto vivia dentro da aba e o anexo de imagens juntava os prints com
 * `\n\n` (uma linha em branco) — abaixo do que o divisor exige. Dois prints
 * viravam uma questão só, e como o backend usa a ÚLTIMA lista de alternativas,
 * a primeira questão era descartada em silêncio.
 *
 * Plano B: sem separação clara, tenta o padrão "QUESTÃO N".
 */
export function dividirQuestoes(texto: string): string[] {
  const limpar = (partes: string[]) => partes.map((b) => b.trim()).filter(Boolean)
  const blocos = limpar(texto.split(/\n[ \t]*\n[ \t]*\n+/))
  if (blocos.length > 1) return blocos
  return limpar(texto.split(/(?=^\s*QUEST[ÃA]O\s*\d+)/im))
}

/**
 * Tira o bloco `<think>…</think>` que alguns modelos emitem antes da resposta.
 *
 * Mesmo papel de `rag_core.limpar_resposta`, mas para o texto que chega aos
 * pedaços: enquanto o `<think>` ainda não fechou, tudo depois dele é raciocínio
 * e fica de fora. Sem isso o raciocínio aparecia literal na tela e ia junto
 * para auditoria, simplificação e exportação.
 */
export function semRaciocinio(texto: string): string {
  let limpo = texto.replace(/<think>[\s\S]*?<\/think>/gi, '')
  const aberto = limpo.search(/<think>/i)
  if (aberto >= 0) limpo = limpo.slice(0, aberto)
  return limpo.replace(/<\/?think>/gi, '').trimStart()
}

/**
 * Limpeza conservadora do texto que sai do OCR.
 *
 * Só corrige o que é comprovadamente ruído de reconhecimento: espaço
 * inquebrável, espaço sobrando no fim da linha, caractere de controle e
 * excesso de linhas em branco. NÃO mexe em espaçamento interno — trechos de
 * tabela e listas alinhadas do material virariam sopa de palavras.
 */
export function limparTextoOcr(bruto: string): string {
  return (bruto || '')
    .replace(/\u00a0/g, ' ')
     
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Nome com que o arquivo será salvo no Storage — mesma regra de
 * `nome_para_storage` (api/_app/documentos.py). O Storage recusa acento e
 * símbolo fora do ASCII; o servidor troca o nome sozinho, e aqui a aba PDFs
 * mostra o nome final ANTES do envio. Os dois lados são testados com os
 * mesmos casos (tests/test_ingestao_guard.py e tests-js/nome-arquivo.test.ts).
 */
/**
 * Marca curta e estável do nome original (FNV-1a de 32 bits, em hex).
 *
 * Tem de dar exatamente o mesmo resultado de `marca_do_nome`
 * (api/_app/documentos.py): a aba PDFs mostra o nome final antes do envio.
 */
function marcaDoNome(nome: string): string {
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(nome)) {
    h = Math.imul(h ^ b, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function nomeParaStorage(nome: string): string {
  let base = nome
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
  base = base.replace(/[^A-Za-z0-9 ._()-]+/g, '_').replace(/_{2,}/g, '_').replace(/^[ _]+|[ _]+$/g, '')
  // Nome inteiramente fora do ASCII não sobra nada da limpeza. Sem a marca,
  // dois arquivos diferentes viravam o mesmo "documento.pdf" e um substituía o
  // outro como se fosse uma versão nova.
  const ponto = base.lastIndexOf('.')
  if (ponto >= 0 && !base.slice(0, ponto).replace(/^[ ._]+|[ ._]+$/g, '')) {
    return `documento-${marcaDoNome(nome)}.${base.slice(ponto + 1)}`
  }
  return base || `documento-${marcaDoNome(nome)}`
}
