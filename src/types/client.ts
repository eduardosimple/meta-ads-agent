export interface ClientMeta {
  access_token: string;
  ad_account_id: string;
  app_id: string;
  app_secret: string;
  page_id: string;
  page_name: string;
  whatsapp_number?: string;
  instagram_actor_id?: string;
}

export interface ClientGoogle {
  customer_id: string;           // e.g. "123-456-7890" or "1234567890"
  developer_token: string;       // sensitive
  client_id: string;
  client_secret: string;         // sensitive
  refresh_token: string;         // sensitive
  manager_customer_id?: string;  // MCC login-customer-id (optional)
}

export interface ClientContexto {
  segmento: string;
  cidade: string;
  estado: string;
  publico_alvo: string;
  orcamento_diario_padrao: number;
  objetivo_padrao: string;
  orcamento_mensal_cents?: number; // se definido, limita escalonamentos e informa Claude
}

export interface Client {
  nome: string;
  slug: string;
  ativo: boolean;
  meta: ClientMeta;
  google?: ClientGoogle;
  contexto: ClientContexto;
}

export interface ClientsFile {
  clientes: Client[];
}

/** Safe client — no secrets returned to browser */
export interface ClientPublic {
  nome: string;
  slug: string;
  ativo: boolean;
  meta: Omit<ClientMeta, "access_token" | "app_secret">;
  google?: Pick<ClientGoogle, "customer_id" | "manager_customer_id">;
  contexto: ClientContexto;
}
