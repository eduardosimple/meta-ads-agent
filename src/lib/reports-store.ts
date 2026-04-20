import { createClient } from "@supabase/supabase-js";
import type { AnalysisResult } from "@/types/metrics";

export interface DailyReport {
  id: string;
  client_slug: string;
  client_name: string;
  date: string; // YYYY-MM-DD
  created_at: string;
  meta?: AnalysisResult & { spend_7d?: number; leads_7d?: number; avg_ctr?: number };
  google?: AnalysisResult & { spend_7d?: number; conversions_7d?: number; avg_ctr?: number; cost_per_conversion?: number };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function saveReport(report: DailyReport): Promise<void> {
  const sb = getSupabase();
  if (!sb) { console.error("[reports-store] Supabase not configured"); return; }
  const { error } = await sb.from("daily_reports").upsert({
    id: report.id,
    client_slug: report.client_slug,
    client_name: report.client_name,
    date: report.date,
    created_at: report.created_at,
    meta: report.meta ?? null,
    google: report.google ?? null,
  }, { onConflict: "client_slug,date" });
  if (error) console.error("[reports-store] saveReport error:", JSON.stringify(error));
}

export async function getReport(slug: string, date: string): Promise<DailyReport | null> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase não configurado: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
  const { data, error } = await sb
    .from("daily_reports")
    .select("*")
    .eq("client_slug", slug)
    .eq("date", date)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data ?? null;
}

export async function getReportsByDate(date: string): Promise<DailyReport[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("daily_reports")
    .select("*")
    .eq("date", date);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRecentReports(slug: string, limit = 7): Promise<DailyReport[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase não configurado: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
  const { data, error } = await sb
    .from("daily_reports")
    .select("*")
    .eq("client_slug", slug)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
