export default function WarnBanner({ confianca }: { confianca: number }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3.5 py-2.5 text-[0.8rem] text-amber-300">
      ⚠️ resposta baseada majoritariamente em conhecimento geral da IA (confiança na apostila:{' '}
      {Math.round(confianca * 100)}%)
    </div>
  )
}
