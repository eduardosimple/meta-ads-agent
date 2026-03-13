# Skill: revisar-campanha

## Objetivo
Revisar toda a estrutura criada e, somente após aprovação explícita do usuário, ativar a campanha.

## Quando usar
- Após `/criar-anuncio` finalizar a estrutura completa
- Para revisar campanhas já existentes antes de ativar

## Pré-requisitos
- `campaign_id`, `adset_id`, `ad_id` e `creative_id` disponíveis
- `META_ACCESS_TOKEN` disponível

## Fluxo de revisão

### 1. Buscar resumo completo da campanha

```bash
curl -s "https://graph.facebook.com/v19.0/CAMPAIGN_ID?fields=name,status,objective,daily_budget,start_time,end_time,special_ad_categories&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

### 2. Buscar resumo do Ad Set

```bash
curl -s "https://graph.facebook.com/v19.0/ADSET_ID?fields=name,status,daily_budget,targeting,optimization_goal,billing_event,start_time,end_time&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

### 3. Buscar resumo do Anúncio e Criativo

```bash
curl -s "https://graph.facebook.com/v19.0/AD_ID?fields=name,status,effective_status,creative&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

### 4. Verificar status de revisão da Meta

```bash
curl -s "https://graph.facebook.com/v19.0/AD_ID?fields=review_feedback&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

## Checklist de revisão

Apresentar ao usuário e aguardar confirmação de cada item:

**Campanha:**
- [ ] Nome correto
- [ ] Objetivo adequado (`OUTCOME_LEADS` para imobiliário)
- [ ] Categoria especial `HOUSING` presente
- [ ] Orçamento correto (em reais, convertido de centavos)
- [ ] Status: PAUSADA

**Conjunto de anúncios:**
- [ ] Segmentação de localização correta (cidade + raio)
- [ ] Faixa etária adequada
- [ ] Otimização de entrega correta
- [ ] Status: PAUSADO

**Anúncio/Criativo:**
- [ ] Texto do anúncio revisado
- [ ] Imagem/vídeo correto
- [ ] URL de destino funcionando
- [ ] CTA adequado
- [ ] Sem linguagem discriminatória
- [ ] Status: PAUSADO

**Meta Review:**
- [ ] Sem pendências de revisão da Meta

## Confirmação obrigatória antes de ativar

Após apresentar o checklist, pergunte:

> "Todos os itens acima estão corretos? Posso ativar a campanha agora? (responda SIM para ativar)"

**Somente prossiga se o usuário responder explicitamente que sim.**

## Ativar campanha (somente após aprovação)

```bash
# Ativar campanha
curl -X POST \
  "https://graph.facebook.com/v19.0/CAMPAIGN_ID" \
  -d "status=ACTIVE" \
  -d "access_token=$META_ACCESS_TOKEN"

# Ativar Ad Set
curl -X POST \
  "https://graph.facebook.com/v19.0/ADSET_ID" \
  -d "status=ACTIVE" \
  -d "access_token=$META_ACCESS_TOKEN"

# Ativar Anúncio
curl -X POST \
  "https://graph.facebook.com/v19.0/AD_ID" \
  -d "status=ACTIVE" \
  -d "access_token=$META_ACCESS_TOKEN"
```

## Verificação pós-ativação

```bash
curl -s "https://graph.facebook.com/v19.0/CAMPAIGN_ID?fields=name,status,effective_status&access_token=$META_ACCESS_TOKEN" \
  | python3 -m json.tool
```

`effective_status` esperado: `ACTIVE`

## Saída esperada para o usuário

Se aprovado e ativado:
- ✅ Campanha ATIVA: `NOME` (ID: `CAMPAIGN_ID`)
- ✅ Ad Set ATIVO: `NOME` (ID: `ADSET_ID`)
- ✅ Anúncio ATIVO: `NOME` (ID: `AD_ID`)
- ℹ️ Os anúncios entrarão em revisão da Meta antes de começar a veicular
- ℹ️ Acompanhe os resultados no Meta Ads Manager

Se o usuário não aprovar:
- ⏸️ Campanha permanece pausada
- ℹ️ Faça os ajustes necessários e rode `/revisar-campanha` novamente
