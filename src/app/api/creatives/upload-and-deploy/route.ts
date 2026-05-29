/**
 * POST /api/creatives/upload-and-deploy
 *
 * Recebe um criativo (file/drive_link/instagram_link), faz upload pro Meta,
 * cria Ad Creative e Ad no adset escolhido (com status=PAUSED — gestor revisa
 * antes de ativar no painel Meta).
 *
 * Aceita FormData OU JSON:
 *  - FormData: file (binário) + slug + campaign_id + adset_id + headline + texto + cta + view_key
 *  - JSON: { slug, drive_link OR instagram_link, campaign_id, adset_id, headline,
 *           texto, cta, view_key }
 *
 * Autenticação via view_key (mesmo REPORT_VIEW_SECRET da URL dos relatórios).
 *
 * Drive: aceita share link (https://drive.google.com/file/d/<id>/...) e converte
 * pra URL direta de download. Arquivo precisa estar com acesso "qualquer um com o link".
 *
 * Instagram: extrai media_url via oembed do Facebook Graph API.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { uploadAdImage, createAdCreative, createAd, getAdsetDetails } from "@/lib/meta-api";

export const maxDuration = 120;

function authOK(viewKey: string | null): boolean {
  return viewKey === process.env.REPORT_VIEW_SECRET;
}

/** Converte share link do Drive em URL de download direto. */
function driveDirectUrl(shareLink: string): string {
  const m = shareLink.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  const idParam = new URL(shareLink).searchParams.get("id");
  if (idParam) return `https://drive.google.com/uc?export=download&id=${idParam}`;
  // Se já é uc?export=download, devolve como veio
  return shareLink;
}

