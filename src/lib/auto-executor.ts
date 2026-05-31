import type { Proposal, ProposalAction } from "@/types/metrics";
import type { AnalysisResult } from "@/types/metrics";
import type { Client } from "@/types/client";
import { pauseEntity, updateAdsetBudget } from "./meta-api";
import { pauseGoogleAdGroup, scaleGoogleCampaignBudget } from "./google-ads-api";

const PAUSE_MIN_DAYS = 4;
const PAUSE_MIN_SPEND = 30;
const SCALE_MIN_SPEND = 50;
const DAYS_IN_MONTH = 30;

export type Decision = "auto" | "manual" | "skip" | "none";
export interface DecisionResult {
  decision: Decision;
  reason: string;
}

/** Decide o destino de uma proposta. `orcamentoMensalCents` =
 *  client.contexto.orcamento_mensal_cents (ou undefined se não cadastrado). */
export function decideAction(p: Proposal, orcamentoMensalCents?: number): DecisionResult {
  const t = p.action.type;
  const gi = p.gate_inputs ?? {};

  if (t === "create_adset" || t === "pause_adset"
    || t === "update_adset_targeting" || t === "pause_google_campaign") {
    return { decision: "manual", reason: "Ação de estrutura/alto impacto — requer aprovação." };
  }
  if (t === "none") return { decision: "none", reason: "Sem ação recomendada." };

  if (t === "pause_ad") {
    const days = gi.days_running ?? 0;
    const spend = gi.spend ?? 0;
    if (days < PAUSE_MIN_DAYS) return { decision: "skip", reason: `Rodando há ${days}d (<${PAUSE_MIN_DAYS}d) — aguardando maturação.` };
    if (spend < PAUSE_MIN_SPEND) return { decision: "skip", reason: `Gasto R$${spend.toFixed(0)} (<R$${PAUSE_MIN_SPEND}) — pouco dado.` };
    return { decision: "auto", reason: `Pausar: ${days}d e R$${spend.toFixed(0)} gastos.` };
  }

  if (t === "pause_google_ad_group") {
    const spend = gi.spend ?? 0;
    if (spend < PAUSE_MIN_SPEND) return { decision: "skip", reason: `Gasto R$${spend.toFixed(0)} (<R$${PAUSE_MIN_SPEND}) — pouco dado.` };
    return { decision: "auto", reason: `Pausar grupo: R$${spend.toFixed(0)} gastos.` };
  }

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

  if (t === "scale_google_campaign") {
    const campSpend = gi.campaign_spend ?? 0;
    if (campSpend < SCALE_MIN_SPEND) return { decision: "skip", reason: `Campanha gastou R$${campSpend.toFixed(0)} (<R$${SCALE_MIN_SPEND}).` };
    return { decision: "auto", reason: `Escalar campanha: R$${campSpend.toFixed(0)} gastos.` };
  }

  return { decision: "manual", reason: "Tipo não classificado — requer aprovação." };
}

const RESOLVED = new Set(["executed", "failed", "undone", "approved", "rejected", "ignored"]);

/** Executa as ações automáticas elegíveis e devolve o AnalysisResult com
 *  status resolvido. Nunca lança — erro por proposta vira status "failed". */
export async function executeAutoActions(client: Client, analysis: AnalysisResult): Promise<AnalysisResult> {
  const orcamento = client.contexto?.orcamento_mensal_cents;
  const nowIso = new Date().toISOString();

  const proposals = await Promise.all(analysis.proposals.map(async (p) => {
    if (RESOLVED.has(p.status)) return p;

    const { decision, reason } = decideAction(p, orcamento);
    if (decision === "manual") return { ...p, status: "awaiting_approval" as const, result_message: reason };
    if (decision === "skip") return { ...p, status: "skipped_gate" as const, result_message: reason };
    if (decision === "none") return { ...p, status: "no_action" as const, result_message: reason };

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
        if (orcamento && res.new_budget * 30 > orcamento / 100) {
          await scaleGoogleCampaignBudget(client.google, a.campaign_id, res.old_budget / res.new_budget);
          return { ...p, status: "skipped_gate" as const, result_message: `Escalar reverteria orçamento mensal (R$${(res.new_budget*30).toFixed(0)}/mês) — adiado.` };
        }
        return { ...p, status: "executed" as const, executed_at: nowIso,
          result_message: `${reason} R$${res.old_budget.toFixed(0)}→R$${res.new_budget.toFixed(0)}/dia.`,
          previous_state: { kind: "google_campaign_budget" as const, campaign_id: a.campaign_id, customer_id: a.customer_id, old_budget_reais: res.old_budget } };
      }
      return { ...p, status: "skipped_gate" as const, result_message: "Tipo sem executor." };
    } catch (e) {
      return { ...p, status: "failed" as const, result_message: e instanceof Error ? e.message : String(e) };
    }
  }));

  return { ...analysis, proposals };
}
