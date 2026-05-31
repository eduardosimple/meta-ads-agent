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
- **Escopo desta entrega:** SOMENTE a revisão diária. Semanal/mensal continuam em
  dry_run como hoje. Criativos continuam sob demanda (projeto 2, depois).
- **Execução via Meta API server-side:** autorizado. Atualiza a regra antiga "pausas
  só pelo portal". As ações MANUAIS continuam exigindo clique no portal.
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
| `pause_google_*`, `scale_google_*` | 🟡 MANUAL | nunca automático (fora de escopo desta entrega) | `awaiting_approval` |
| `none` | — | sem ação | `no_action` |

Criativo novo (`creative_requested`) permanece com o fluxo atual (sob demanda, clique).

### Detalhe dos gates

- **pause_ad:** usa `AdMetrics.days_running` e `AdMetrics.spend` do próprio dataset da
  análise (já disponíveis via `adMetricsMap` em `analysis.ts`). Threshold: `days_running >= 4 && spend >= 30`.
- **scale_budget:** usa `proposal.budget_sugerido_cents` (já calculado na análise) e
  `AdMetrics.spend >= 50`. Checagem de orçamento mensal: se
  `client.contexto.orcamento_mensal_cents` existir, rejeita se
  `(novo_daily_budget_cents/100 * dias_restantes_no_mes) + gasto_mes_atual > orcamento_mensal`.
  Sem orçamento mensal cadastrado → aplica só o gate de spend (R$50+).

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
- `Proposal.previous_state?`: união discriminada:
  - `{ kind: "ad_status"; ad_id: string; old: "ACTIVE" | "PAUSED" }`
  - `{ kind: "adset_budget"; adset_id: string; old_daily_budget_cents: number }`
- `Proposal.executed_at?: string`.

**3. `src/app/api/cron/analysis-single/route.ts` (EDIT)**
- Após `analyzeMetaAds`, chamar `executeAutoActions(client, analysis)` e usar o
  resultado no `report.meta`. Mantém os fixes anteriores (Google-only, erros por canal).

**4. `src/app/api/daily-reports/[slug]/proposals/undo/route.ts` (NOVO)**
- `POST` body `{ date, proposal_id }`, auth `view_key` (= REPORT_VIEW_SECRET).
- Carrega report, acha proposal, lê `previous_state`, reverte via meta-api
  (reativa anúncio = `resumeEntity`; volta budget = `updateAdsetBudget` com old).
  Marca `status: "undone"`. Idempotente.
- Pode exigir `resumeEntity` novo em `meta-api.ts` se ainda não existir (verificar).

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

- **Unit `auto-executor`:** classificação correta por tipo; gates (pause_ad com 3 dias
  → skip; com 5 dias e R$40 → executa; scale acima do orçamento mensal → skip);
  captura de `previous_state`; idempotência; isolamento de erro por proposal.
  Meta API mockada — nenhum teste bate na API real.
- **Unit gate de orçamento mensal:** com e sem `orcamento_mensal_cents`.
- **Manual em produção (controlado):** rodar `analysis-single` de 1 cliente real,
  conferir no relatório as seções e o desfazer de uma ação reversível.

## Fora de escopo (explícito)

- Otimização semanal/mensal (continuam dry_run).
- Geração/correção de criativos (projeto 2).
- Ações de Google Ads automáticas (ficam `awaiting_approval`).
- Execução automática de ações de estrutura (sempre manual).
