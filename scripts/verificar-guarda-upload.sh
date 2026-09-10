#!/usr/bin/env bash
# Verificação ao vivo do guarda de upload (Seção 1) contra o projeto de produção.
#
# O 409 acontece ANTES de qualquer escrita, então este teste exercita o caminho
# real sem tocar no Storage nem no índice — os passos 3 e 4 provam isso.
set -u
cd "$(dirname "$0")/.."

T=$(grep '^ADMIN_TOKEN=' .env | cut -d= -f2)
ANON=$(grep '^SUPABASE_ANON_KEY=' .env | cut -d= -f2)
URL="https://kbdblnbkasxrkctfkoua.supabase.co"
TMP="${LOCALAPPDATA:-/tmp}/Temp"
mkdir -p "$TMP"
printf 'arquivo invalido de proposito' > "$TMP/quebra.pdf"
cp "$TMP/quebra.pdf" "$TMP/Empreendedorismo_Inovacao_Tecnologia.pdf"

echo "=== 1) upload SEM token (esperado 401) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -m 60 -X POST http://127.0.0.1:8000/api/upload \
  -F "files=@$TMP/quebra.pdf"

echo "=== 2) upload COM token, nome de fonte indexada, conteudo ilegivel (esperado 409) ==="
curl -s -m 120 -X POST http://127.0.0.1:8000/api/upload -H "X-Admin-Token: $T" \
  -F "files=@$TMP/Empreendedorismo_Inovacao_Tecnologia.pdf"
echo

echo "=== 3) Storage intacto? ==="
curl -s -m 30 -X POST "$URL/storage/v1/object/list/ementas" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"prefix":""}' \
  | .venv/Scripts/python.exe -c "import json,sys
d=json.load(sys.stdin)
for a in d:
    m=a['metadata']
    print('  %-47s %s %8s bytes' % (a['name'][:45], m['eTag'][:10], m['size']))"

echo "=== 4) indice intacto? ==="
curl -s -m 30 http://127.0.0.1:8000/api/status
echo
rm -f "$TMP/quebra.pdf" "$TMP/Empreendedorismo_Inovacao_Tecnologia.pdf"
