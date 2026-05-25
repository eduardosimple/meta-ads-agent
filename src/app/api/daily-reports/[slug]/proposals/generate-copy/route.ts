import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/reports-store";

/**
 * POST /api/daily-reports/[slug]/proposals/generate-copy
 * (Migrado: NÃO chama mais Anthropic API; marca proposal como
 * creative_requested e deixa o poller local + subagentes gerarem via plano.)
 *
 * Body: { date, ad_id, platform }
 */
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

  const body = await req.json() as { date: string; ad_id: string; platform: "meta" | "google" };
  const { date, ad_id, platform } = body;
  if (!date || !ad_id || !platform)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const report = await getReport(params.slug, date);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const analysis = report[platform];
  if (!analysis) return NextResponse.json({ error: "No platform data" }, { status: 404 });

  const idx = analysis.proposals.findIndex(p => p.ad_id === ad_id);
  if (idx === -1) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  // Marca pro poller pegar — conteudo-agent gera via plano (sem custo API)
  analysis.proposals[idx].status = "creative_requested";
  analysis.proposals[idx].resolved_at = new Date().toISOString();

  await saveReport(report);
  return NextResponse.json({ ok: true, ad_id, queued: true });
}
