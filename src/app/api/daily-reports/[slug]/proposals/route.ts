import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/reports-store";

// PATCH /api/daily-reports/[slug]/proposals
// Body: { date, ad_id, platform, copy_sugerida: { versao_a, versao_b } }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const cronKey = req.headers.get("x-cron-key");
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const valid =
    (cronKey && cronKey === secret) ||
    (authHeader && authHeader === `Bearer ${secret}`);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, ad_id, platform, copy_sugerida } = body as {
    date: string;
    ad_id: string;
    platform: "meta" | "google";
    copy_sugerida: {
      versao_a: { headline: string; texto: string; cta: string };
      versao_b: { headline: string; texto: string; cta: string };
    };
  };

  if (!date || !ad_id || !platform || !copy_sugerida) {
    return NextResponse.json({ error: "Missing fields: date, ad_id, platform, copy_sugerida" }, { status: 400 });
  }

  const report = await getReport(params.slug, date);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const analysis = report[platform];
  if (!analysis) return NextResponse.json({ error: `No ${platform} data in this report` }, { status: 404 });

  const idx = analysis.proposals.findIndex(p => p.ad_id === ad_id);
  if (idx === -1) return NextResponse.json({ error: `Proposal ad_id=${ad_id} not found` }, { status: 404 });

  analysis.proposals[idx].copy_sugerida = copy_sugerida;
  await saveReport(report);

  return NextResponse.json({ ok: true, ad_id, platform });
}
