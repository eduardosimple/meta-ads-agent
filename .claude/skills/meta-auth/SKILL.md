# Skill: meta-auth

## Objetivo
Autenticar e validar as credenciais da Meta API antes de qualquer operação.

## Quando usar
- Sempre como **primeiro passo** do fluxo de criação
- Quando houver erro de autenticação em qualquer outra skill
- Ao trocar de cliente ou conta de anúncios

## Pré-requisitos
- Variáveis de ambiente carregadas via `setup.sh`
- `.env` preenchido com as credenciais corretas

## Fluxo

### 1. Verificar variáveis de ambiente
```bash
source setup.sh
echo $META_ACCESS_TOKEN
echo $META_AD_ACCOUNT_ID
```

### 2. Validar token com a Meta API
```bash
curl -s "https://graph.facebook.com/v19.0/me?access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

Resposta esperada:
```json
{
  "id": "XXXXXXXXX",
  "name": "Nome do Usuário"
}
```

### 3. Verificar permissões da conta de anúncios
```bash
curl -s "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID?fields=name,account_status,currency,timezone_name&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

**account_status esperado:** `1` (ativo)

### 4. Verificar permissões de Marketing API
```bash
curl -s "https://graph.facebook.com/v19.0/me/permissions?access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

Permissões necessárias:
- `ads_management`
- `ads_read`
- `business_management`

## Saída esperada
Ao final, confirmar para o usuário:
- ✅ Token válido
- ✅ Conta de anúncios ativa: `act_XXXXXXXXX`
- ✅ Permissões OK
- Nome da conta e moeda configurada

## Erros comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `OAuthException code 190` | Token expirado | Gerar novo token no Meta Business Manager |
| `account_status: 2` | Conta desabilitada | Verificar pendências no Business Manager |
| Permissão ausente | App sem escopo | Solicitar permissão no App Dashboard |
