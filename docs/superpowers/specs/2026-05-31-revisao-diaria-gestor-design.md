# Revisão Diária como Gestor de Tráfego — Design

**Data:** 2026-05-31
**Projeto:** meta-ads-agent
**Status:** aprovado para implementação (escopo: só revisão diária; criativos = projeto 2 separado)

## Problema

Hoje a revisão diária é **copiloto**: de madrugada o `analysis-single` analisa cada
cliente e salva propostas com `status: "pending"`. Nada é executado — o relatório é
uma lista de sugestões soltas, com status técnico, e o gestor teria que aplicar tudo
manualmente (o que na prática não acontece).

O Eduardo quer que o agente aja como **gestor de tráfego de verdade**: executar as
otimizações elegíveis sozinho, e o relatório virar uma **prestação de contas** — o que
foi feito, o que aguarda decisão dele, e o que foi analisado mas não exigiu ação.

## Decisões tomadas (brainstorming)

- **Autonomia:** modelo híbrido por classe de ação (ver tabela). Ações seguras e
  reversíveis executam sozinhas; ações de estrutura ficam a 1 clique.
- **Escopo desta entrega:** SOMENTE a revisão diária, **Meta E Google Ads**.
  Semanal/mensal continuam em dry_run como hoje. Criativos continuam sob demanda (projeto 2).
- **Execução via API server-side (Meta e Google):** autorizado. Atualiza a regra antiga
  "pausas só pelo portal". As ações MANUAIS continuam exigindo clique no portal.
- **Desfazer:** toda ação automática guarda o estado anterior e tem botão desfazer.

## Classificação das ações

O classificador roda sobre cada `Proposal` gerada pela análise. Os **gates** seguem a
metodologia 12345 já usada no system prompt da análise.

| Ação (`proposal.action.type`) | Classe | Gate para executar automático | Se não passar |
|---|---|---|---|
| `pause_ad` | 🟢 AUTO | anúncio rodando ≥4 dias **E** spend ≥ R$30 | `skipped_gate` (vira sugestão) |
| `scale_budget` | 🟢 AUTO | spend ≥ R$50 **E** novo budget dentro do orçamento mensal projetado | `skipped_gate` |
| `create_adset` | 🟡 MANUAL | nunca automático | `awaiting_approval` |
| `pause_adset` | 🟡 MANUAL | nunca automático | `awaiting_approval` |
| `pause_campaign` | 🟡 MANUAL | nunca automático | `awaiting_approval` |
| `update_adset_targeting` | 🟡 MANUAL | nunca automático | `awaiting_approval` |
| `pause_google_ad_group` | 🟢 AUTO | spend ≥ R$30 (Google não expõe `days_running` por ad group → gate só por gasto) | `skipped_gate` |
| `scale_google_campaign` | 🟢 AUTO | spend ≥ R$50 **E** novo budget dentro do orçamento mensal projetado | `skipped_gate` |
| `pause_google_campaign` | 🟡 MANUAL | nunca automático (alto impacto, coerente com `pause_campaign` do Meta) | `awaiting_approval` |
| `none` | — | sem ação | `no_action` |

Criativo novo (`creative_requested`) permanece com o fluxo atual (sob demanda, clique).

### Detalhe dos gates

**Meta:**
- **pause_ad:** usa `AdMetrics.days_running` e `AdMetrics.spend` do próprio dataset da
  análise (já disponíveis via `adMetricsMap` em `analysis.ts`). Threshold: `days_running >= 4 && spend >= 30`.
- **scale_budget:** usa `proposal.budget_sugerido_cents` (já calculado na análise) e
  `AdMetrics.spend >= 50`. Checagem de orçamento mensal: se
  `client.contexto.orcamento_mensal_cents` existir, rejeita se
  `(novo_daily_budget_cents/100 * dias_restantes_no_mes) + gasto_mes_atual > orcamento_mensal`.
  Sem orçamento mensal cadastrado → aplica só o gate de spend (R$50+).

