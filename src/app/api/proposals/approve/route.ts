import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { pauseEntity, updateAdsetBudget } from "@/lib/meta-api";
import type { ProposalAction } from "@/types/metrics";

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { clientSlug, action }: { clientSlug: string; action: ProposalAction } = await req.json();

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  try {
    switch (action.type) {
      case "pause_ad":
        await pauseEntity(action.ad_id, client.meta.access_token);
        return NextResponse.json({ success: true, message: "Anúncio pausado com sucesso" });

      case "pause_adset":
        await pauseEntity(action.adset_id, client.meta.access_token);
        return NextResponse.json({ success: true, message: "Conjunto pausado com sucesso" });

      case "scale_budget":
        await updateAdsetBudget(action.adset_id, action.new_budget_cents, client.meta.access_token);
        return NextResponse.json({ success: true, message: `Orçamento atualizado para R$ ${(action.new_budget_cents / 100).toFixed(2)}/dia` });

      case "none":
        return NextResponse.json({ success: true, message: "Registrado como aprovado (ação manual necessária)" });

      default:
        return NextResponse.json({ error: "Tipo de ação desconhecido" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao executar ação";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
