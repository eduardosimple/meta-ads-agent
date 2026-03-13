import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  getClients,
  getClientBySlug,
  upsertClient,
  deleteClientBySlug,
} from "@/lib/clients";
import type { Client, ClientPublic } from "@/types/client";

function toPublic(client: Client): ClientPublic {
  return {
    nome: client.nome,
    slug: client.slug,
    ativo: client.ativo,
    meta: {
      ad_account_id: client.meta.ad_account_id,
      app_id: client.meta.app_id,
      page_id: client.meta.page_id,
      page_name: client.meta.page_name,
    },
    contexto: client.contexto,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const full = searchParams.get("full") === "true";

  if (slug && full) {
    const client = await getClientBySlug(slug);
    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    return NextResponse.json(client);
  }

  if (slug) {
    const client = await getClientBySlug(slug);
    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    return NextResponse.json(toPublic(client));
  }

  const clients = await getClients();
  return NextResponse.json({ clientes: clients.map(toPublic) });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body: Client = await req.json();
  if (!body.slug || !body.nome) {
    return NextResponse.json({ error: "nome e slug são obrigatórios" }, { status: 400 });
  }

  await upsertClient(body);
  return NextResponse.json({ success: true, client: toPublic(body) }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body: Client = await req.json();
  if (!body.slug) {
    return NextResponse.json({ error: "slug é obrigatório" }, { status: 400 });
  }

  await upsertClient(body);
  return NextResponse.json({ success: true, client: toPublic(body) });
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "slug é obrigatório" }, { status: 400 });
  }

  const deleted = await deleteClientBySlug(slug);
  if (!deleted) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