**Google:**
- **pause_google_ad_group:** usa `GoogleAdMetrics.spend` do dataset (mapeado por
  `ad_group_id`). `GoogleAdMetrics` NÃO tem `days_running`, então o gate é só por gasto:
  `spend >= 30`. Executa via `pauseGoogleAdGroup(client.google, ad_group_id)` (já existe).
- **scale_google_campaign:** escala +20% via `scaleGoogleCampaignBudget(client.google,
  campaign_id, 1.2)` (já existe; retorna `{old_budget, new_budget}` em reais — usado
  como `previous_state`). Gate: gasto da campanha ≥ R$50 **E**, se houver
  `orcamento_mensal_cents`, o novo budget projetado não pode estourar o mês (mesma
  fórmula do Meta). O cálculo do novo budget é feito DENTRO de `scaleGoogleCampaignBudget`
  (lê o budget atual da API e multiplica), então o gate de orçamento mensal usa o
  `spend` da campanha como proxy do budget atual antes de chamar; se passar, executa e
  confere o `new_budget` retornado.
- **pause_google_campaign:** sempre MANUAL (vira `awaiting_approval`).

## Arquitetura

### Fluxo (madrugada, dentro do worker existente)

```
analysis-single (por cliente)
  → analyzeMetaAds()            [já existe] gera propostas
  → executeAutoActions()        [NOVO]      classifica + gates + Meta API + previous_state
  → saveReport()                [já existe] salva com status já resolvido
```

A execução roda **dentro do `analysis-single`**, logo após a análise e antes do save,
para que o relatório da manhã já reflita o estado final. Não é um cron novo.

### Componentes

**1. `src/lib/auto-executor.ts` (NOVO)**
- `export async function executeAutoActions(client, analysis): Promise<AnalysisResult>`
- Para cada proposal:
  - Classifica (AUTO / MANUAL / no_action) pela tabela acima.
  - MANUAL → marca `status: "awaiting_approval"`, retorna sem tocar na API.
  - AUTO → aplica gate. Reprovou → `status: "skipped_gate"` + `result_message` com o motivo.
  - AUTO aprovado → captura `previous_state`, executa via meta-api, marca
    `status: "executed"` + `result_message`. Erro → `status: "failed"` + mensagem.
- try/catch por proposal: falha de uma não derruba as outras.
- Idempotência: se proposal já está em estado resolvido, pula.
- Depende de: `meta-api.ts` (`pauseEntity`, `updateAdsetBudget` — já existem), tipos.

**2. `src/types/metrics.ts` (EDIT)**
- `Proposal.status` ganha: `"executed" | "failed" | "skipped_gate" | "awaiting_approval" | "undone" | "no_action"` (somados aos atuais).
- `Proposal.previous_state?`: união discriminada (cobre Meta e Google):
  - `{ kind: "ad_status"; ad_id: string; old: "ACTIVE" | "PAUSED" }` (Meta pause_ad)
  - `{ kind: "adset_budget"; adset_id: string; old_daily_budget_cents: number }` (Meta scale)
  - `{ kind: "google_adgroup_status"; ad_group_id: string; customer_id: string; old: "ENABLED" | "PAUSED" }` (Google pause ad group)
  - `{ kind: "google_campaign_budget"; campaign_id: string; customer_id: string; old_budget_reais: number }` (Google scale)
- `Proposal.executed_at?: string`.

**3. `src/lib/analysis.ts` (EDIT — pequeno)**
- A `executeAutoActions` é chamada pelo worker tanto para Meta quanto para Google, então
  precisa receber o `client` (tem `client.meta` e `client.google`) e o `AnalysisResult`.
  Nenhuma mudança na lógica de análise em si — só garantir que as proposals do Google já
  carregam `campaign_id`/`ad_group_id` (já carregam via `action`).

**4. `src/app/api/cron/analysis-single/route.ts` (EDIT)**
- Após `analyzeMetaAds`, chamar `executeAutoActions(client, metaAnalysis)` → `report.meta`.
- Após `analyzeGoogleAds`, chamar `executeAutoActions(client, googleAnalysis)` → `report.google`.
- Mantém os fixes anteriores (Google-only, erros por canal não-fatais).

