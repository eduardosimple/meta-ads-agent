/**
 * POST /api/proposals/execute
 * Executa uma proposal estratégica (Otimização Semanal/Mensal) via Meta API.
 * Chamado pela UI quando o gestor clica em "Aprovar e aplicar".
 *
 * Body: {
 *   slug, period_kind ("week" | "month"), period_id (ex "2026-W22"),
 *   proposal_index (posição no array acoes_propostas/propostas),
 *   action: "pause_adset" | "create_adset" | "request_creative" | "create_lal"
 *           | "mark_seen",
 *   params: { ...específicos do tipo }
 * }
 *
 * Após executar com sucesso, marca a proposta como "executed" no array com
 * timestamp + resultado.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { pauseEntity, createAdset, getAdsetDetails } from "@/lib/meta-api";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/auth";

export const maxDuration = 60;

async function authOK(req: NextRequest): Promise<boolean> {
  // aceita JWT do portal OU CRON_SECRET
  if (req.headers.get("x-cron-key") === process.env.CRON_SECRET) return true;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return false;
  if (bearer === process.env.CRON_SECRET) return true;
  try { await verifyToken(bearer); return true; } catch { return false; }
}

interface ExecuteBody {
  slug: string;
  period_kind: "week" | "month";
  period_id: string;
  proposal_index: number;
  action: "pause_adset" | "create_adset" | "request_creative" | "create_lal" | "mark_seen";
  params?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  if (!await authOK(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: ExecuteBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const client = await getClientBySlug(body.slug);
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  const tok = client.meta?.access_token;

  let result: Record<string, unknown> = {};
  try {
    switch (body.action) {
      case "pause_adset": {
        const adset_id = body.params?.adset_id as string;
        if (!adset_id || !tok) throw new Error("adset_id e meta access_token requeridos");
        await pauseEntity(adset_id, tok);
        result = { pause_ok: true, adset_id };
        break;
      }
      case "create_adset": {
        // Clona adset existente (mesma campanha + criativos) ou cria novo público.
        // Params esperados: { campaign_id, name, targeting (object), optimization_goal, daily_budget_cents?, source_adset_id? }
        const p = body.params ?? {};
        if (!tok || !client.meta?.ad_account_id) throw new Error("meta credentials requeridas");
        let targeting = p.targeting as Record<string, unknown> | undefined;
        let optimization_goal = p.optimization_goal as string | undefined;
        let campaign_id = p.campaign_id as string | undefined;
        // Se source_adset_id, busca configuração base do adset original (pra clonar config)
        if (p.source_adset_id && (!targeting || !optimization_goal || !campaign_id)) {
          const src = await getAdsetDetails(p.source_adset_id as string, tok);
          campaign_id = campaign_id ?? src.campaign_id;
          optimization_goal = optimization_goal ?? src.optimization_goal;
          targeting = targeting ?? (src.targeting as Record<string, unknown>);
        }
        if (!campaign_id || !optimization_goal || !targeting) {
          throw new Error("campaign_id, optimization_goal e targeting requeridos (ou source_adset_id pra clonar)");
        }
        const new_id = await createAdset({
          adAccountId: client.meta.ad_account_id,
          campaignId: campaign_id,
          name: (p.name as string) ?? `[NOVO] adset gerado ${new Date().toISOString().slice(0, 10)}`,
          targeting,
          optimizationGoal: optimization_goal,
          dailyBudgetCents: p.daily_budget_cents as number | undefined,
          pageId: client.meta.page_id,
          accessToken: tok,
        });
        result = { create_ok: true, new_adset_id: new_id, status: "PAUSED" };
        break;
      }
      case "request_creative": {
        // Dois modos:
        //  A) params.ad_id → substituir criativo de um ad ruim (pipeline existente).
        //  B) params.adset_id (sem ad_id) → criar criativo NOVO pra completar GA com <4 ads.
        //     Esse modo grava direto na tabela weekly_optimizations/daily_reports como
        //     pedido pendente — pipeline conteudo+design lê e gera; aprovação cria ad novo.
        const date = body.params?.date as string;
        const ad_id = body.params?.ad_id as string | undefined;
        const adset_id_for_new = body.params?.adset_id as string | undefined;
        if (!date) throw new Error("date requerido");

        if (ad_id) {
          // MODO A — substituir ad ruim (fluxo existente)
          const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : "http://localhost:3000";
          const r = await fetch(`${baseUrl}/api/daily-reports/${body.slug}/proposals`, {
            method: "PATCH",
            headers: { "x-cron-key": process.env.CRON_SECRET!, "Content-Type": "application/json" },
            body: JSON.stringify({ date, ad_id, platform: "meta", status: "creative_requested" }),
          });
          if (!r.ok) throw new Error(`request_creative HTTP ${r.status}`);
          result = { request_ok: true, mode: "replace_ad", ad_id, pipeline: "creative_requested" };
        } else if (adset_id_for_new) {
          // MODO B — pedido de criativo NOVO pra completar GA. Grava no Supabase
          // como nova "proposal" sintética no daily_report do dia (status=creative_requested,
          // ad_id=adset_id como referência). Skill `gerar-criativo-solicitado` foi
          // atualizada pra entender ad_id que começa com "120" sem prefixo de adset
          // como pedido genérico — atualização pendente da skill (TODO).
          const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
          const { data: report } = await supabase.from("daily_reports").select("id, meta").eq("client_slug", body.slug).eq("date", date).maybeSingle();
          if (!report) throw new Error(`Sem daily_report pra ${body.slug} em ${date}`);
          const meta = (report.meta ?? {}) as Record<string, unknown>;
          const proposals = (meta.proposals as Array<Record<string, unknown>> | undefined) ?? [];
          const synthetic = {
            id: `req-new-${adset_id_for_new}-${Date.now()}`,
            ad_id: adset_id_for_new,
            ad_name: `[novo criativo solicitado] adset ${adset_id_for_new}`,
            adset_name: `adset ${adset_id_for_new}`,
            campaign_name: "—",
            verdict: "manter",
            ajuste_tipo: "criativo",
            titulo: "Novo criativo pra completar GA (<4 ads)",
            diagnostico: "GA com menos de 4 ads ativos — pedido de criativo novo (não substitui ad existente).",
            metricas_problema: ["ads_ativos < 4"],
            acao_sugerida: "Gerar copy+imagem via design-agent e criar ad novo no adset",
            action: { type: "none" },
            status: "creative_requested",
            created_at: new Date().toISOString(),
            request_target: "new_ad_in_adset",
            target_adset_id: adset_id_for_new,
          };
          proposals.push(synthetic);
          await supabase.from("daily_reports").update({ meta: { ...meta, proposals } }).eq("id", report.id);
          result = { request_ok: true, mode: "new_for_adset", adset_id: adset_id_for_new, proposal_id: synthetic.id, pipeline: "creative_requested" };
        } else {
          throw new Error("informe ad_id (substituir) OU adset_id (novo pro GA)");
        }
        break;
      }
      case "create_lal": {
        // Lookalike: requer fonte (custom_audience_id). Params: { source_audience_id, name, ratio (0.01–0.10), country }
        const p = body.params ?? {};
        if (!tok || !client.meta?.ad_account_id) throw new Error("meta credentials requeridas");
        const source = p.source_audience_id as string;
        const ratio = (p.ratio as number) ?? 0.01;
        const country = (p.country as string) ?? "BR";
        const name = (p.name as string) ?? `LAL ${(ratio * 100).toFixed(0)}% ${country} ${new Date().toISOString().slice(0, 10)}`;
        if (!source) throw new Error("source_audience_id requerido");
        const r = await fetch(`https://graph.facebook.com/v19.0/${client.meta.ad_account_id}/customaudiences`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            subtype: "LOOKALIKE",
            origin_audience_id: source,
            lookalike_spec: JSON.stringify({ ratio, country, type: "similarity" }),
            access_token: tok,
          }),
        });
        const data = await r.json();
        if (!r.ok || data.error) throw new Error(data?.error?.message ?? "create_lal failed");
        result = { create_ok: true, audience_id: data.id, name };
        break;
      }
      case "mark_seen": {
        // Sem ação real — só anota que humano viu (pra UI esconder/marcar)
        result = { marked: true };
        break;
      }
      default:
        return NextResponse.json({ error: `unsupported action: ${body.action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }

  // Marca a proposta como executed na tabela correspondente
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const table = body.period_kind === "week" ? "weekly_optimizations" : "monthly_optimizations";
  const periodCol = body.period_kind === "week" ? "week" : "month";
  const propsCol = body.period_kind === "week" ? "acoes_propostas" : "propostas";

  const { data: rows, error: fetchErr } = await supabase
    .from(table).select(`id, ${propsCol}`)
    .eq("client_slug", body.slug).eq(periodCol, body.period_id);

  if (!fetchErr && rows && rows.length > 0) {
    const row = rows[0] as { id: string } & Record<string, unknown>;
    const props = (row[propsCol] ?? []) as Array<Record<string, unknown>>;
    if (props[body.proposal_index]) {
      props[body.proposal_index] = {
        ...props[body.proposal_index],
        executed: true,
        executed_at: new Date().toISOString(),
        execution_action: body.action,
        execution_result: result,
      };
      await supabase.from(table).update({ [propsCol]: props }).eq("id", row.id);
    }
  }

  return NextResponse.json({ ok: true, action: body.action, result });
}
