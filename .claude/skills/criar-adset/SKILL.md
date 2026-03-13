# Skill: criar-adset

## Objetivo
Criar um conjunto de anúncios (Ad Set) vinculado a uma campanha, com segmentação otimizada para o mercado imobiliário.

## Quando usar
- Após `/criar-campanha` retornar um `campaign_id`

## Pré-requisitos
- `campaign_id` da campanha criada
- `META_ACCESS_TOKEN` e `META_AD_ACCOUNT_ID` disponíveis

## Informações a coletar do usuário

1. **Nome do conjunto** — ex: `[AdSet] Leads - SP Capital - 30-60 anos`
2. **Localização do imóvel** — cidade, bairro ou coordenadas + raio
3. **Faixa etária** — mín: 18, máx: 65 (para HOUSING, Meta pode limitar)
4. **Orçamento** (se não definido na campanha) — diário em centavos
5. **Página do Facebook** vinculada (`page_id`)
6. **Pixel do Facebook** (opcional, mas recomendado)
7. **Otimização de entrega:**
   - `LEAD_GENERATION` → `optimization_goal: LEAD_GENERATION`
   - `LINK_CLICKS` → `optimization_goal: LINK_CLICKS`
8. **Data de início e fim**

## Segmentação padrão para imobiliário

```json
{
  "targeting": {
    "geo_locations": {
      "cities": [{"key": "CITY_KEY", "radius": 20, "distance_unit": "kilometer"}]
    },
    "age_min": 25,
    "age_max": 65,
    "interests": [
      {"id": "6003200545839", "name": "Real estate"},
      {"id": "6003409343548", "name": "Investment"},
      {"id": "6003195797498", "name": "Home improvement"}
    ],
    "behaviors": [
      {"id": "6002714895372", "name": "Likely to move"}
    ]
  }
}
```

> **Nota:** Com `special_ad_categories: HOUSING`, a Meta restringe idade, gênero e CEP. Use localização por cidade/raio.

## Chamada à API

```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID/adsets" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NOME_DO_ADSET",
    "campaign_id": "CAMPAIGN_ID",
    "status": "PAUSED",
    "daily_budget": 5000,
    "billing_event": "IMPRESSIONS",
    "optimization_goal": "LEAD_GENERATION",
    "start_time": "2026-03-14T00:00:00-0300",
    "targeting": {
      "geo_locations": {
        "cities": [{"key": "CITY_KEY", "radius": 20, "distance_unit": "kilometer"}]
      },
      "age_min": 25,
      "age_max": 65
    },
    "special_ad_category_country": ["BR"]
  }' \
  -d "access_token=$META_ACCESS_TOKEN"
```

> **IMPORTANTE:** `status` sempre `"PAUSED"`.

## Buscar chave de cidade

```bash
curl -s "https://graph.facebook.com/v19.0/search?type=adgeolocation&q=São Paulo&location_types=city&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

## Saída esperada para o usuário
Confirmar:
- ✅ Ad Set criado: `NOME` (ID: `XXXXXXXXX`)
- ✅ Status: PAUSADO
- ✅ Localização: [cidade] + [raio]km
- ✅ Público estimado: [exibir se disponível]
- ➡️ Próximo passo: `/criar-criativo`
