import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClients } from "@/lib/clients";
import type { DailyReport } from "@/lib/reports-store";

export const maxDuration = 60;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const firstDayOfMonth = new Date(Date.UTC(year, month, 1)).toISOString().split("T")[0];
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  // Fetch all reports from the current month
  const { data: monthReports, error: dbError } = await sb
    .from("daily_reports")
    .select("*")
    .gte("date", firstDayOfMonth)
    .order("date", { ascending: false });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const reports: DailyReport[] = monthReports ?? [];

  // Group reports by client_slug — keep only the most recent per client
  const latestByClient = new Map<string, DailyReport>();
  for (const report of reports) {
    if (!latestByClient.has(report.client_slug)) {
      latestByClient.set(report.client_slug, report);
    }
  }

  // Load clients to get optional orcamento_mensal_cents
  const clients = await getClients();
  const clientMap = new Map(clients.map(c => [c.slug, c]));

  type AlertEntry = {
    slug: string;
    nome: string;
    projecao: number;
    budget: number;
    tipo: "estouro" | "subentrega";
  };

  const alertEntries: AlertEntry[] = [];

  for (const [slug, report] of Array.from(latestByClient.entries())) {
    const spend7d = report.meta?.spend_7d ?? 0;
    if (spend7d <= 0) continue;

    const spendDiarioMedio = spend7d / 7;
    const projecaoMensal = spendDiarioMedio * daysInMonth;

    // Determine monthly budget: from client data or estimate
    const client = clientMap.get(slug);
    // Cast to access optional orcamento_mensal_cents (not in type but may exist in DB row)
    type MetaExtended = { orcamento_mensal_cents?: number };
    const metaExtended = (client?.meta ?? {}) as MetaExtended;
    const budgetMensal =
      metaExtended.orcamento_mensal_cents != null && metaExtended.orcamento_mensal_cents > 0
        ? metaExtended.orcamento_mensal_cents / 100
        : spendDiarioMedio * 30 * 1.5;

    const nomePadrao = report.client_name ?? slug;

    if (projecaoMensal > budgetMensal * 1.2) {
      alertEntries.push({ slug, nome: nomePadrao, projecao: projecaoMensal, budget: budgetMensal, tipo: "estouro" });
    } else if (projecaoMensal < budgetMensal * 0.6) {
      alertEntries.push({ slug, nome: nomePadrao, projecao: projecaoMensal, budget: budgetMensal, tipo: "subentrega" });
    }
  }

  if (alertEntries.length === 0) {
    return NextResponse.json({ message: "Nenhum alerta orçamentário identificado.", day: dayOfMonth, daysInMonth });
  }

  // Build WhatsApp message
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const lines = alertEntries.map(a => {
    const projecaoFmt = `R$${Math.round(a.projecao).toLocaleString("pt-BR")}`;
    const budgetFmt = `R$${Math.round(a.budget).toLocaleString("pt-BR")}`;
    const label = a.tipo === "estouro" ? "estouro estimado" : "subentrega estimada";
    return `${a.nome} — Projecao: ${projecaoFmt} / Meta: ${budgetFmt} (${label})`;
  });

  const msg = `Alerta orcamentario ${dd}/${mm}\n\n${lines.join("\n")}`;

  // Send via Evolution API
  const evoUrl = process.env.EVOLUTION_API_URL ?? "https://apiwp.mktsimple.com.br";
  const evoKey = process.env.EVOLUTION_API_KEY;
  const evoInstance = process.env.EVOLUTION_INSTANCE;
  const waNumber = process.env.NOTIFY_WHATSAPP_NUMBER;

  let whatsappSent = false;
  if (evoKey && evoInstance && waNumber) {
    try {
      const res = await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
        method: "POST",
        headers: { apikey: evoKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: waNumber, text: msg }),
      });
      whatsappSent = res.ok;
    } catch (e) {
      console.error("[budget-alerts] WhatsApp send error:", e);
    }
  }

  return NextResponse.json({
    alerts: alertEntries.length,
    whatsapp_sent: whatsappSent,
    message: msg,
    at: now.toISOString(),
  });
}
