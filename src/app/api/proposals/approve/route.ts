import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { pauseEntity, updateAdsetBudget } from "@/lib/meta-api";
import { pauseGoogleAdGroup, pauseGoogleCampaign, scaleGoogleCampaignBudget } from "@/lib/google-ads-api";
import type { ProposalAction, Proposal } from "@/types/metrics";
import { getReport, saveReport } from "@/lib/reports-store";

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { clientSlug, date, proposalId, action, reject }: { 
    clientSlug: string; 
    date: string;
    proposalId: string;
    action: ProposalAction; 
    reject?: boolean;
  } = await req.json();

  if (!clientSlug || !date || !proposalId) {
    return NextResponse.json({ error: "Faltam parâmetros" }, { status: 400 });
  }

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  let actionMessage = "Ação registrada";
  let finalStatus: Proposal["status"] = reject ? "ignored" : "approved";

  try {
    if (!reject) {
      switch (action.type) {
        // Meta Ads
        case "pause_ad":
          await pauseEntity(action.ad_id, client.meta.access_token);
          actionMessage = "Anúncio pausado com sucesso";
          break;

        case "pause_adset":
          await pauseEntity(action.adset_id, client.meta.access_token);
          actionMessage = "Conjunto pausado com sucesso";
          break;

        case "scale_budget":
          await updateAdsetBudget(action.adset_id, action.new_budget_cents, client.meta.access_token);
          actionMessage = `Orçamento atualizado para R$ ${(action.new_budget_cents / 100).toFixed(2)}/dia`;
          break;

        // Google Ads
        case "pause_google_ad_group":
          if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });
          await pauseGoogleAdGroup(client.google, action.ad_group_id);
          actionMessage = "Grupo de anúncios pausado com sucesso no Google Ads";
          break;

        case "pause_google_campaign":
          if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });
          await pauseGoogleCampaign(client.google, action.campaign_id);
          actionMessage = "Campanha pausada com sucesso no Google Ads";
          break;

        case "scale_google_campaign":
          if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });
          const scaled = await scaleGoogleCampaignBudget(client.google, action.campaign_id, 1.3);
          actionMessage = `Orçamento escalado de R$ ${scaled.old_budget.toFixed(2)} → R$ ${scaled.new_budget.toFixed(2)}/dia (+30%)`;
          break;

        case "none":
          actionMessage = "Registrado (ação manual necessária)";
          break;

        default:
          return NextResponse.json({ error: "Tipo de ação desconhecido" }, { status: 400 });
      }
    } else {
      actionMessage = "Proposta recusada e ignorada";
    }

    // UPDATE DB PERSISTENCE
    const report = await getReport(clientSlug, date);
    if (report) {
      if (report.meta?.proposals) {
        report.meta.proposals = report.meta.proposals.map(p => 
          p.id === proposalId ? { ...p, status: finalStatus, result_message: actionMessage, resolved_at: new Date().toISOString() } : p
        );
      }
      if (report.google?.proposals) {
        report.google.proposals = report.google.proposals.map(p => 
          p.id === proposalId ? { ...p, status: finalStatus, result_message: actionMessage, resolved_at: new Date().toISOString() } : p
        );
      }
      await saveReport(report);
    }

    return NextResponse.json({ success: true, message: actionMessage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao executar ação";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
