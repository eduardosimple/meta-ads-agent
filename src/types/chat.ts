export type MessageRole = "user" | "assistant";

export interface CreativeApprovalData {
  versao_a: { headline: string; texto: string; cta: string };
  versao_b: { headline: string; texto: string; cta: string };
  image_base64: string;
  cliente: string;
  criativo_id?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  creative?: CreativeApprovalData;
}

export interface ChatRequest {
  message: string;
  clientSlug: string;
  history: Array<{ role: MessageRole; content: string }>;
}

export interface ChatResponse {
  content: string;
}
