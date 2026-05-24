import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/reports-store";

/**
 * POST /api/daily-reports/[slug]/proposals/refine-copy
 * Body: { date, ad_id, platform, feedback }
 *
 * Marca a proposta como creative_requested com refinement_feedback. O
 * poller pega e o conteudo-agent regenera a copy considerando o feedback
 * do gestor (ex: "menos texto", "foca na localização", "urgência maior").
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

  const body = await req.json() as {
    date: string;
    ad_id: string;
    platform: "meta" | "google";
    feedback: string;
  };
  const { date, ad_id, platform, feedback } = body;
  if (!date || !ad_id || !platform || !feedback?.trim())
    return NextResponse.json({ error: "Missing fields: date, ad_id, platform, feedback" }, { status: 400 });

  const report = await getReport(params.slug, date);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const analysis = report[platform];
  if (!analysis) return NextResponse.json({ error: `No ${platform} data` }, { status: 404 });

  const idx = analysis.proposals.findIndex(p => p.ad_id === ad_id);
  if (idx === -1) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  analysis.proposals[idx].status = "creative_requested";
  analysis.proposals[idx].refinement_feedback = feedback.trim();
  analysis.proposals[idx].resolved_at = new Date().toISOString();

  await saveReport(report);
  return NextResponse.json({ ok: true, ad_id });
}
