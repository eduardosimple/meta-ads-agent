import { NextRequest, NextResponse } from "next/server";
import { getClients, getClientBySlug } from "@/lib/clients";
import { saveReport, getReportsByDate } from "@/lib/reports-store";
import { getGoogleCampaignsWithMetrics } from "@/lib/google-ads-api";
import { analyzeMetaAds, analyzeGoogleAds } from "@/lib/analysis";
import type { DailyReport } from "@/lib/reports-store";
import { randomUUID } from "crypto";
import { todayBR, nDaysAgoBR } from "@/lib/date-br";

// 300s: contas de alto gasto (muitos anúncios + chamada Claude) passam de 60s.
// Em 60s o Vercel matava a função (504) e o report não era salvo — falha
// silenciosa pq o fan-out chama este endpoint fire-and-forget.
export const maxDuration = 300;

// GET /api/cron/analysis-single?slug=<slug>
// Analisa um único cliente — usado pelo cron principal para contornar timeout
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const today = todayBR();
  const sevenDaysAgo = nDaysAgoBR(7);

  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.ativo) return NextResponse.json({ status: "inactive" });

  const [todayReports] = await Promise.allSettled([getReportsByDate(today)]);
  const existing = todayReports.status === "fulfilled"
    ? todayReports.value.find(r => r.client_slug === slug)
    : undefined;

  // Cliente só tem Meta de verdade se houver token E conta. Clientes Google-only
  // carregam um bloco meta vazio/stub (access_token "") — não tentar Meta neles,
  // senão estoura "Cannot parse access token" e aborta ANTES de rodar o Google.
  const hasMeta = !!(client.meta?.access_token && client.meta?.ad_account_id);
  const hasGoogle = !!client.google;

  const needsMeta = hasMeta && !existing?.meta;
  const needsGoogle = hasGoogle && !existing?.google;

  if (!needsMeta && !needsGoogle) {
    return NextResponse.json({
      status: "skipped",
      client: slug,
      reason: (!hasMeta && !hasGoogle) ? "sem_plataforma" : "ja_processado",
    });
  }

  const report: DailyReport = existing ?? {
    id: randomUUID(),
    client_slug: client.slug,
    client_name: client.nome,
    date: today,
    created_at: new Date().toISOString(),
  };

  // Erros por canal são NÃO-fatais: falha no Meta não pode impedir o Google de
  // ser salvo (e vice-versa). Só retorna erro se NADA foi gerado.
  let metaError: string | null = null;
  let googleError: string | null = null;

  if (needsMeta) {
    try {
      const analysis = await analyzeMetaAds(client, sevenDaysAgo, today);
      report.meta = {
        ...analysis,
        spend_7d: analysis.spend_7d ?? 0,
        leads_7d: analysis.leads_7d ?? 0,
        avg_ctr: analysis.avg_ctr ?? 0,
      };
    } catch (e) {
      metaError = e instanceof Error ? e.message : String(e);
    }
  }

  if (needsGoogle && client.google) {
    try {
      const [analysis, gMetrics] = await Promise.allSettled([
        analyzeGoogleAds(client, sevenDaysAgo, today),
        getGoogleCampaignsWithMetrics(client.google, sevenDaysAgo, today),
      ]);
      if (analysis.status === "fulfilled") {
        const g = gMetrics.status === "fulfilled" ? gMetrics.value : [];
        const gSpend = g.reduce((s, c) => s + c.spend, 0);
        const gConversions = g.reduce((s, c) => s + c.conversions, 0);
        report.google = {
          ...analysis.value,
          spend_7d: gSpend,
          conversions_7d: gConversions,
          avg_ctr: g.length > 0 ? g.reduce((s, c) => s + c.ctr, 0) / g.length : 0,
          cost_per_conversion: gConversions > 0 ? gSpend / gConversions : 0,
        };
      } else {
        googleError = analysis.reason instanceof Error ? analysis.reason.message : String(analysis.reason);
      }
    } catch (e) {
      googleError = e instanceof Error ? e.message : String(e);
    }
  }

  // Não persistir vazio — reporta o(s) erro(s) p/ o dispatcher contar como falha.
  if (!report.meta && !report.google) {
    return NextResponse.json({
      status: "error",
      client: slug,
      meta_error: metaError,
      google_error: googleError,
    });
  }

  await saveReport(report);
  return NextResponse.json({
    status: "ok",
    client: slug,
    date: today,
    saved: { meta: !!report.meta, google: !!report.google },
    ...(metaError ? { meta_error: metaError } : {}),
    ...(googleError ? { google_error: googleError } : {}),
  });
}
