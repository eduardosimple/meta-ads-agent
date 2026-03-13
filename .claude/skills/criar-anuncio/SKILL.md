# Skill: criar-anuncio

## Objetivo
Criar o anúncio (Ad) vinculando campanha, conjunto de anúncios e criativo — sempre pausado.

## Quando usar
- Após `/criar-criativo` retornar um `creative_id`

## Pré-requisitos
- `adset_id` do conjunto de anúncios criado
- `creative_id` do criativo criado
- `META_ACCESS_TOKEN` e `META_AD_ACCOUNT_ID` disponíveis

## Informações a coletar do usuário

1. **Nome do anúncio** — ex: `[Ad] Residencial X - Imagem Fachada`
2. Confirmar IDs:
   - `adset_id`
   - `creative_id`

## Chamada à API

```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID/ads" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NOME_DO_ANUNCIO",
    "adset_id": "ADSET_ID",
    "creative": {"creative_id": "CREATIVE_ID"},
    "status": "PAUSED"
  }' \
  -d "access_token=$META_ACCESS_TOKEN"
```

> **IMPORTANTE:** `status` deve ser sempre `"PAUSED"`. O anúncio só será ativado após revisão.

## Verificação pós-criação

```bash
curl -s "https://graph.facebook.com/v19.0/AD_ID?fields=name,status,adset_id,creative,effective_status&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

Campos a verificar:
- `status`: deve ser `PAUSED`
- `effective_status`: pode ser `CAMPAIGN_PAUSED` ou `PAUSED` — ambos corretos
- `adset_id`: confirmar que está no conjunto certo

## Verificação do preview do anúncio

```bash
curl -s "https://graph.facebook.com/v19.0/AD_ID/previews?ad_format=DESKTOP_FEED_STANDARD&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

Isso retorna um iframe com o preview visual do anúncio — confirme com o usuário se está correto.

## Saída esperada para o usuário

Confirmar:
- ✅ Anúncio criado: `NOME` (ID: `XXXXXXXXX`)
- ✅ Status: PAUSADO
- ✅ Conjunto de anúncios: `ADSET_ID`
- ✅ Criativo: `CREATIVE_ID`
- ⚠️ **O anúncio está pausado e não está sendo veiculado**
- ➡️ Próximo passo: `/revisar-campanha` para revisão final antes de ativar

## Resumo dos IDs criados

Ao final desta etapa, registre e apresente ao usuário:

| Objeto | Nome | ID |
|--------|------|----|
| Campanha | NOME | campaign_id |
| Ad Set | NOME | adset_id |
| Criativo | NOME | creative_id |
| Anúncio | NOME | ad_id |
