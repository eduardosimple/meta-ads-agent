import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const imageFile = formData.get("image");
    const clientSlug = formData.get("clientSlug");

    if (!clientSlug || typeof clientSlug !== "string") {
      return NextResponse.json({ error: "clientSlug é obrigatório" }, { status: 400 });
    }

    if (!imageFile || !(imageFile instanceof File)) {
      return NextResponse.json({ error: "Campo 'image' é obrigatório" }, { status: 400 });
    }

    const client = getClientBySlug(clientSlug);
    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    if (!client.ativo) {
      return NextResponse.json({ error: "Cliente inativo" }, { status: 403 });
    }

    // Build FormData for Meta API
    const metaFormData = new FormData();
    metaFormData.append("access_token", client.meta.access_token);
    metaFormData.append(
      "filename",
      imageFile,
      imageFile.name || "upload.jpg"
    );

    const url = `${META_API_BASE}/${client.meta.ad_account_id}/adimages`;
    const res = await fetch(url, {
      method: "POST",
      body: metaFormData,
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `Meta API error: ${res.status}`);
    }

    // Meta returns: { images: { filename: { hash, url, ... } } }
    const images = data.images as Record<
      string,
      { hash: string; url: string }
    >;
    const imageKey = Object.keys(images)[0];
    const imageData = images[imageKey];

    return NextResponse.json({
      hash: imageData.hash,
      url: imageData.url,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro no upload";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
