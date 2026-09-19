'use client'

/**
 * Lista numerada de exemplos do "professor auxiliar".
 *
 * Usada na aba Resolver (exemplos que mostram por que a alternativa está correta)
 * e no Glossário (exemplos de cada termo). Numeração explícita porque o aluno lê
 * isso antes da prova: "exemplo 1 / exemplo 2" se acompanha melhor do que bullets.
 */
export default function Exemplos({
  itens,
  rotulo = 'Exemplos',
}: {
  itens?: string[]
  rotulo?: string
}) {
  const lista = (itens ?? []).map((e) => (e ?? '').trim()).filter(Boolean)
  if (!lista.length) return null

  return (
    <div>
      <div className="rotulo mb-1.5">{rotulo}</div>
      <ol className="flex flex-col gap-1.5">
        {lista.map((exemplo, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cartao-hover text-[0.75rem] font-bold text-texto`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="text-[0.82rem] leading-relaxed text-texto">{exemplo}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
