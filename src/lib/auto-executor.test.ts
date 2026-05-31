import { describe, it, expect } from "vitest";
import { vi, beforeEach } from "vitest";
import { decideAction } from "./auto-executor";
import { executeAutoActions } from "./auto-executor";
import type { Proposal } from "@/types/metrics";
import type { AnalysisResult } from "@/types/metrics";
import type { Client } from "@/types/client";

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
    expect(decideAction(prop({ action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 5, spend: 40 } }), MONTHLY).decision).toBe("auto");
  });
  it("skip quando <4 dias", () => {
    expect(decideAction(prop({ action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 3, spend: 40 } }), MONTHLY).decision).toBe("skip");
  });
  it("skip quando <R$30", () => {
    expect(decideAction(prop({ action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 6, spend: 20 } }), MONTHLY).decision).toBe("skip");
  });
});

describe("decideAction — Meta scale_budget", () => {
  it("executa com >=R$50 e dentro do orcamento", () => {
    expect(decideAction(prop({ verdict: "escalar", action: { type: "scale_budget", adset_id: "s1", new_budget_cents: 6000 }, gate_inputs: { spend: 60 }, budget_sugerido_cents: 6000 }), MONTHLY).decision).toBe("auto");
  });
  it("skip quando novo budget estoura orcamento mensal", () => {
    expect(decideAction(prop({ verdict: "escalar", action: { type: "scale_budget", adset_id: "s1", new_budget_cents: 20000 }, gate_inputs: { spend: 60 }, budget_sugerido_cents: 20000 }), MONTHLY).decision).toBe("skip");
  });
  it("sem orcamento mensal aplica so o gate de R$50", () => {
    expect(decideAction(prop({ verdict: "escalar", action: { type: "scale_budget", adset_id: "s1", new_budget_cents: 20000 }, gate_inputs: { spend: 60 }, budget_sugerido_cents: 20000 }), undefined).decision).toBe("auto");
  });
  it("skip quando spend < R$50", () => {
    expect(decideAction(prop({ verdict: "escalar", action: { type: "scale_budget", adset_id: "s1", new_budget_cents: 6000 }, gate_inputs: { spend: 30 }, budget_sugerido_cents: 6000 }), MONTHLY).decision).toBe("skip");
  });
});

describe("decideAction — Google", () => {
  it("pause_google_ad_group executa com >=R$30", () => {
    expect(decideAction(prop({ action: { type: "pause_google_ad_group", ad_group_id: "g1", customer_id: "c1" }, gate_inputs: { spend: 40 } }), MONTHLY).decision).toBe("auto");
  });
  it("pause_google_ad_group skip com <R$30", () => {
    expect(decideAction(prop({ action: { type: "pause_google_ad_group", ad_group_id: "g1", customer_id: "c1" }, gate_inputs: { spend: 10 } }), MONTHLY).decision).toBe("skip");
  });
  it("scale_google_campaign executa com campaign_spend>=R$50", () => {
    expect(decideAction(prop({ verdict: "escalar", action: { type: "scale_google_campaign", campaign_id: "gc1", customer_id: "c1" }, gate_inputs: { campaign_spend: 80 } }), MONTHLY).decision).toBe("auto");
  });
  it("scale_google_campaign skip com campaign_spend<R$50", () => {
    expect(decideAction(prop({ verdict: "escalar", action: { type: "scale_google_campaign", campaign_id: "gc1", customer_id: "c1" }, gate_inputs: { campaign_spend: 20 } }), MONTHLY).decision).toBe("skip");
  });
  it("pause_google_campaign sempre manual", () => {
    expect(decideAction(prop({ action: { type: "pause_google_campaign", campaign_id: "gc1", customer_id: "c1" }, gate_inputs: { spend: 999 } }), MONTHLY).decision).toBe("manual");
  });
});

