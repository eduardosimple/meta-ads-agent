import { kv } from "@vercel/kv";
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

const KEY_REPORT = (slug: string, date: string) => `report:${slug}:${date}`;
const KEY_INDEX  = (slug: string) => `report-index:${slug}`;
const MAX_DAYS = 30;

function isKvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function saveReport(report: DailyReport): Promise<void> {
  if (!isKvConfigured()) return;
  await kv.set(KEY_REPORT(report.client_slug, report.date), report, { ex: 60 * 60 * 24 * (MAX_DAYS + 2) });
  const index: string[] = (await kv.get<string[]>(KEY_INDEX(report.client_slug))) ?? [];
  const updated = [report.date, ...index.filter(d => d !== report.date)].slice(0, MAX_DAYS);
  await kv.set(KEY_INDEX(report.client_slug), updated);
}

export async function getReport(slug: string, date: string): Promise<DailyReport | null> {
  if (!isKvConfigured()) return null;
  return await kv.get<DailyReport>(KEY_REPORT(slug, date));
}

export async function listReportDates(slug: string): Promise<string[]> {
  if (!isKvConfigured()) return [];
  return (await kv.get<string[]>(KEY_INDEX(slug))) ?? [];
}

export async function getRecentReports(slug: string, limit = 7): Promise<DailyReport[]> {
  if (!isKvConfigured()) return [];
  const dates = await listReportDates(slug);
  const top = dates.slice(0, limit);
  const results = await Promise.all(top.map(d => getReport(slug, d)));
  return results.filter((r): r is DailyReport => r !== null);
}
