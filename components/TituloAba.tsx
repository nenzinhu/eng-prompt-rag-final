/** Topo de cada aba: nome em destaque e uma frase curta explicando o que ela faz. */
export default function TituloAba({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="mb-5">
      <h2 className="titulo-secao">{titulo}</h2>
      {descricao && <p className="mt-1 text-[0.95rem] leading-relaxed text-texto-suave">{descricao}</p>}
    </div>
  )
}
