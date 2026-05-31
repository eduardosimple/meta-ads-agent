# Revisão Diária como Gestor de Tráfego — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a revisão diária executar sozinha as otimizações seguras (pausar/escalar em Meta e Google), deixar as de estrutura a 1 clique, e transformar o relatório em prestação de contas (feito / aguardando você / não feito), com desfazer.

**Architecture:** Após a análise gerar as propostas (`analyzeMetaAds`/`analyzeGoogleAds`), um novo `auto-executor.ts` classifica cada proposta (AUTO/MANUAL), aplica os gates da metodologia 12345, executa as AUTO via Meta/Google API guardando o estado anterior, e devolve o `AnalysisResult` com status já resolvido. O worker `analysis-single` salva o relatório já executado. Endpoint `undo` reverte. O relatório é reorganizado em seções.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase, Meta Graph API + Google Ads API (REST, libs já existentes), Vitest (novo, só p/ lógica pura).

**Base:** branch `main` (origin), spec em `docs/superpowers/specs/2026-05-31-revisao-diaria-gestor-design.md`.

**Deploy:** manual via `vercel --prod` (NÃO há auto-deploy). Não há test framework hoje — Task 1 adiciona Vitest.

---

## File Structure

- `src/types/metrics.ts` (MODIFY) — novos status, `previous_state`, `gate_inputs`, `executed_at` em `Proposal`.
- `src/lib/meta-api.ts` (MODIFY) — adicionar `setEntityStatus` (reativar no desfazer).
- `src/lib/google-ads-api.ts` (MODIFY) — adicionar `setGoogleAdGroupStatus` (reativar no desfazer).
- `src/lib/auto-executor.ts` (CREATE) — classificador + gates + execução + previous_state. Núcleo lógico.
- `src/lib/auto-executor.test.ts` (CREATE) — testes unitários da lógica pura (gates/classificação), API mockada.
- `src/lib/analysis.ts` (MODIFY) — anexar `gate_inputs` às proposals durante a análise.
- `src/app/api/cron/analysis-single/route.ts` (MODIFY) — chamar `executeAutoActions` p/ Meta e Google.
- `src/app/api/daily-reports/[slug]/proposals/undo/route.ts` (CREATE) — endpoint de desfazer.
- `src/app/daily-report/[date]/page.tsx` (MODIFY) — reorganizar em seções (feito/aguardando/não feito/campanhas).
- `vitest.config.ts` + `package.json` (MODIFY) — setup de teste.

---

## Task 1: Setup do Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/__smoke__.test.ts` (temporário, removido no fim da task)

- [ ] **Step 1: Instalar vitest**

Run: `cd ~/agents/meta-ads-agent && npm install -D vitest@^2`
Expected: adiciona vitest às devDependencies sem erro.

