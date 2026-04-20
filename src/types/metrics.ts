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

export interface AdMetrics {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  frequency: number;
  leads: number;
  whatsapp_conversations: number;
  post_engagements: number;
  cpl: number;
  days_running: number;
}

export type ProposalVerdict = "escalar" | "manter" | "testar_variacao" | "ajustar" | "pausar";
export type ProposalAction =
  | { type: "pause_ad"; ad_id: string }
  | { type: "pause_adset"; adset_id: string }
  | { type: "scale_budget"; adset_id: string; new_budget_cents: number }
  | { type: "pause_google_ad_group"; ad_group_id: string; customer_id: string }
  | { type: "pause_google_campaign"; campaign_id: string; customer_id: string }
  | { type: "scale_google_campaign"; campaign_id: string; customer_id: string }
  | { type: "none" };

export interface Proposal {
  id: string;
  ad_id: string;
  ad_name: string;
  adset_name: string;
  campaign_name: string;
  verdict: ProposalVerdict;
  titulo: string;
  diagnostico: string;
  metricas_problema: string[];
  acao_sugerida: string;
  action: ProposalAction;
  status: "pending" | "approved" | "rejected" | "ignored" | "creative_requested" | "generating";
  created_at: string;
  resolved_at?: string;
  result_message?: string;
  copy_sugerida?: {
    versao_a: { headline: string; texto: string; cta: string };
    versao_b: { headline: string; texto: string; cta: string };
    image_base64?: string;
  };
}

export interface ActionItem {
  prioridade: number;
  titulo: string;
  descricao: string;
  nivel: "campanha" | "conjunto" | "anuncio" | "publico";
  impacto: "alto" | "medio" | "baixo";
  esforco: "simples" | "medio" | "complexo";
}

export interface AnalysisResult {
  client_slug: string;
  analyzed_at: string;
  proposals: Proposal[];
  alerts: Alert[];
  summary_text: string;
  plano_de_acao?: ActionItem[];
  // computed aggregates (populated by analyzeMetaAds / analyzeGoogleAds)
  spend_7d?: number;
  leads_7d?: number;
  whatsapp_7d?: number;
  avg_ctr?: number;
  conversions_7d?: number;
  cost_per_conversion?: number;
}

export interface GoogleAdMetrics {
  ad_group_id: string;
  ad_group_name: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cost_per_conversion: number;
}

export interface Alert {
  id: string;
  level: "info" | "warning" | "critical";
  title: string;
  message: string;
  entity_name: string;
}