async function fetchAsBuffer(url: string): Promise<{ buf: Buffer; contentType: string; filename: string }> {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`fetch ${url} → HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const contentType = r.headers.get("content-type") ?? "application/octet-stream";
  const cd = r.headers.get("content-disposition") ?? "";
  let filename = cd.match(/filename="?([^"]+)"?/)?.[1] ?? url.split("/").pop()?.split("?")[0] ?? "criativo.png";
  if (!filename.includes(".")) {
    const ext = contentType.includes("video") ? ".mp4" : contentType.includes("png") ? ".png" : ".jpg";
    filename = `criativo${ext}`;
  }
  return { buf, contentType, filename };
}

/** Extrai URL da media de um post Instagram público via Graph oembed (best-effort). */
async function instagramMediaUrl(igLink: string, accessToken: string): Promise<string> {
  // Tenta oembed (público)
  const oembedRes = await fetch(
    `https://graph.facebook.com/v19.0/instagram_oembed?url=${encodeURIComponent(igLink)}&access_token=${encodeURIComponent(accessToken)}`,
  );
  const oembed = await oembedRes.json();
  if (oembed?.thumbnail_url) return oembed.thumbnail_url;
  throw new Error("Não consegui extrair media do link Instagram. Cole o link direto da imagem/vídeo ou use o Drive.");
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let payload: {
    view_key?: string;
    slug?: string;
    campaign_id?: string;
    adset_id?: string;
    headline?: string;
    texto?: string;
    cta?: string;
    drive_link?: string;
    instagram_link?: string;
    /** Imagem em base64 — usado pelo fluxo "Aprovar e criar ad novo no GA" (vem do ApprovalCard). */
    image_base64?: string;
    file_buffer?: Buffer;
    file_name?: string;
    file_type?: string;
  } = {};

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    payload.view_key = form.get("view_key")?.toString() ?? "";
    payload.slug = form.get("slug")?.toString() ?? "";
    payload.campaign_id = form.get("campaign_id")?.toString() ?? "";
    payload.adset_id = form.get("adset_id")?.toString() ?? "";
    payload.headline = form.get("headline")?.toString() ?? "";
    payload.texto = form.get("texto")?.toString() ?? "";
    payload.cta = form.get("cta")?.toString() ?? "WHATSAPP_MESSAGE";
    payload.drive_link = form.get("drive_link")?.toString();
    payload.instagram_link = form.get("instagram_link")?.toString();
    const file = form.get("file") as File | null;
    if (file && file.size > 0) {
      payload.file_buffer = Buffer.from(await file.arrayBuffer());
      payload.file_name = file.name;
      payload.file_type = file.type;
    }
  } else {
    payload = await req.json();
  }

  if (!authOK(payload.view_key ?? null)) {
    return NextResponse.json({ error: "invalid_view_key" }, { status: 401 });
  }
  if (!payload.slug || !payload.campaign_id || !payload.adset_id) {
    return NextResponse.json({ error: "slug, campaign_id e adset_id obrigatórios" }, { status: 400 });
  }

  const client = await getClientBySlug(payload.slug);
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  if (!client.meta?.access_token || !client.meta?.ad_account_id || !client.meta?.page_id) {
    return NextResponse.json({ error: "cliente sem credenciais Meta completas (token + ad_account + page_id)" }, { status: 400 });
  }
  const token = client.meta.access_token;
  const adAccount = client.meta.ad_account_id;
  const pageId = client.meta.page_id;

  // 1. Obter buffer do criativo
  let buf: Buffer; let mime: string; let filename: string;
  try {
    if (payload.file_buffer) {
      buf = payload.file_buffer;
      mime = payload.file_type ?? "image/png";
      filename = payload.file_name ?? "criativo.png";
    } else if (payload.image_base64) {
      // Aceita data URL (data:image/png;base64,...) ou base64 puro
      const m = payload.image_base64.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        mime = m[1];
        buf = Buffer.from(m[2], "base64");
      } else {
        mime = "image/png";
        buf = Buffer.from(payload.image_base64, "base64");
      }
      filename = `criativo-ai-${Date.now()}.${mime.includes("png") ? "png" : "jpg"}`;
    } else if (payload.drive_link) {
      const dl = driveDirectUrl(payload.drive_link);
      const got = await fetchAsBuffer(dl);
      buf = got.buf; mime = got.contentType; filename = got.filename;
    } else if (payload.instagram_link) {
      const mediaUrl = await instagramMediaUrl(payload.instagram_link, token);
      const got = await fetchAsBuffer(mediaUrl);
      buf = got.buf; mime = got.contentType; filename = got.filename;
    } else {
      return NextResponse.json({ error: "envie file, drive_link, instagram_link OU image_base64" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: "fetch_source_failed", message: String(e) }, { status: 400 });
  }

  // Por ora só imagens — vídeo precisa de pipeline assíncrono (upload com session)
  if (!mime.startsWith("image/") && !filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
    return NextResponse.json({
      error: "unsupported_media",
      message: `${mime}/${filename} — somente imagem suportada por enquanto (video em construção)`,
    }, { status: 400 });
  }

  // 2. Validar adset e obter destination type
  let adsetMeta: Awaited<ReturnType<typeof getAdsetDetails>>;
  try {
    adsetMeta = await getAdsetDetails(payload.adset_id, token);
  } catch (e) {
    return NextResponse.json({ error: "adset_fetch_failed", message: String(e) }, { status: 400 });
  }
  // Validar que adset pertence à campanha informada
  if (adsetMeta.campaign_id && adsetMeta.campaign_id !== payload.campaign_id) {
    return NextResponse.json({ error: "adset_campaign_mismatch", message: `Adset ${payload.adset_id} pertence à campanha ${adsetMeta.campaign_id}, não à ${payload.campaign_id}.` }, { status: 400 });
  }

  // 3. Upload imagem → hash
  let imageHash: string;
  try {
    imageHash = await uploadAdImage(adAccount, token, buf, filename);
  } catch (e) {
    return NextResponse.json({ error: "upload_image_failed", message: String(e) }, { status: 500 });
  }

  // 4. Definir destination type baseado em optimization_goal do adset
  const goal = adsetMeta.optimization_goal ?? "";
  const isWhatsApp = goal === "CONVERSATIONS";
  const destinationType: "WHATSAPP" | "WEBSITE" | "FACEBOOK" =
    isWhatsApp ? "WHATSAPP" : ["LEAD_GENERATION", "LINK_CLICKS", "OFFSITE_CONVERSIONS"].includes(goal) ? "WEBSITE" : "FACEBOOK";

  // 5. Criar Ad Creative
  let creativeId: string;
  try {
    const creativeName = `[upload portal] ${(payload.headline ?? "").slice(0, 40)} ${new Date().toISOString().slice(0, 10)}`;
    creativeId = await createAdCreative(adAccount, token, {
      name: creativeName,
      pageId,
      imageHash,
      message: payload.texto ?? payload.headline ?? "",
      headline: payload.headline ?? "",
      destinationType,
      whatsappNumber: isWhatsApp ? (client.meta.page_name?.match(/\d{10,}/)?.[0] ?? undefined) : undefined,
      cta: payload.cta,
    });
  } catch (e) {
    return NextResponse.json({ error: "create_creative_failed", message: String(e), image_hash: imageHash }, { status: 500 });
  }

  // 6. Criar Ad no adset, status PAUSED (Meta cria PAUSED por padrão? createAd helper não força — ad herda do adset usually; regra do portal é nada ativo sem revisão)
  let adId: string;
  try {
    const adName = `[upload portal] ${(payload.headline ?? "novo criativo").slice(0, 50)} ${new Date().toISOString().slice(0, 10)}`;
    adId = await createAd(adAccount, token, payload.adset_id, creativeId, adName);
    // Garante PAUSED logo após criar (idempotente — se já estiver, sem-op)
    await fetch(`https://graph.facebook.com/v19.0/${adId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED", access_token: token }),
    });
  } catch (e) {
    return NextResponse.json({ error: "create_ad_failed", message: String(e), creative_id: creativeId }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ad_id: adId,
    creative_id: creativeId,
    image_hash: imageHash,
    status: "PAUSED",
    adset_id: payload.adset_id,
    campaign_id: payload.campaign_id,
    nota: "Anúncio criado em PAUSED. Revise no Meta e ative manualmente.",
  });
}
