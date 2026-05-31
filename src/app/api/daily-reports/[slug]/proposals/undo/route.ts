import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/reports-store";
import { getClientBySlug } from "@/lib/clients";
import { setEntityStatus, updateAdsetBudget } from "@/lib/meta-api";
import {
  setGoogleAdGroupStatus,
  setGoogleCampaignBudgetAmount,
} from "@/lib/google-ads-api";

export const maxDuration = 60;

// POST /api/daily-reports/[slug]/proposals/undo
// Body: { date, proposal_id }
// Reverte uma ação automática usando o previous_state guardado na proposta.
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

  let body: { date?: string; proposal_id?: string };
  try {
    body = (await req.json()) as { date?: string; proposal_id?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { date, proposal_id } = body;
  if (!date || !proposal_id)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const report = await getReport(params.slug, date);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const client = await getClientBySlug(params.slug);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  let proposal = report.meta?.proposals.find((p) => p.id === proposal_id);
  if (!proposal) proposal = report.google?.proposals.find((p) => p.id === proposal_id);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  if (proposal.status === "undone")
    return NextResponse.json({ ok: true, noop: "ja_desfeito" });

  const ps = proposal.previous_state;
  if (!ps) return NextResponse.json({ ok: true, noop: "sem_estado_anterior" });

  try {
    if (ps.kind === "ad_status") {
      if (!client.meta?.access_token) throw new Error("sem token Meta");
      await setEntityStatus(ps.ad_id, "ACTIVE", client.meta.access_token);
    } else if (ps.kind === "adset_budget") {
      if (!client.meta?.access_token) throw new Error("sem token Meta");
      await updateAdsetBudget(ps.adset_id, ps.old_daily_budget_cents, client.meta.access_token);
    } else if (ps.kind === "google_adgroup_status") {
      if (!client.google) throw new Error("sem credencial Google");
      await setGoogleAdGroupStatus(client.google, ps.ad_group_id, "ENABLED");
    } else if (ps.kind === "google_campaign_budget") {
      if (!client.google) throw new Error("sem credencial Google");
      await setGoogleCampaignBudgetAmount(client.google, ps.campaign_id, ps.old_budget_reais);
    }
  } catch (e) {
    return NextResponse.json(
      { error: "undo_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  proposal.status = "undone";
  proposal.result_message = `Desfeito em ${new Date().toISOString()}`;
  await saveReport(report);

  return NextResponse.json({ ok: true, proposal_id });
}
