# Skill: criar-campanha

## Objetivo
Criar uma campanha no Meta Ads sempre com status PAUSED, aguardando revisão antes de ativar.

## Quando usar
- Após `/meta-auth` validar com sucesso
- Início de qualquer novo projeto de anúncio imobiliário

## Pré-requisitos
- `/meta-auth` executado com sucesso
- Variáveis `META_ACCESS_TOKEN` e `META_AD_ACCOUNT_ID` disponíveis

## Informações a coletar do usuário

Antes de criar, pergunte e confirme:

1. **Nome da campanha** — ex: `[Imóvel] Residencial Parque Verde - Leads Março 2026`
2. **Objetivo** — opções:
   - `OUTCOME_LEADS` (recomendado para imobiliário)
   - `OUTCOME_TRAFFIC`
   - `OUTCOME_AWARENESS`
3. **Tipo de orçamento:**
   - `DAILY_BUDGET` — orçamento diário (em centavos)
   - `LIFETIME_BUDGET` — orçamento total da campanha (em centavos)
4. **Valor do orçamento** — ex: R$ 50/dia = `5000` (centavos)
5. **Data de início** — formato: `YYYY-MM-DDT00:00:00-0300`
6. **Data de fim** (opcional)
7. **Categoria especial** — para imóveis: `HOUSING` (obrigatório pela política da Meta)

## Chamada à API

```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID/campaigns" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NOME_DA_CAMPANHA",
    "objective": "OUTCOME_LEADS",
    "status": "PAUSED",
    "special_ad_categories": ["HOUSING"],
    "daily_budget": 5000,
    "start_time": "2026-03-14T00:00:00-0300"
  }' \
  -d "access_token=$META_ACCESS_TOKEN"
```

> **IMPORTANTE:** `status` deve ser sempre `"PAUSED"`. Nunca use `"ACTIVE"` na criação.

## Resposta esperada

```json
{
  "id": "120200000XXXXXXXXX",
  "name": "NOME_DA_CAMPANHA",
  "status": "PAUSED"
}
```

Salve o `campaign_id` retornado — será necessário para `/criar-adset`.

## Verificação pós-criação

```bash
curl -s "https://graph.facebook.com/v19.0/CAMPAIGN_ID?fields=name,status,objective,daily_budget,special_ad_categories&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

## Saída esperada para o usuário
Confirmar:
- ✅ Campanha criada: `NOME` (ID: `XXXXXXXXX`)
- ✅ Status: PAUSADA
- ✅ Objetivo: OUTCOME_LEADS
- ✅ Categoria especial: HOUSING
- ➡️ Próximo passo: `/criar-adset`

## Regras imobiliárias importantes
- `special_ad_categories: ["HOUSING"]` é **obrigatório** para imóveis
- Com essa categoria, segmentações de idade, gênero e CEP são limitadas pela Meta
- Não use critérios discriminatórios (raça, religião, estado civil)
