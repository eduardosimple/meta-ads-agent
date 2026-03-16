import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { pauseEntity, updateAdsetBudget } from "@/lib/meta-api";
import { pauseGoogleAdGroup, pauseGoogleCampaign, scaleGoogleCampaignBudget } from "@/lib/google-ads-api";
import type { ProposalAction } from "@/types/metrics";

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { clientSlug, action }: { clientSlug: string; action: ProposalAction } = await req.json();

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  try {
    switch (action.type) {
      // Meta Ads
      case "pause_ad":
        await pauseEntity(action.ad_id, client.meta.access_token);
        return NextResponse.json({ success: true, message: "Anúncio pausado com sucesso" });

      case "pause_adset":
        await pauseEntity(action.adset_id, client.meta.access_token);
        return NextResponse.json({ success: true, message: "Conjunto pausado com sucesso" });

      case "scale_budget":
        await updateAdsetBudget(action.adset_id, action.new_budget_cents, client.meta.access_token);
        return NextResponse.json({ success: true, message: `Orçamento atualizado para R$ ${(action.new_budget_cents / 100).toFixed(2)}/dia` });

      // Google Ads
      case "pause_google_ad_group":
        if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });
        await pauseGoogleAdGroup(client.google, action.ad_group_id);
        return NextResponse.json({ success: true, message: "Grupo de anúncios pausado com sucesso no Google Ads" });

      case "pause_google_campaign":
        if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });
        await pauseGoogleCampaign(client.google, action.campaign_id);
        return NextResponse.json({ success: true, message: "Campanha pausada com sucesso no Google Ads" });

      case "scale_google_campaign":
        if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });
        const scaled = await scaleGoogleCampaignBudget(client.google, action.campaign_id, 1.3);
        return NextResponse.json({ success: true, message: `Orçamento escalado de R$ ${scaled.old_budget.toFixed(2)} → R$ ${scaled.new_budget.toFixed(2)}/dia (+30%)` });

      case "none":
        return NextResponse.json({ success: true, message: "Registrado (ação manual necessária no Google Ads)" });

      default:
        return NextResponse.json({ error: "Tipo de ação desconhecido" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao executar ação";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
