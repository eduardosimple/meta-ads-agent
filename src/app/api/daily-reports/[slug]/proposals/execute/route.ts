import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/reports-store";
import { getClientBySlug } from "@/lib/clients";
import { pauseEntity, updateAdsetBudget, updateAdsetTargeting, createAdset } from "@/lib/meta-api";

// POST /api/daily-reports/[slug]/proposals/execute
// Body: { date, ad_id, platform, action_type: "pause" | "scale" }
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const reportKey = req.headers.get("x-report-key");
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const reportSecret = process.env.REPORT_VIEW_SECRET;
  const valid =
    (!!reportKey && !!reportSecret && reportKey === reportSecret) ||
    (!!authHeader && authHeader === `Bearer ${secret}`);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    date: string;
    ad_id: string;
    platform: "meta" | "google";
    action_type: "pause" | "scale" | "update_targeting" | "create_adset";
  };

  const { date, ad_id, platform, action_type } = body;
  if (!date || !ad_id || !platform || !action_type)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  if (platform !== "meta")
    return NextResponse.json({ error: "Apenas Meta suportado para execução direta" }, { status: 400 });

  const report = await getReport(params.slug, date);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const analysis = report.meta;
  if (!analysis) return NextResponse.json({ error: "No Meta data" }, { status: 404 });

  const propIdx = analysis.proposals.findIndex(p => p.ad_id === ad_id);
  if (propIdx === -1) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const proposal = analysis.proposals[propIdx];
  if (proposal.status !== "pending")
    return NextResponse.json({ error: `Proposal já resolvida (status: ${proposal.status})` }, { status: 409 });

  const client = await getClientBySlug(params.slug);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { access_token } = client.meta;

  try {
    let result_message = "";

    if (action_type === "pause") {
      await pauseEntity(ad_id, access_token);
      result_message = `Anúncio ${ad_id} pausado com sucesso.`;
    } else if (action_type === "scale") {
      if (proposal.action.type !== "scale_budget")
        return NextResponse.json({ error: "Proposta não tem action de escalonamento" }, { status: 400 });

      const { adset_id, new_budget_cents } = proposal.action;

      // Guard: check monthly budget if defined
      const orcamentoMensalCents = client.contexto.orcamento_mensal_cents;
      if (orcamentoMensalCents && orcamentoMensalCents > 0) {
        const now = new Date();
        const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
        const remainingDays = daysInMonth - now.getUTCDate() + 1;
        const spendSoFarCents = Math.round((report.meta?.spend_7d ?? 0) * 100 * (now.getUTCDate() / 7));
        const projectedTotalCents = spendSoFarCents + new_budget_cents * remainingDays;
        if (projectedTotalCents > orcamentoMensalCents * 1.05) {
          const projetado = (projectedTotalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const limite = (orcamentoMensalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          return NextResponse.json({
            error: `Escalonamento bloqueado: projeção de ${projetado} ultrapassaria o orçamento mensal de ${limite}.`,
          }, { status: 422 });
        }
      }

      await updateAdsetBudget(adset_id, new_budget_cents, access_token);
      const novoValor = (new_budget_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      result_message = `Budget do conjunto ${adset_id} atualizado para ${novoValor}/dia.`;
    } else if (action_type === "update_targeting") {
      if (proposal.action.type !== "update_adset_targeting")
        return NextResponse.json({ error: "Proposta não tem action de atualização de targeting" }, { status: 400 });

      const { adset_id, targeting, targeting_summary_new } = proposal.action;
      await updateAdsetTargeting(adset_id, targeting, access_token);
      result_message = `Targeting do conjunto ${adset_id} atualizado: ${targeting_summary_new}`;
    } else if (action_type === "create_adset") {
      if (proposal.action.type !== "create_adset")
        return NextResponse.json({ error: "Proposta não tem action de criação de conjunto" }, { status: 400 });

      const { campaign_id, adset_name, targeting, optimization_goal, bid_strategy, daily_budget_cents, targeting_summary_new } = proposal.action;
      const newAdsetId = await createAdset({
        adAccountId: client.meta.ad_account_id,
        campaignId: campaign_id,
        name: adset_name,
        targeting,
        optimizationGoal: optimization_goal,
        bidStrategy: bid_strategy,
        dailyBudgetCents: daily_budget_cents,
        pageId: client.meta.page_id,
        accessToken: access_token,
      });
      result_message = `Novo conjunto criado (PAUSADO): "${adset_name}" [${newAdsetId}] — ${targeting_summary_new}`;
    } else {
      return NextResponse.json({ error: "action_type inválido" }, { status: 400 });
    }

    analysis.proposals[propIdx].status = "approved";
    analysis.proposals[propIdx].resolved_at = new Date().toISOString();
    analysis.proposals[propIdx].result_message = result_message;
    await saveReport(report);

    return NextResponse.json({ ok: true, result_message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
