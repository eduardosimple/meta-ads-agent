#!/bin/bash
# Meta Ads Agent — Setup de variáveis de ambiente
# Uso: source setup.sh [nome ou slug do cliente]
# Ex:  source setup.sh "Residencial Aurora"
#      source setup.sh residencial-aurora

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENTS_FILE="$SCRIPT_DIR/clients.json"

# ─── Sem argumento: lista clientes disponíveis ───────────────────────────────
if [ -z "$1" ]; then
  if [ ! -f "$CLIENTS_FILE" ]; then
    echo "❌ clients.json não encontrado."
    echo "   cp clients.example.json clients.json"
    return 1 2>/dev/null || exit 1
  fi
  echo "Clientes disponíveis:"
  python3 -c "
import json
with open('$CLIENTS_FILE') as f:
    data = json.load(f)
for c in data['clientes']:
    status = '✅' if c.get('ativo') else '⏸️'
    print(f\"  {status} {c['nome']} (slug: {c['slug']})\")
"
  echo ""
  echo "Uso: source setup.sh \"Nome do Cliente\""
  return 0 2>/dev/null || exit 0
fi

# ─── Com argumento: carrega cliente ──────────────────────────────────────────
if [ ! -f "$CLIENTS_FILE" ]; then
  echo "❌ clients.json não encontrado."
  echo "   cp clients.example.json clients.json"
  return 1 2>/dev/null || exit 1
fi

CLIENT_NAME="$1"

RESULT=$(python3 -c "
import json, sys

with open('$CLIENTS_FILE') as f:
    data = json.load(f)

query = '$CLIENT_NAME'.lower()
found = None
for c in data['clientes']:
    if query in c['nome'].lower() or query == c['slug'].lower():
        found = c
        break

if not found:
    print('NOT_FOUND')
    sys.exit(1)

m = found['meta']
ctx = found.get('contexto', {})
print(f\"NOME={found['nome']}\")
print(f\"META_ACCESS_TOKEN={m['access_token']}\")
print(f\"META_AD_ACCOUNT_ID={m['ad_account_id']}\")
print(f\"META_APP_ID={m['app_id']}\")
print(f\"META_APP_SECRET={m['app_secret']}\")
print(f\"META_PAGE_ID={m.get('page_id', '')}\")
print(f\"META_PAGE_NAME={m.get('page_name', '')}\")
print(f\"CLIENT_CIDADE={ctx.get('cidade', '')}\")
print(f\"CLIENT_ESTADO={ctx.get('estado', '')}\")
print(f\"CLIENT_ORCAMENTO_PADRAO={ctx.get('orcamento_diario_padrao', 5000)}\")
print(f\"CLIENT_OBJETIVO_PADRAO={ctx.get('objetivo_padrao', 'OUTCOME_LEADS')}\")
")

if [ "$RESULT" = "NOT_FOUND" ]; then
  echo "❌ Cliente \"$CLIENT_NAME\" não encontrado no clients.json"
  echo "   Use: source setup.sh para ver os clientes disponíveis"
  return 1 2>/dev/null || exit 1
fi

# Exporta as variáveis
while IFS='=' read -r key value; do
  export "$key=$value"
done <<< "$RESULT"

# Valida token não preenchido
if [[ "$META_ACCESS_TOKEN" == *"your_"* ]]; then
  echo "❌ Credenciais do cliente \"$NOME\" não foram preenchidas no clients.json"
  return 1 2>/dev/null || exit 1
fi

echo "✅ Cliente carregado: $NOME"
echo "   Conta de anúncios: $META_AD_ACCOUNT_ID"
echo "   Cidade:            $CLIENT_CIDADE / $CLIENT_ESTADO"
echo "   Orçamento padrão:  R\$ $(echo "scale=2; $CLIENT_ORCAMENTO_PADRAO/100" | bc)/dia"
echo "   Objetivo padrão:   $CLIENT_OBJETIVO_PADRAO"
echo ""
echo "Pronto. Variáveis exportadas para esta sessão."
