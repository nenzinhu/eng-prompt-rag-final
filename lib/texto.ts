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
 */
export function formatarAlternativas(texto: string): string {
  return texto
    .replace(/\s*\b([A-Ea-e])\)\s*/g, (_match, letra: string, offset: number) => {
      const prefixo = offset === 0 ? '' : '\n\n'
      return `${prefixo}${letra}) `
    })
    .trim()
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
