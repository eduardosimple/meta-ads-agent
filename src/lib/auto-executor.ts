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