describe("decideAction — estrutura manual; none", () => {
  it("create_adset = manual", () => {
    expect(decideAction(prop({ action: { type: "create_adset", campaign_id: "c", adset_name: "x", targeting: {}, optimization_goal: "LEADS", targeting_summary_new: "y" } }), MONTHLY).decision).toBe("manual");
  });
  it("pause_adset = manual", () => {
    expect(decideAction(prop({ action: { type: "pause_adset", adset_id: "s" } }), MONTHLY).decision).toBe("manual");
  });
  it("update_adset_targeting = manual", () => {
    expect(decideAction(prop({ action: { type: "update_adset_targeting", adset_id: "s", targeting: {}, targeting_summary_new: "z" } }), MONTHLY).decision).toBe("manual");
  });
  it("none = no_action (decision 'none')", () => {
    expect(decideAction(prop({ action: { type: "none" } }), MONTHLY).decision).toBe("none");
  });
});

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
  google: { customer_id: "c1", client_id: "ci", client_secret: "cs", refresh_token: "rt", developer_token: "dt" },
  contexto: { orcamento_mensal_cents: 300000 },
} as unknown as Client;

function result(proposals: AnalysisResult["proposals"]): AnalysisResult {
  return { client_slug: "x", analyzed_at: "2026-05-31", proposals, alerts: [], summary_text: "" };
}

describe("executeAutoActions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executa pause_ad elegível → executed + previous_state", async () => {
    const r = await executeAutoActions(client, result([prop({
      action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 6, spend: 50 },
    })]));
    expect(r.proposals[0].status).toBe("executed");
    expect(r.proposals[0].previous_state).toEqual({ kind: "ad_status", ad_id: "a1", old: "ACTIVE" });
  });

  it("gate reprova → skipped_gate", async () => {
    const r = await executeAutoActions(client, result([prop({
      action: { type: "pause_ad", ad_id: "a1" }, gate_inputs: { days_running: 1, spend: 5 },
    })]));
    expect(r.proposals[0].status).toBe("skipped_gate");
  });

  it("estrutura → awaiting_approval", async () => {
    const r = await executeAutoActions(client, result([prop({
      action: { type: "create_adset", campaign_id: "c", adset_name: "x", targeting: {}, optimization_goal: "LEADS", targeting_summary_new: "y" },
    })]));
    expect(r.proposals[0].status).toBe("awaiting_approval");
  });

  it("none → no_action", async () => {
    const r = await executeAutoActions(client, result([prop({ action: { type: "none" } })]));
    expect(r.proposals[0].status).toBe("no_action");
  });

  it("scale_budget elegível → executed + previous_state adset_budget", async () => {
    const r = await executeAutoActions(client, result([prop({
      verdict: "escalar", action: { type: "scale_budget", adset_id: "s1", new_budget_cents: 6000 },
      gate_inputs: { spend: 60 }, budget_sugerido_cents: 6000,
    })]));
    expect(r.proposals[0].status).toBe("executed");
    expect(r.proposals[0].previous_state?.kind).toBe("adset_budget");
  });

  it("pause_google_ad_group elegível → executed + previous_state google_adgroup_status", async () => {
    const r = await executeAutoActions(client, result([prop({
      action: { type: "pause_google_ad_group", ad_group_id: "g1", customer_id: "c1" }, gate_inputs: { spend: 40 },
    })]));
    expect(r.proposals[0].status).toBe("executed");
    expect(r.proposals[0].previous_state?.kind).toBe("google_adgroup_status");
  });

  it("scale_google_campaign elegível → executed + previous_state google_campaign_budget", async () => {
    const r = await executeAutoActions(client, result([prop({
      verdict: "escalar", action: { type: "scale_google_campaign", campaign_id: "gc1", customer_id: "c1" }, gate_inputs: { campaign_spend: 80 },
    })]));
    expect(r.proposals[0].status).toBe("executed");
    expect(r.proposals[0].previous_state?.kind).toBe("google_campaign_budget");
  });

  it("isola erro: falha numa não derruba a outra", async () => {
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
