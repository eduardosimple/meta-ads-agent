import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";
import { getReportsByDate } from "@/lib/reports-store";
import { todayBR } from "@/lib/date-br";

// 300s: precisa caber o processamento de vários clientes aguardando de verdade.
// A função serverless da Vercel continua rodando até terminar (ou bater o
// maxDuration) mesmo se o cliente (cron-job.org) desconectar por timeout.
export const maxDuration = 300;

// Quantos analysis-single rodam em paralelo.
const CONCURRENCY = 8;
// Folga p/ não estourar o maxDuration.
const TIME_BUDGET_MS = 270_000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await getClients();
  const activeClients = clients.filter(c => c.ativo);

  const today = todayBR();

  let todayReports: Awaited<ReturnType<typeof getReportsByDate>> = [];
  let dbError: string | null = null;
  try {
    todayReports = await getReportsByDate(today);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  const existingMap = new Map(todayReports.map(r => [r.client_slug, r]));

  // Prioriza quem ainda não tem report / está sem meta
  const sortedClients = [...activeClients].sort((a, b) => {
    const ra = existingMap.get(a.slug);
    const rb = existingMap.get(b.slug);
    const pa = !ra ? 0 : !ra.meta ? 1 : 2;
    const pb = !rb ? 0 : !rb.meta ? 1 : 2;
    return pa - pb;
  });

  // Pendente = falta o canal que o cliente DE FATO tem. Espelha a lógica do
  // worker (analysis-single): clientes Google-only não têm Meta e não podem
  // ficar eternamente "pendentes" (reprocessados a cada cron, gastando token).
  const pending = sortedClients.filter(c => {
    const r = existingMap.get(c.slug);
    const hasMeta = !!(c.meta?.access_token && c.meta?.ad_account_id);
    const hasGoogle = !!c.google;
    return (hasMeta && !r?.meta) || (hasGoogle && !r?.google);
  });

  // limit opcional: limita a fila desta chamada. Sem limit = todos os pendentes
  // (o TIME_BUDGET_MS corta naturalmente se não couber tudo).
  const limitParam = req.nextUrl.searchParams.get("limit");
  const parsed = limitParam ? parseInt(limitParam) : NaN;
  const cap = Number.isFinite(parsed) ? Math.max(0, parsed) : pending.length;
  const queue = pending.slice(0, cap).map(c => c.slug);

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  // CONFIÁVEL: worker pool que AGUARDA cada analysis-single terminar (sem
  // fire-and-forget — a Vercel não congela a função antes de salvar). Clientes
  // com token quebrado falham rápido e o worker já pega o próximo, sem travar.
  const deadline = Date.now() + TIME_BUDGET_MS;
  const work = [...queue];
  const ok: string[] = [];
  const failed: string[] = [];

  async function worker() {
    while (work.length > 0 && Date.now() < deadline) {
      const slug = work.shift();
      if (!slug) break;
      try {
        const r = await fetch(
          `${baseUrl}/api/cron/analysis-single?slug=${slug}`,
          { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }
        );
        const body = await r.json().catch(() => null);
        if (r.ok && body && body.status === "ok") ok.push(slug);
        else failed.push(slug);
      } catch {
        failed.push(slug);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
  );

  return NextResponse.json({
    requested: queue.length,
    ok: ok.length,
    failed: failed.length,
    failed_slugs: failed,
    not_processed: work.length, // sobrou por estouro de tempo (chamar de novo)
    total_active: activeClients.length,
    db_error: dbError,
    at: new Date().toISOString(),
  });
}
