export interface DailyMetric {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpc: number;
  leads: number;
}

export interface MetricsSummary {
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_reach: number;
  total_leads: number;
  avg_ctr: number;
  avg_cpc: number;
  cpl: number;
}

export interface MetricsResponse {
  summary: MetricsSummary;
  daily: DailyMetric[];
  date_from: string;
  date_to: string;
}
