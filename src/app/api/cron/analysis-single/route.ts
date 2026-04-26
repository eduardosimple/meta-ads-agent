import { NextRequest, NextResponse } from "next/server";
import { getClients, getClientBySlug } from "@/lib/clients";
import { saveReport, getReportsByDate } from "@/lib/reports-store";
import { getGoogleCampaignsWithMetrics } from "@/lib/google-ads-api";
import { analyzeMetaAds, analyzeGoogleAds } from "@/lib/analysis";
import type { DailyReport } from "@/lib/reports-store";
import { randomUUID } from "crypto";

export const maxDuration = 60;

// GET /api/cron/analysis-single?slug=<slug>
// Analisa um único cliente — usado pelo cron principal para contornar timeout
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.ativo) return NextResponse.json({ status: "inactive" });

  const [todayReports] = await Promise.allSettled([getReportsByDate(today)]);
  const existing = todayReports.status === "fulfilled"
    ? todayReports.value.find(r => r.client_slug === slug)
    : undefined;

  const needsMeta = !existing?.meta;
  const needsGoogle = client.google ? !existing?.google : false;

  if (!needsMeta && !needsGoogle) {
    return NextResponse.json({ status: "skipped", client: slug });
  }

  const report: DailyReport = existing ?? {
    id: randomUUID(),
    client_slug: client.slug,
    client_name: client.nome,
    date: today,
    created_at: new Date().toISOString(),
  };

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
      const reason = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ status: "meta_error", error: reason, client: slug });
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
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ status: "google_error", error: msg, client: slug });
    }
  }

  await saveReport(report);
  return NextResponse.json({ status: "ok", client: slug, date: today });
}
