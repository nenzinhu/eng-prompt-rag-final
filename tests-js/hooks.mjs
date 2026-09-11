/**
 * Hook de resolução para os testes em Node.
 *
 * O app importa sem extensão (`./predictor`) porque quem resolve é o bundler do
 * Next. O Node ESM não aceita isso — então este hook acrescenta o `.ts` quando o
 * caminho é relativo e não tem extensão. É o que permite rodar os testes das
 * mesmas funções que o app usa, sem duplicar código.
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.(ts|tsx|js|mjs|cjs|json)$/.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context)
    } catch {
      // segue para a resolução normal
    }
  }
  return next(specifier, context)
}
