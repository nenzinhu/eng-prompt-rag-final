/**
 * Quando a barra de abas deve ficar compacta, em função da rolagem.
 *
 * Vive fora do componente porque é pura — e porque é a única parte do
 * comportamento que dá para testar sem navegador (o projeto não tem
 * infraestrutura de teste de componente).
 */

/** Passou disto, compacta. */
export const ROLAGEM_COMPACTA = 120
/** Voltou abaixo disto, expande. */
export const ROLAGEM_EXPANDIDA = 60

/**
 * Histerese: os dois limites são diferentes de propósito.
 *
 * Com um limite só, parar a rolagem exatamente em cima dele faz a barra piscar
 * entre os dois estados a cada micro-movimento do dedo ou da roda do mouse.
 * Com a faixa morta entre 60 e 120, é preciso um movimento deliberado para
 * trocar de estado.
 */
export function deveCompactar(rolagem: number, jaCompacto: boolean): boolean {
  if (jaCompacto) return rolagem > ROLAGEM_EXPANDIDA
  return rolagem > ROLAGEM_COMPACTA
}
