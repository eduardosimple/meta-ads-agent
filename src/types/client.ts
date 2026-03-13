export interface ClientMeta {
  access_token: string;
  ad_account_id: string;
  app_id: string;
  app_secret: string;
  page_id: string;
  page_name: string;
}

export interface ClientContexto {
  segmento: string;
  cidade: string;
  estado: string;
  publico_alvo: string;
  orcamento_diario_padrao: number;
  objetivo_padrao: string;
}

export interface Client {
  nome: string;
  slug: string;
  ativo: boolean;
  meta: ClientMeta;
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
  contexto: ClientContexto;
}
