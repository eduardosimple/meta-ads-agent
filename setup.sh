#!/bin/bash
# Meta Ads Agent — Setup de variáveis de ambiente

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Arquivo .env não encontrado."
  echo "   Copie o .env.example e preencha com suas credenciais:"
  echo "   cp .env.example .env"
  exit 1
fi

# Carrega as variáveis do .env
set -a
source "$ENV_FILE"
set +a

# Verifica variáveis obrigatórias
MISSING=0
for VAR in META_ACCESS_TOKEN META_AD_ACCOUNT_ID META_APP_ID META_APP_SECRET; do
  if [ -z "${!VAR}" ] || [[ "${!VAR}" == *"your_"* ]]; then
    echo "❌ Variável $VAR não configurada no .env"
    MISSING=1
  fi
done

if [ $MISSING -eq 1 ]; then
  echo ""
  echo "Configure as variáveis acima no arquivo .env e rode novamente."
  exit 1
fi

echo "✅ Variáveis de ambiente carregadas:"
echo "   META_AD_ACCOUNT_ID: $META_AD_ACCOUNT_ID"
echo "   META_APP_ID:        $META_APP_ID"
echo "   META_ACCESS_TOKEN:  ${META_ACCESS_TOKEN:0:20}..."
echo ""
echo "Pronto para usar o Meta Ads Agent."
