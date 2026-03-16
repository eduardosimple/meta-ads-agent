import { Redis } from "@upstash/redis";
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

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export async function saveReport(report: DailyReport): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(KEY_REPORT(report.client_slug, report.date), report, { ex: 60 * 60 * 24 * (MAX_DAYS + 2) });
  const index: string[] = (await redis.get<string[]>(KEY_INDEX(report.client_slug))) ?? [];
  const updated = [report.date, ...index.filter(d => d !== report.date)].slice(0, MAX_DAYS);
  await redis.set(KEY_INDEX(report.client_slug), updated);
}

export async function getReport(slug: string, date: string): Promise<DailyReport | null> {
  const redis = getRedis();
  if (!redis) return null;
  return await redis.get<DailyReport>(KEY_REPORT(slug, date));
}

export async function listReportDates(slug: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  return (await redis.get<string[]>(KEY_INDEX(slug))) ?? [];
}

export async function getRecentReports(slug: string, limit = 7): Promise<DailyReport[]> {
  const redis = getRedis();
  if (!redis) return [];
  const dates = await listReportDates(slug);
  const top = dates.slice(0, limit);
  const results = await Promise.all(top.map(d => getReport(slug, d)));
  return results.filter((r): r is DailyReport => r !== null);
}
