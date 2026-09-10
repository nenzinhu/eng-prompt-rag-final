#!/usr/bin/env bash
# Mede a latência real de cada modelo do Nous Portal através da API em produção.
#
# As listas de PROVIDERS foram verificadas em 10/09/2026 como "respondem a uma
# chamada real" — mas não como "respondem RÁPIDO". O primeiro da lista é o padrão
# do dropdown, então um modelo lento no topo faz o app parecer quebrado (o
# glossário estourava o orçamento de 60 s da função).
#
# Uso: bash scripts/medir_latencia.sh [provider]
set -u
PROVIDER="${1:-nous}"
URL="https://eng-prompt-rag-final-nenzinhus-projects.vercel.app"
SAIDA="${LOCALAPPDATA:-/tmp}/Temp/latencia-$$"
mkdir -p "$SAIDA"

# Pergunta trivial: isola a latência do modelo do resto do pipeline.
PERGUNTA='Responda apenas com a palavra: ok'

medir() {
  local modelo="$1"
  # Uma única chamada devolve tempo e código (duas chamadas dobrariam a carga e
  # misturariam as medições).
  local saida
  saida=$(curl -s -m 75 -o /dev/null -w "%{time_total} %{http_code}" \
    -X POST "$URL/api/perguntar" -H "Content-Type: application/json" \
    -d "{\"pergunta\":\"$PERGUNTA\",\"provider\":\"$PROVIDER\",\"modelo\":\"$modelo\"}" 2>/dev/null)
  local t="${saida%% *}" code="${saida##* }"
  printf '%s\t%s\t%s\n' "$t" "$code" "$modelo" > "$SAIDA/$(echo "$modelo" | tr '/:' '__').txt"
}

# Modelos do Nous Portal (mesma ordem da lista em api/index.py).
MODELOS=(
  "meituan/longcat-2.0:free"
  "inclusionai/ling-3.0-flash-sante:free"
  "inclusionai/ling-3.0-flash-fin:free"
  "poolside/laguna-s-2.1:free"
  "poolside/laguna-xs-2.1:free"
  "mistralai/mistral-nemo"
  "openai/gpt-oss-20b"
  "meta-llama/llama-3.1-8b-instruct"
  "qwen/qwen3.7-flash"
  "amazon/nova-micro-v1"
)

echo "Medindo ${#MODELOS[@]} modelos do '$PROVIDER' (em paralelo, pergunta trivial)..."
for m in "${MODELOS[@]}"; do
  medir "$m" &
done
wait

echo
echo "MODELO                                     |  tempo  | HTTP"
echo "-------------------------------------------+---------+-----"
# Ordena por tempo; 504 costuma virar 52s (o timeout interno) e afunda na lista.
sort -n "$SAIDA"/*.txt 2>/dev/null | while IFS=$'\t' read -r t code modelo; do
  printf '%-42s | %6ss | %s\n' "$modelo" "$t" "$code"
done
rm -rf "$SAIDA"
