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
  | { type: "scale_budget"; adset_id: string; new_budget_cents: number; campaign_id?: string }
  | { type: "update_adset_targeting"; adset_id: string; targeting: Record<string, unknown>; targeting_summary_new: string }
  | { type: "create_adset"; campaign_id: string; adset_name: string; targeting: Record<string, unknown>; optimization_goal: string; bid_strategy?: string; daily_budget_cents?: number; targeting_summary_new: string }
  | { type: "pause_google_ad_group"; ad_group_id: string; customer_id: string }
  | { type: "pause_google_campaign"; campaign_id: string; customer_id: string }
  | { type: "scale_google_campaign"; campaign_id: string; customer_id: string }
  | { type: "none" };

export type AjusteTipo = "criativo" | "publico" | "lance" | "configuracao";

export interface Proposal {
  id: string;
  ad_id: string;
  ad_name: string;
  adset_name: string;
  campaign_name: string;
  verdict: ProposalVerdict;
  ajuste_tipo?: AjusteTipo;
  titulo: string;
  diagnostico: string;
  metricas_problema: string[];
  acao_sugerida: string;
  action: ProposalAction;
  status:
    | "pending" | "approved" | "rejected" | "ignored"
    | "creative_requested" | "generating" | "creative_error"
    | "executed" | "failed" | "skipped_gate" | "awaiting_approval"
    | "undone" | "no_action";
  /** Estado anterior à execução automática — usado para desfazer. */
  previous_state?:
    | { kind: "ad_status"; ad_id: string; old: "ACTIVE" | "PAUSED" }
    | { kind: "adset_budget"; adset_id: string; old_daily_budget_cents: number }
    | { kind: "campaign_budget"; campaign_id: string; old_daily_budget_cents: number }
    | { kind: "google_adgroup_status"; ad_group_id: string; customer_id: string; old: "ENABLED" | "PAUSED" }
    | { kind: "google_campaign_budget"; campaign_id: string; customer_id: string; old_budget_reais: number };
  /** Inputs para os gates da metodologia 12345 (preenchidos na análise). */
  gate_inputs?: { spend?: number; days_running?: number; campaign_spend?: number };
  /** ISO timestamp de quando a ação automática foi executada. */
  executed_at?: string;
  created_at: string;
  resolved_at?: string;
  result_message?: string;
  copy_sugerida?: {
    versao_a: { headline: string; texto: string; cta: string };
    versao_b: { headline: string; texto: string; cta: string };
    image_base64?: string;
  };
  score?: number;
  budget_sugerido_cents?: number;
  /** Set quando status="creative_requested": id do melhor anúncio da conta usado como referência. */
  best_ad_id?: string;
  /** Feedback do gestor para refinar a copy — passado ao conteudo-agent quando
   * o usuário pede "menos texto", "foca na localização", "urgência maior", etc. */
  refinement_feedback?: string;
}

export interface ActionItem {
  prioridade: number;
  titulo: string;
  descricao: string;
  nivel: "campanha" | "conjunto" | "anuncio" | "publico";
  impacto: "alto" | "medio" | "baixo";
  esforco: "simples" | "medio" | "complexo";
}

export interface NovaCampanhaAdset {
  nome: string;
  targeting_summary: string;
  daily_budget_cents?: number;
}

export interface NovaCampanhaAd {
  nome_proposto: string;
  /** Ad existente que serve de referência visual/copy (id no Meta). */
  referencia_ad_id?: string;
  copy: { headline: string; texto: string; cta: string };
  /** Notas pro design: render/tom/branding/elementos visuais a usar. */
  notas_visual?: string;
}

export interface NovaCampanhaSpec {
  nome: string;
  objetivo: string;
  daily_budget_cents: number;
  adsets: NovaCampanhaAdset[];
  /** Ads da nova campanha — quando substituir, monta também o que entra. */
  ads?: NovaCampanhaAd[];
  notas?: string;
}

/** Anúncio dentro de uma campanha com seu PAPEL (o que fazer com ele). */
export interface CampaignAdRole {
  ad_id: string;
  ad_name: string;
  papel: "manter" | "escalar" | "pausar" | "substituir" | "testar";
  motivo: string;
  score?: number;
}

/** Público (adset) dentro de uma campanha com o PAPEL (manter ou trocar). */
export interface CampaignPublicoRole {
  adset_id: string;
  adset_name: string;
  papel: "manter" | "trocar";
  motivo: string;
  /** Quando papel="trocar", a especificação do público substituto. */
  substituir_por?: { targeting_summary: string; racional: string };
}

export interface CampaignAnalysis {
  campaign_id: string;
  campaign_name: string;
  verdict: "manter" | "ajustar" | "substituir" | "pausar";
  pontos_bons: string[];
  pontos_ruins: string[];
  o_que_mudar: string[];
  /** Lista explícita de cada ad da campanha com seu papel — torna óbvio
   * "qual usar / qual pausar / qual substituir" dentro da campanha. */
  anuncios?: CampaignAdRole[];
  /** Lista explícita de públicos (adsets) com manter/trocar e o substituto. */
  publicos?: CampaignPublicoRole[];
  nova_estrutura?: NovaCampanhaSpec;
}

/** Item do checklist da Revisão Diária (escopo ClickUp). */
export interface ChecklistSubAction {
  /** Texto livre — descrição da sub-ação proposta. */
  descricao: string;
  /** IDs relevantes (opcional). */
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  /** Métricas relevantes pro contexto (opcional). */
  cpl_atual?: number;
  daily_budget_atual?: number;
  daily_budget_sugerido?: number;
  ads_ativos_atual?: number;
  ads_faltantes?: number;
  /** Sugestões textuais (pra ação 2 e 5). */
  sugestao_novo_criativo?: string;
  sugestao_novo_publico?: string;
  motivo?: string;
  /** Action concreta se UI for executar (pause_ad, scale_budget, etc) */
  action?: ProposalAction;
}

export interface ChecklistAction {
  /** ID estável da ação (1..5) pra UI casar com ícone certo. */
  id: number;
  titulo: string;
  /** "check" = tudo ok. "atencao" = tem sub_acoes. "verificar_manual" = exige humano. */
  status: "check" | "atencao" | "verificar_manual";
  resumo: string;
  sub_acoes: ChecklistSubAction[];
}

export interface AnalysisResult {
  client_slug: string;
  analyzed_at: string;
  proposals: Proposal[];
  alerts: Alert[];
  summary_text: string;
  plano_de_acao?: ActionItem[];
  /** Checklist da Revisão Diária (formato ClickUp). Sempre 5 ações. */
  checklist?: ChecklistAction[];
  /** Análise estruturada por campanha (gerada pelo analyzer). Opcional para
   * compatibilidade com relatórios antigos — UI cai no view flat se ausente. */
  campaigns_analysis?: CampaignAnalysis[];
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