**5. `src/app/api/daily-reports/[slug]/proposals/undo/route.ts` (NOVO)**
- `POST` body `{ date, proposal_id }`, auth `view_key` (= REPORT_VIEW_SECRET).
- Carrega report (busca a proposal em `meta` E `google`), lê `previous_state`, reverte:
  - `ad_status` → `resumeEntity(ad_id)` (Meta)
  - `adset_budget` → `updateAdsetBudget(adset_id, old_cents)` (Meta)
  - `google_adgroup_status` → `setGoogleAdGroupStatus(..., "ENABLED")` (Google)
  - `google_campaign_budget` → `setGoogleCampaignBudgetAmount(..., old_budget_reais)` (Google, já existe)
  Marca `status: "undone"`. Idempotente.
- Funções a verificar/criar em libs:
  - `resumeEntity` no `meta-api.ts` (provável criar — espelho de `pauseEntity`).
  - `setGoogleAdGroupStatus(google, adGroupId, "ENABLED"|"PAUSED")` no `google-ads-api.ts`
    (criar — hoje só existe `pauseGoogleAdGroup`; reusar o `mutateSingleResource` interno).
  - `setGoogleCampaignBudgetAmount` e `scaleGoogleCampaignBudget` já existem.

**5. Relatório `src/app/daily-report/[date]/page.tsx` + componentes (EDIT)**
- Cabeçalho de contas: `✅ N feitas · ⏳ N aguardando você · ⏭️ N não feitas`.
- Seção **"✅ O que foi feito"** (sempre aberta): proposals `executed`, cada uma com
  diagnóstico curto + `[Desfazer]`.
- Seção **"⏳ Aguardando você"** (sempre aberta): proposals `awaiting_approval`, com
  `[Aprovar e criar]` (reusa fluxo `proposals/execute`/`approve` existente).
- Seção **"⏭️ Não feito / sem ação"** (minimizada): proposals `skipped_gate`,
  `no_action`, `failed`, com motivo.
- Seção **"Status das campanhas"** (minimizada): a tabela atual de campanhas/
  conjuntos/anúncios, com resumo no cabeçalho (N ativas · R$ gasto · N leads).

## Tratamento de erros

- Falha de Meta API numa ação: proposal vira `failed` com a mensagem; demais seguem.
- `executeAutoActions` nunca lança — sempre devolve o `AnalysisResult` (degrada para
  o comportamento atual de "tudo pending/awaiting" se algo global quebrar).
- Undo de algo já `undone` ou sem `previous_state`: retorna 200 no-op com aviso.
- Toda execução e reversão logada em `result_message` (auditável no relatório).

## Testes

- **Unit `auto-executor` (Meta):** classificação por tipo; gates (pause_ad 3 dias → skip;
  5 dias e R$40 → executa; scale acima do orçamento mensal → skip); captura de
  `previous_state`; idempotência; isolamento de erro por proposal. Meta/Google API mockadas.
- **Unit `auto-executor` (Google):** pause_google_ad_group com spend R$20 → skip, R$40 →
  executa; scale_google_campaign dentro/fora do orçamento mensal; pause_google_campaign
  sempre → `awaiting_approval`; `previous_state` Google capturado.
- **Unit gate de orçamento mensal:** com e sem `orcamento_mensal_cents`.
- **Manual em produção (controlado):** rodar `analysis-single` de 1 cliente Meta e 1
  cliente Google reais, conferir as seções do relatório e o desfazer de uma ação
  reversível em cada canal.

## Fora de escopo (explícito)

- Otimização semanal/mensal (continuam dry_run).
- Geração/correção de criativos (projeto 2).
- Execução automática de ações de ESTRUTURA (criar conjunto/campanha, pausar
  conjunto/campanha inteira, mudar targeting) — sempre `awaiting_approval` (1 clique),
  nos dois canais.
