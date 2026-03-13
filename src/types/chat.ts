export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface ChatRequest {
  message: string;
  clientSlug: string;
  history: Array<{ role: MessageRole; content: string }>;
}

export interface ChatResponse {
  content: string;
}