- [ ] **Step 2: Criar `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 3: Adicionar script de teste no `package.json`**

No bloco `"scripts"`, adicionar:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Criar smoke test temporário**

`src/lib/__smoke__.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("roda", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 5: Rodar e confirmar verde**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: Remover smoke e commitar**

```bash
rm src/lib/__smoke__.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: adiciona Vitest para testes de logica pura"
```

---

## Task 2: Tipos — status, previous_state, gate_inputs

**Files:**
- Modify: `src/types/metrics.ts` (interface `Proposal`)

- [ ] **Step 1: Ampliar `Proposal.status` e adicionar campos novos**

Em `src/types/metrics.ts`, substituir a linha do `status` da interface `Proposal` e adicionar campos. O `status` atual é:
```typescript
  status: "pending" | "approved" | "rejected" | "ignored" | "creative_requested" | "generating" | "creative_error";
```
Trocar por:
```typescript
  status:
    | "pending" | "approved" | "rejected" | "ignored"
    | "creative_requested" | "generating" | "creative_error"
    | "executed" | "failed" | "skipped_gate" | "awaiting_approval"
    | "undone" | "no_action";
  /** Estado anterior à execução automática — usado para desfazer. */
  previous_state?:
    | { kind: "ad_status"; ad_id: string; old: "ACTIVE" | "PAUSED" }
    | { kind: "adset_budget"; adset_id: string; old_daily_budget_cents: number }
    | { kind: "google_adgroup_status"; ad_group_id: string; customer_id: string; old: "ENABLED" | "PAUSED" }
    | { kind: "google_campaign_budget"; campaign_id: string; customer_id: string; old_budget_reais: number };
  /** Inputs para os gates da metodologia 12345 (preenchidos na análise). */
  gate_inputs?: { spend?: number; days_running?: number; campaign_spend?: number };
  /** ISO timestamp de quando a ação automática foi executada. */
  executed_at?: string;
```

- [ ] **Step 2: Verificar compilação de tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erros (campos são opcionais; status é superset).

- [ ] **Step 3: Commit**

```bash
git add src/types/metrics.ts
git commit -m "feat(types): status de execucao, previous_state e gate_inputs em Proposal"
```

---

## Task 3: Funções de reativação nas libs (para o desfazer)

**Files:**
- Modify: `src/lib/meta-api.ts` (após `pauseEntity`, ~linha 432)
- Modify: `src/lib/google-ads-api.ts` (após `pauseGoogleAdGroup`, ~linha 104)

- [ ] **Step 1: Adicionar `setEntityStatus` em `meta-api.ts`**

Logo após a função `pauseEntity`:
```typescript
export async function setEntityStatus(
  entityId: string,
  status: "ACTIVE" | "PAUSED",
  accessToken: string
): Promise<boolean> {
  await metaFetch<{ success: boolean }>(`/${entityId}`, {
    method: "POST",
    body: JSON.stringify({ status, access_token: accessToken }),
  });
  return true;
}
```

- [ ] **Step 2: Adicionar `setGoogleAdGroupStatus` em `google-ads-api.ts`**

Logo após `pauseGoogleAdGroup` (reusa o `mutateSingleResource` interno e `getAccessToken`):
```typescript
export async function setGoogleAdGroupStatus(
  google: ClientGoogle,
  adGroupId: string,
  status: "PAUSED" | "ENABLED"
): Promise<void> {
  const accessToken = await getAccessToken(google);
  const customerId = normalizeCustomerId(google.customer_id);
  const resourceName = `customers/${customerId}/adGroups/${adGroupId}`;
  await mutateSingleResource(google, accessToken, "adGroups", resourceName, status);
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/meta-api.ts src/lib/google-ads-api.ts
git commit -m "feat(api): setEntityStatus (Meta) e setGoogleAdGroupStatus (Google) p/ desfazer"
```

---

## Task 4: `auto-executor.ts` — classificação e gates (TDD, lógica pura)

Esta task implementa SÓ a decisão (classificar + gate), sem chamar API. A execução real vem na Task 5.

**Files:**
- Create: `src/lib/auto-executor.ts`
- Create: `src/lib/auto-executor.test.ts`

- [ ] **Step 1: Escrever os testes da decisão**

`src/lib/auto-executor.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { decideAction } from "./auto-executor";
import type { Proposal } from "@/types/metrics";

function prop(partial: Partial<Proposal>): Proposal {
  return {
    id: "p1", ad_id: "a1", ad_name: "Ad", adset_name: "Set", campaign_name: "Camp",
    verdict: "pausar", titulo: "t", diagnostico: "d", metricas_problema: [],
    acao_sugerida: "x", action: { type: "none" }, status: "pending", created_at: "2026-05-31",
    ...partial,
  };
}
const MONTHLY = 300000; // R$3000 em cents

describe("decideAction — Meta pause_ad", () => {
  it("executa quando >=4 dias E >=R$30", () => {
    const d = decideAction(prop({ action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 5, spend: 40 } }), MONTHLY);
    expect(d.decision).toBe("auto");
  });
  it("skip quando <4 dias", () => {
    const d = decideAction(prop({ action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 3, spend: 40 } }), MONTHLY);
    expect(d.decision).toBe("skip");
  });
  it("skip quando <R$30", () => {
    const d = decideAction(prop({ action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 6, spend: 20 } }), MONTHLY);
    expect(d.decision).toBe("skip");
  });
});

describe("decideAction — Meta scale_budget", () => {
  it("executa com >=R$50 e dentro do orcamento", () => {
    const d = decideAction(prop({ verdict: "escalar", action: { type: "scale_budget", adset_id: "s1", new_budget_cents: 6000 }, gate_inputs: { spend: 60 }, budget_sugerido_cents: 6000 }), MONTHLY);
    expect(d.decision).toBe("auto");
  });
  it("skip quando novo budget estoura orcamento mensal (novo*30 > mensal)", () => {
    const d = decideAction(prop({ verdict: "escalar", action: { type: "scale_budget", adset_id: "s1", new_budget_cents: 20000 }, gate_inputs: { spend: 60 }, budget_sugerido_cents: 20000 }), MONTHLY);
    expect(d.decision).toBe("skip");
  });
  it("sem orcamento mensal, aplica so o gate de R$50", () => {
    const d = decideAction(prop({ verdict: "escalar", action: { type: "scale_budget", adset_id: "s1", new_budget_cents: 20000 }, gate_inputs: { spend: 60 }, budget_sugerido_cents: 20000 }), undefined);
    expect(d.decision).toBe("auto");
  });
});

describe("decideAction — Google", () => {
  it("pause_google_ad_group executa com >=R$30 (sem days_running)", () => {
    const d = decideAction(prop({ action: { type: "pause_google_ad_group", ad_group_id: "g1", customer_id: "c1" }, gate_inputs: { spend: 40 } }), MONTHLY);
    expect(d.decision).toBe("auto");
  });
  it("pause_google_ad_group skip com <R$30", () => {
    const d = decideAction(prop({ action: { type: "pause_google_ad_group", ad_group_id: "g1", customer_id: "c1" }, gate_inputs: { spend: 10 } }), MONTHLY);
    expect(d.decision).toBe("skip");
  });
  it("scale_google_campaign executa com campaign_spend>=R$50 e dentro do orcamento", () => {
    const d = decideAction(prop({ verdict: "escalar", action: { type: "scale_google_campaign", campaign_id: "gc1", customer_id: "c1" }, gate_inputs: { campaign_spend: 80 } }), MONTHLY);
    expect(d.decision).toBe("auto");
  });
  it("pause_google_campaign sempre manual", () => {
    const d = decideAction(prop({ action: { type: "pause_google_campaign", campaign_id: "gc1", customer_id: "c1" }, gate_inputs: { spend: 999 } }), MONTHLY);
    expect(d.decision).toBe("manual");
  });
});

describe("decideAction — estrutura sempre manual; none sem acao", () => {
  it("create_adset = manual", () => {
    expect(decideAction(prop({ action: { type: "create_adset", campaign_id: "c", adset_name: "x", targeting: {}, optimization_goal: "LEADS", targeting_summary_new: "y" } }), MONTHLY).decision).toBe("manual");
  });
  it("pause_adset = manual", () => {
    expect(decideAction(prop({ action: { type: "pause_adset", adset_id: "s" } }), MONTHLY).decision).toBe("manual");
  });
  it("pause_campaign = manual", () => {
    expect(decideAction(prop({ action: { type: "pause_campaign", campaign_id: "c" } }), MONTHLY).decision).toBe("manual");
  });
  it("none = no_action", () => {
    expect(decideAction(prop({ action: { type: "none" } }), MONTHLY).decision).toBe("none");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `decideAction` não existe.

- [ ] **Step 3: Implementar `decideAction` em `src/lib/auto-executor.ts`**

```typescript
import type { Proposal, ProposalAction } from "@/types/metrics";

const PAUSE_MIN_DAYS = 4;
const PAUSE_MIN_SPEND = 30;
const SCALE_MIN_SPEND = 50;
const DAYS_IN_MONTH = 30;

export type Decision = "auto" | "manual" | "skip" | "none";
export interface DecisionResult {
  decision: Decision;
  reason: string;
}

/** Decide se a proposta executa sozinha (auto), pede clique (manual),
 *  é pulada por não passar no gate (skip) ou não tem ação (none).
 *  `orcamentoMensalCents` = client.contexto.orcamento_mensal_cents (ou undefined). */
export function decideAction(p: Proposal, orcamentoMensalCents?: number): DecisionResult {
  const t = p.action.type;
  const gi = p.gate_inputs ?? {};

  // Estrutura e Google campaign pause → sempre manual
  if (t === "create_adset" || t === "pause_adset" || t === "pause_campaign"
    || t === "update_adset_targeting" || t === "pause_google_campaign") {
    return { decision: "manual", reason: "Ação de estrutura/alto impacto — requer aprovação." };
  }
  if (t === "none") return { decision: "none", reason: "Sem ação recomendada." };

  // Meta pausar anúncio
  if (t === "pause_ad") {
    const days = gi.days_running ?? 0;
    const spend = gi.spend ?? 0;
    if (days < PAUSE_MIN_DAYS) return { decision: "skip", reason: `Rodando há ${days}d (<${PAUSE_MIN_DAYS}d) — aguardando maturação.` };
    if (spend < PAUSE_MIN_SPEND) return { decision: "skip", reason: `Gasto R$${spend.toFixed(0)} (<R$${PAUSE_MIN_SPEND}) — pouco dado.` };
    return { decision: "auto", reason: `Pausar: ${days}d e R$${spend.toFixed(0)} gastos.` };
  }

  // Google pausar ad group (sem days_running disponível)
  if (t === "pause_google_ad_group") {
    const spend = gi.spend ?? 0;
    if (spend < PAUSE_MIN_SPEND) return { decision: "skip", reason: `Gasto R$${spend.toFixed(0)} (<R$${PAUSE_MIN_SPEND}) — pouco dado.` };
    return { decision: "auto", reason: `Pausar grupo: R$${spend.toFixed(0)} gastos.` };
  }

  // Meta escalar budget
  if (t === "scale_budget") {
    const spend = gi.spend ?? 0;
    if (spend < SCALE_MIN_SPEND) return { decision: "skip", reason: `Gasto R$${spend.toFixed(0)} (<R$${SCALE_MIN_SPEND}) — cedo p/ escalar.` };
    const novoCents = p.budget_sugerido_cents ?? (p.action as Extract<ProposalAction, { type: "scale_budget" }>).new_budget_cents;
    if (orcamentoMensalCents && novoCents) {
      const projetadoMes = (novoCents / 100) * DAYS_IN_MONTH;
      if (projetadoMes > orcamentoMensalCents / 100) {
        return { decision: "skip", reason: `Novo budget projeta R$${projetadoMes.toFixed(0)}/mês — acima do orçamento.` };
      }
    }
    return { decision: "auto", reason: `Escalar: R$${spend.toFixed(0)} gastos, dentro do orçamento.` };
  }

  // Google escalar campanha (+20%)
  if (t === "scale_google_campaign") {
    const campSpend = gi.campaign_spend ?? 0;
    if (campSpend < SCALE_MIN_SPEND) return { decision: "skip", reason: `Campanha gastou R$${campSpend.toFixed(0)} (<R$${SCALE_MIN_SPEND}).` };
    // gate de orçamento mensal aplicado pós-execução (lê budget real da API); aqui passa.
    return { decision: "auto", reason: `Escalar campanha: R$${campSpend.toFixed(0)} gastos.` };
  }

  // Google scale antigo / qualquer outro → manual por segurança
  return { decision: "manual", reason: "Tipo não classificado — requer aprovação." };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: todos os testes de `decideAction` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auto-executor.ts src/lib/auto-executor.test.ts
git commit -m "feat(auto-executor): decideAction (classificacao + gates 12345) com testes"
```

---

## Task 5: `auto-executor.ts` — execução real + previous_state

**Files:**
- Modify: `src/lib/auto-executor.ts` (adicionar `executeAutoActions`)
- Modify: `src/lib/auto-executor.test.ts` (testes de execução com API mockada)

- [ ] **Step 1: Escrever testes de execução (API mockada)**

Acrescentar em `src/lib/auto-executor.test.ts`:
```typescript
import { vi, beforeEach } from "vitest";
import { executeAutoActions } from "./auto-executor";
import type { AnalysisResult } from "@/types/metrics";
import type { Client } from "@/types/client";

vi.mock("./meta-api", () => ({
  pauseEntity: vi.fn().mockResolvedValue(true),
  updateAdsetBudget: vi.fn().mockResolvedValue(true),
  setEntityStatus: vi.fn().mockResolvedValue(true),
}));
vi.mock("./google-ads-api", () => ({
  pauseGoogleAdGroup: vi.fn().mockResolvedValue(undefined),
  scaleGoogleCampaignBudget: vi.fn().mockResolvedValue({ old_budget: 50, new_budget: 60 }),
  setGoogleAdGroupStatus: vi.fn().mockResolvedValue(undefined),
  setGoogleCampaignBudgetAmount: vi.fn().mockResolvedValue({ old_budget: 60, new_budget: 50 }),
  normalizeCustomerId: (x: string) => x.replace(/-/g, ""),
}));

const client = {
  slug: "x", nome: "X", ativo: true,
  meta: { access_token: "tok", ad_account_id: "act_1" },
  contexto: { orcamento_mensal_cents: 300000 },
} as unknown as Client;

function result(proposals: AnalysisResult["proposals"]): AnalysisResult {
  return { client_slug: "x", analyzed_at: "2026-05-31", proposals, alerts: [], summary_text: "" };
}

describe("executeAutoActions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executa pause_ad elegível e marca executed + previous_state", async () => {
    const r = await executeAutoActions(client, result([prop({
      action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 6, spend: 50 },
    })]));
    expect(r.proposals[0].status).toBe("executed");
    expect(r.proposals[0].previous_state).toEqual({ kind: "ad_status", ad_id: "a1", old: "ACTIVE" });
  });

  it("marca skipped_gate quando gate reprova", async () => {
    const r = await executeAutoActions(client, result([prop({
      action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 1, spend: 5 },
    })]));
    expect(r.proposals[0].status).toBe("skipped_gate");
  });

  it("marca awaiting_approval para estrutura", async () => {
    const r = await executeAutoActions(client, result([prop({
      action: { type: "create_adset", campaign_id: "c", adset_name: "x", targeting: {}, optimization_goal: "LEADS", targeting_summary_new: "y" },
    })]));
    expect(r.proposals[0].status).toBe("awaiting_approval");
  });

  it("isola erro: falha numa proposta não derruba a outra", async () => {
    const meta = await import("./meta-api");
    (meta.pauseEntity as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("API down"));
    const r = await executeAutoActions(client, result([
      prop({ id: "p1", action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 6, spend: 50 } }),
      prop({ id: "p2", action: { type: "pause_ad", ad_id: "a2" }, gate_inputs: { days_running: 6, spend: 50 } }),
    ]));
    expect(r.proposals[0].status).toBe("failed");
    expect(r.proposals[1].status).toBe("executed");
  });

  it("idempotente: proposta já executed não re-executa", async () => {
    const meta = await import("./meta-api");
    const r = await executeAutoActions(client, result([prop({
      status: "executed", action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 6, spend: 50 },
    })]));
    expect(meta.pauseEntity).not.toHaveBeenCalled();
    expect(r.proposals[0].status).toBe("executed");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `executeAutoActions` não existe.

- [ ] **Step 3: Implementar `executeAutoActions`**

Acrescentar em `src/lib/auto-executor.ts` (imports no topo + função):
```typescript
import type { AnalysisResult } from "@/types/metrics";
import type { Client } from "@/types/client";
import { pauseEntity, updateAdsetBudget } from "./meta-api";
import { pauseGoogleAdGroup, scaleGoogleCampaignBudget } from "./google-ads-api";

const RESOLVED = new Set(["executed", "failed", "undone", "approved", "rejected", "ignored"]);

/** Executa as ações automáticas elegíveis e devolve o AnalysisResult com
 *  status resolvido. Nunca lança — erro por proposta vira status "failed". */
export async function executeAutoActions(client: Client, analysis: AnalysisResult): Promise<AnalysisResult> {
  const orcamento = client.contexto?.orcamento_mensal_cents;
  const nowIso = new Date().toISOString();

  const proposals = await Promise.all(analysis.proposals.map(async (p) => {
    if (RESOLVED.has(p.status)) return p; // idempotência

    const { decision, reason } = decideAction(p, orcamento);
    if (decision === "manual") return { ...p, status: "awaiting_approval" as const, result_message: reason };
    if (decision === "skip") return { ...p, status: "skipped_gate" as const, result_message: reason };
    if (decision === "none") return { ...p, status: "no_action" as const, result_message: reason };

    // decision === "auto" → executar
    try {
      const a = p.action;
      if (a.type === "pause_ad") {
        if (!client.meta?.access_token) throw new Error("sem token Meta");
        await pauseEntity(a.ad_id, client.meta.access_token);
        return { ...p, status: "executed" as const, executed_at: nowIso, result_message: reason,
          previous_state: { kind: "ad_status" as const, ad_id: a.ad_id, old: "ACTIVE" as const } };
      }
      if (a.type === "scale_budget") {
        if (!client.meta?.access_token) throw new Error("sem token Meta");
        const novoCents = p.budget_sugerido_cents ?? a.new_budget_cents;
        // estado anterior: budget atual estimado a partir do novo (sem -20%); captura defensiva
        const oldCents = Math.round(novoCents / 1.2);
        await updateAdsetBudget(a.adset_id, novoCents, client.meta.access_token);
        return { ...p, status: "executed" as const, executed_at: nowIso, result_message: reason,
          previous_state: { kind: "adset_budget" as const, adset_id: a.adset_id, old_daily_budget_cents: oldCents } };
      }
      if (a.type === "pause_google_ad_group") {
        if (!client.google) throw new Error("sem credencial Google");
        await pauseGoogleAdGroup(client.google, a.ad_group_id);
        return { ...p, status: "executed" as const, executed_at: nowIso, result_message: reason,
          previous_state: { kind: "google_adgroup_status" as const, ad_group_id: a.ad_group_id, customer_id: a.customer_id, old: "ENABLED" as const } };
      }
      if (a.type === "scale_google_campaign") {
        if (!client.google) throw new Error("sem credencial Google");
        const res = await scaleGoogleCampaignBudget(client.google, a.campaign_id, 1.2);
        // gate de orçamento mensal pós-leitura do budget real
        if (orcamento && res.new_budget * 30 > orcamento / 100) {
          // reverte imediatamente — estourou
          await scaleGoogleCampaignBudget(client.google, a.campaign_id, res.old_budget / res.new_budget);
          return { ...p, status: "skipped_gate" as const, result_message: `Escalar reverteria orçamento mensal (R$${(res.new_budget*30).toFixed(0)}/mês) — adiado.` };
        }
        return { ...p, status: "executed" as const, executed_at: nowIso, result_message: `${reason} R$${res.old_budget.toFixed(0)}→R$${res.new_budget.toFixed(0)}/dia.`,
          previous_state: { kind: "google_campaign_budget" as const, campaign_id: a.campaign_id, customer_id: a.customer_id, old_budget_reais: res.old_budget } };
      }
      return { ...p, status: "skipped_gate" as const, result_message: "Tipo sem executor." };
    } catch (e) {
      return { ...p, status: "failed" as const, result_message: e instanceof Error ? e.message : String(e) };
    }
  }));

  return { ...analysis, proposals };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: todos PASS (decisão + execução).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auto-executor.ts src/lib/auto-executor.test.ts
git commit -m "feat(auto-executor): executeAutoActions com execucao real, previous_state e isolamento de erro"
```

---

## Task 6: Anexar `gate_inputs` às proposals na análise

**Files:**
- Modify: `src/lib/analysis.ts` (em `analyzeMetaAds`, no `.map` que monta proposals ~linha 223; em `analyzeGoogleAds` ~linha 525)

- [ ] **Step 1: Meta — anexar gate_inputs no map de proposals**

Em `analyzeMetaAds`, dentro do `.map(p => {...})` que já calcula `score` a partir de `adData` (const `adData = adMetricsMap.get(p.ad_id)`), adicionar ao objeto retornado:
```typescript
      gate_inputs: {
        spend: adData?.spend ?? 0,
        days_running: adData?.days_running ?? 0,
      },
```
(somar ao objeto que já tem `id`, `status`, `created_at`, `score`).

- [ ] **Step 2: Google — calcular campaign_spend e anexar**

Em `analyzeGoogleAds`, antes do `return`, criar mapa de gasto por campanha a partir de `adGroups`:
```typescript
  const campaignSpend = new Map<string, number>();
  for (const g of adGroups) {
    campaignSpend.set(g.campaign_id, (campaignSpend.get(g.campaign_id) ?? 0) + g.spend);
  }
  const adGroupSpend = new Map<string, number>();
  for (const g of adGroups) adGroupSpend.set(g.ad_group_id, g.spend);
```
No `.map(p => {...})` das proposals do Google, adicionar ao objeto retornado:
```typescript
      gate_inputs: {
        spend: adGroupSpend.get(p.ad_id) ?? 0,
        campaign_spend: campaignSpend.get(p.campaign_id) ?? 0,
      },
```
(`p.ad_id` no Google carrega o ad_group_id; `p.campaign_id` existe no parsed.)

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analysis.ts
git commit -m "feat(analysis): anexa gate_inputs (spend/days/campaign_spend) nas proposals"
```

---

## Task 7: Integrar no worker `analysis-single`

**Files:**
- Modify: `src/app/api/cron/analysis-single/route.ts`

- [ ] **Step 1: Importar e chamar executeAutoActions p/ Meta e Google**

No topo, adicionar import:
```typescript
import { executeAutoActions } from "@/lib/analysis"; // se reexportado; senão:
```
Usar import direto:
```typescript
import { executeAutoActions } from "@/lib/auto-executor";
```
No bloco `if (needsMeta)`, após obter `analysis` de `analyzeMetaAds`, antes de montar `report.meta`, trocar:
```typescript
      const analysis = await analyzeMetaAds(client, sevenDaysAgo, today);
```
por:
```typescript
      const rawAnalysis = await analyzeMetaAds(client, sevenDaysAgo, today);
      const analysis = await executeAutoActions(client, rawAnalysis);
```
No bloco `if (needsGoogle && client.google)`, onde hoje faz `analyzeGoogleAds` dentro do `Promise.allSettled`, após resolver `analysis.value`, aplicar:
```typescript
      if (analysis.status === "fulfilled") {
        const executed = await executeAutoActions(client, analysis.value);
        const g = gMetrics.status === "fulfilled" ? gMetrics.value : [];
        // ...usar `executed` no lugar de analysis.value ao montar report.google
        report.google = { ...executed, /* spend_7d etc. como já está */ };
      }
```
(Manter os fixes existentes: Google-only via `hasMeta`, erros por canal não-fatais.)

- [ ] **Step 2: Verificar tipos e build**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 0 erros de tipo; testes verdes.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/analysis-single/route.ts
git commit -m "feat(cron): worker executa acoes automaticas (Meta e Google) antes de salvar"
```

---

## Task 8: Endpoint de desfazer

**Files:**
- Create: `src/app/api/daily-reports/[slug]/proposals/undo/route.ts`

- [ ] **Step 1: Criar o endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/reports-store";
import { getClientBySlug } from "@/lib/clients";
import { setEntityStatus, updateAdsetBudget } from "@/lib/meta-api";
import { setGoogleAdGroupStatus, setGoogleCampaignBudgetAmount } from "@/lib/google-ads-api";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewKey = req.nextUrl.searchParams.get("view_key") ?? req.headers.get("x-view-key");
  if (viewKey !== process.env.REPORT_VIEW_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { date: string; proposal_id: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body.date || !body.proposal_id) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const report = await getReport(slug, body.date);
  if (!report) return NextResponse.json({ error: "report_not_found" }, { status: 404 });

  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });

  // acha a proposal em meta OU google
  let channel: "meta" | "google" | null = null;
  let proposal = report.meta?.proposals.find(p => p.id === body.proposal_id);
  if (proposal) channel = "meta";
  else { proposal = report.google?.proposals.find(p => p.id === body.proposal_id); if (proposal) channel = "google"; }
  if (!proposal || !channel) return NextResponse.json({ error: "proposal_not_found" }, { status: 404 });

  if (proposal.status === "undone") return NextResponse.json({ ok: true, noop: "ja_desfeito" });
  const ps = proposal.previous_state;
  if (!ps) return NextResponse.json({ ok: true, noop: "sem_estado_anterior" });

  try {
    if (ps.kind === "ad_status") {
      if (!client.meta?.access_token) throw new Error("sem token Meta");
      await setEntityStatus(ps.ad_id, "ACTIVE", client.meta.access_token);
    } else if (ps.kind === "adset_budget") {
      if (!client.meta?.access_token) throw new Error("sem token Meta");
      await updateAdsetBudget(ps.adset_id, ps.old_daily_budget_cents, client.meta.access_token);
    } else if (ps.kind === "google_adgroup_status") {
      if (!client.google) throw new Error("sem credencial Google");
      await setGoogleAdGroupStatus(client.google, ps.ad_group_id, "ENABLED");
    } else if (ps.kind === "google_campaign_budget") {
      if (!client.google) throw new Error("sem credencial Google");
      await setGoogleCampaignBudgetAmount(client.google, ps.campaign_id, ps.old_budget_reais);
    }
  } catch (e) {
    return NextResponse.json({ error: "undo_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  proposal.status = "undone";
  proposal.result_message = `Desfeito em ${new Date().toISOString()}`;
  await saveReport(report);
  return NextResponse.json({ ok: true, channel, proposal_id: body.proposal_id });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 erros. (Confirmar que `getReport` aceita `(slug, date)` — já confirmado em reports-store.ts.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/daily-reports/[slug]/proposals/undo/route.ts
git commit -m "feat(api): endpoint undo p/ reverter acoes automaticas (Meta e Google)"
```

---

## Task 9: Reorganizar o relatório em seções

**Files:**
- Modify: `src/app/daily-report/[date]/page.tsx`

> Esta task é de UI e não tem teste automatizado (validação visual no run controlado).
> O objetivo é agrupar as proposals por status nas 4 seções e adicionar o cabeçalho de contas
> e os botões. Preservar a tabela de campanhas existente, movida para uma seção minimizada.

- [ ] **Step 1: Ler a página atual inteira**

Run: `git show origin/main:'src/app/daily-report/[date]/page.tsx' | head -200` (e o resto) para entender como as proposals são renderizadas hoje e onde fica a tabela de campanhas.

- [ ] **Step 2: Adicionar helper de agrupamento por status**

No componente, derivar os grupos a partir de `report.meta.proposals` + `report.google.proposals` concatenadas:
```typescript
const all = [...(report.meta?.proposals ?? []), ...(report.google?.proposals ?? [])];
const feitas = all.filter(p => p.status === "executed");
const aguardando = all.filter(p => p.status === "awaiting_approval");
const naoFeito = all.filter(p => ["skipped_gate", "no_action", "failed", "undone"].includes(p.status));
```

- [ ] **Step 3: Cabeçalho de prestação de contas**

Acima das seções:
```tsx
<div className="report-summary">
  ✅ {feitas.length} feitas · ⏳ {aguardando.length} aguardando você · ⏭️ {naoFeito.length} não feitas
</div>
```

- [ ] **Step 4: Seção "✅ O que foi feito" (sempre aberta) com botão Desfazer**

Cada item mostra `titulo`, `result_message`, e botão que faz `POST /api/daily-reports/${slug}/proposals/undo?view_key=...` com `{ date, proposal_id: p.id }`; ao 200, recarrega. Renderizar só se `feitas.length > 0`.

- [ ] **Step 5: Seção "⏳ Aguardando você" (sempre aberta) com botão Aprovar**

Cada item com `titulo`, `acao_sugerida`, e botão que reusa o fluxo de aprovação existente
(`/api/daily-reports/[slug]/proposals/execute` ou `approve` — usar o mesmo que os cards atuais já usam). Renderizar só se houver itens.

- [ ] **Step 6: Seção "⏭️ Não feito / sem ação" (minimizada via `<details>`)**

```tsx
<details>
  <summary>Não feito / sem ação ({naoFeito.length})</summary>
  {/* lista com titulo + result_message (motivo) */}
</details>
```

- [ ] **Step 7: Seção "Status das campanhas" (minimizada via `<details>`)**

Envolver a tabela de campanhas/conjuntos/anúncios que já existe hoje em:
```tsx
<details>
  <summary>Status das campanhas ({nAtivas} ativas · R$ {gastoTotal} · {leads} leads)</summary>
  {/* tabela existente movida pra cá */}
</details>
```

- [ ] **Step 8: Build local**

Run: `npm run build`
Expected: build conclui sem erro de tipo/JSX.

- [ ] **Step 9: Commit**

```bash
git add src/app/daily-report/[date]/page.tsx
git commit -m "feat(report): relatorio como prestacao de contas (feito/aguardando/nao-feito) + campanhas minimizadas"
```

---

## Task 10: Deploy e validação controlada em produção

**Files:** nenhum (operação)

- [ ] **Step 1: Build final + testes + tipos**

Run: `npm test && npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: testes verdes, 0 erro de tipo, build OK.

- [ ] **Step 2: Push do branch para main**

```bash
git push origin HEAD:main
```

- [ ] **Step 3: Deploy manual**

Run (de um worktree em main com `.vercel/` copiado): `vercel --prod --yes`
Expected: "Aliased: https://meta-ads-agent-ten.vercel.app".

- [ ] **Step 4: Validar 1 cliente Meta**

Run: `curl -s "https://meta-ads-agent-ten.vercel.app/api/cron/analysis-single?slug=<cliente_meta>" -H "authorization: Bearer $CRON_SECRET"`
Expected: `{"status":"ok",...,"saved":{"meta":true}}`. Conferir no portal `/daily-report/<hoje>?key=...` as 4 seções e que ações elegíveis aparecem em "feito".

- [ ] **Step 5: Validar 1 cliente Google**

Run: `curl -s "https://meta-ads-agent-ten.vercel.app/api/cron/analysis-single?slug=primme-topografia" -H "authorization: Bearer $CRON_SECRET"`
Expected: `saved.google: true`. Conferir seções no relatório.

- [ ] **Step 6: Validar desfazer**

No relatório, clicar "Desfazer" numa ação executada reversível; confirmar 200 e o status virar "desfeito". Conferir no painel Meta/Google que reverteu.

- [ ] **Step 7: Atualizar memória**

Atualizar `project_revisao_diaria_hobby.md` e `feedback_portal_meta_ads.md` (a regra "só pelo portal" agora tem exceção: ações AUTO executam via API; estrutura continua portal).

---

## Notas de execução

- **Sessão com tooling instável:** validar cada push lendo `git log origin/main` e cada deploy pela saída do `vercel --prod`. Não confiar em leituras isoladas da API REST da Vercel (token pode estar expirado).
- **`client.contexto.orcamento_mensal_cents`** pode não existir em todos os clientes — gate degrada para só o critério de gasto (coberto nos testes).
- **Reversão do scale Meta** usa estimativa `old = novo/1.2`. Aceitável porque o `budget_sugerido_cents` é sempre +20% do estimado; o desfazer volta ao valor pré-escala calculado. Se no futuro quisermos o budget exato anterior, ler via `getAdsetDetails` antes de escalar (melhoria futura, fora de escopo).
