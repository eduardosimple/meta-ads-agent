import { NextRequest, NextResponse } from "next/server";
import { getGoogleTokens, applyRefreshedTokenCookie } from "@/lib/google-auth";
import { getClientBySlug } from "@/lib/clients";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export async function POST(req: NextRequest) {
  const tokenResult = await getGoogleTokens(req);
  if (!tokenResult) {
    return NextResponse.json(
      { error: "google_auth_required" },
      { status: 401 }
    );
  }

  const { tokens, newEncrypted } = tokenResult;

  let body: { fileId?: string; clientSlug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { fileId, clientSlug } = body;

  if (!fileId || typeof fileId !== "string") {
    return NextResponse.json({ error: "fileId é obrigatório" }, { status: 400 });
  }
  if (!clientSlug || typeof clientSlug !== "string") {
    return NextResponse.json({ error: "clientSlug é obrigatório" }, { status: 400 });
  }

  const client = await getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }
  if (!client.ativo) {
    return NextResponse.json({ error: "Cliente inativo" }, { status: 403 });
  }

  // First, get file metadata to know the name and mimeType
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  );

  if (!metaRes.ok) {
    if (metaRes.status === 401) {
      return NextResponse.json({ error: "google_auth_required" }, { status: 401 });
    }
    return NextResponse.json({ error: "Arquivo não encontrado no Drive" }, { status: 404 });
  }

  const fileMeta = (await metaRes.json()) as { name: string; mimeType: string };

  // Download the file content from Google Drive
  const downloadRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  );

  if (!downloadRes.ok) {
    if (downloadRes.status === 401) {
      return NextResponse.json({ error: "google_auth_required" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erro ao baixar arquivo do Drive" }, { status: 502 });
  }

  // Read the response as an ArrayBuffer (no disk writes)
  const fileBuffer = await downloadRes.arrayBuffer();
  const fileName = fileMeta.name || "drive-image.jpg";

  // Upload to Meta Graph API /{ad_account_id}/adimages
  const metaFormData = new FormData();
  metaFormData.append("access_token", client.meta.access_token);
  metaFormData.append(
    "filename",
    new File([fileBuffer], fileName, { type: fileMeta.mimeType }),
    fileName
  );

  const metaUploadUrl = `${META_API_BASE}/${client.meta.ad_account_id}/adimages`;
  const metaUploadRes = await fetch(metaUploadUrl, {
    method: "POST",
    body: metaFormData,
  });

  const metaData = await metaUploadRes.json();
  if (!metaUploadRes.ok || metaData.error) {
    throw new Error(metaData.error?.message ?? `Meta API error: ${metaUploadRes.status}`);
  }

  // Meta returns: { images: { filename: { hash, url, ... } } }
  const images = metaData.images as Record<string, { hash: string; url: string }>;
  const imageKey = Object.keys(images)[0];
  const imageData = images[imageKey];

  const res = NextResponse.json({
    hash: imageData.hash,
    name: fileName,
  });

  applyRefreshedTokenCookie(res, newEncrypted);

  return res;
}
