import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/reports-store";
import type { Proposal } from "@/types/metrics";

function checkAuth(req: NextRequest): boolean {
  const cronKey = req.headers.get("x-cron-key");
  const authHeader = req.headers.get("authorization");
  const reportKey = req.headers.get("x-report-key");
  const secret = process.env.CRON_SECRET;
  const reportSecret = process.env.REPORT_VIEW_SECRET;
  return (
    (!!cronKey && cronKey === secret) ||
    (!!authHeader && authHeader === `Bearer ${secret}`) ||
    (!!reportKey && !!reportSecret && reportKey === reportSecret)
  );
}

// PATCH /api/daily-reports/[slug]/proposals
// Body: { date, ad_id, platform, copy_sugerida? } OR { date, ad_id, platform, status: "rejected" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    date: string;
    ad_id: string;
    platform: "meta" | "google";
    copy_sugerida?: Proposal["copy_sugerida"];
    status?: string;
  };

  const { date, ad_id, platform } = body;
  if (!date || !ad_id || !platform)
    return NextResponse.json({ error: "Missing fields: date, ad_id, platform" }, { status: 400 });

  const report = await getReport(params.slug, date);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const analysis = report[platform];
  if (!analysis) return NextResponse.json({ error: `No ${platform} data in this report` }, { status: 404 });

  const idx = analysis.proposals.findIndex(p => p.ad_id === ad_id);
  if (idx === -1) return NextResponse.json({ error: `Proposal ad_id=${ad_id} not found` }, { status: 404 });

  if (body.copy_sugerida !== undefined) {
    analysis.proposals[idx].copy_sugerida = body.copy_sugerida;
  }
  if (body.status !== undefined) {
    analysis.proposals[idx].status = body.status as Proposal["status"];
    analysis.proposals[idx].resolved_at = new Date().toISOString();
  }

  await saveReport(report);
  return NextResponse.json({ ok: true, ad_id, platform });
}
