import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/reports-store";
import { getClientBySlug } from "@/lib/clients";
import {
  getAdAdsetId,
  getAdsetDetails,
  getAdImageHash,
  uploadAdImage,
  createAdCreative,
  createAd,
  pauseEntity,
} from "@/lib/meta-api";

// POST /api/daily-reports/[slug]/proposals/approve
// Body: { date, ad_id, platform, versao: "a" | "b" }
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const cronKey = req.headers.get("x-cron-key");
  const authHeader = req.headers.get("authorization");
  const reportKey = req.headers.get("x-report-key");
  const secret = process.env.CRON_SECRET;
  const reportSecret = process.env.REPORT_VIEW_SECRET;
  const valid =
    (cronKey && cronKey === secret) ||
    (authHeader && authHeader === `Bearer ${secret}`) ||
    (reportKey && reportSecret && reportKey === reportSecret);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    date: string;
    ad_id: string;
    platform: "meta" | "google";
    versao: "a" | "b";
  };

  const { date, ad_id, platform, versao } = body;
  if (!date || !ad_id || !platform || !versao)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const report = await getReport(params.slug, date);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const analysis = report[platform];
  if (!analysis) return NextResponse.json({ error: `No ${platform} data` }, { status: 404 });

  const propIdx = analysis.proposals.findIndex(p => p.ad_id === ad_id);
  if (propIdx === -1) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const proposal = analysis.proposals[propIdx];
  const copy = proposal.copy_sugerida;
  if (!copy) return NextResponse.json({ error: "No copy_sugerida on proposal" }, { status: 400 });

  const chosen = versao === "a" ? copy.versao_a : copy.versao_b;

  const client = await getClientBySlug(params.slug);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (platform !== "meta") return NextResponse.json({ error: "Only Meta supported" }, { status: 400 });

  const { access_token, ad_account_id, page_id } = client.meta;
  const instagram_actor_id = client.meta.instagram_actor_id;
  const whatsapp_number = client.meta.whatsapp_number;

  try {
    // Get adset to determine destination type
    const adsetId = await getAdAdsetId(ad_id, access_token);
    const adsetDetails = await getAdsetDetails(adsetId, access_token);
    const isWhatsApp = adsetDetails.optimization_goal === "CONVERSATIONS" || adsetDetails.destination_type === "WHATSAPP";

    // Get image: use provided base64 or fall back to original ad's image hash
    let imageHash: string;
    if (copy.image_base64) {
      const imgBuf = Buffer.from(copy.image_base64, "base64");
      const filename = `${params.slug}-${ad_id}-${versao}.png`;
      imageHash = await uploadAdImage(ad_account_id, access_token, imgBuf, filename);
    } else {
      const originalHash = await getAdImageHash(ad_id, access_token);
      if (!originalHash) return NextResponse.json({ error: "Sem imagem disponível. Forneça image_base64 na proposta." }, { status: 400 });
      imageHash = originalHash;
    }

    // Create creative following skill rules (WhatsApp vs Website CTA)
    const creativeName = `[AUTO] ${proposal.ad_name} → V${versao.toUpperCase()} ${date}`;
    const creativeId = await createAdCreative(ad_account_id, access_token, {
      name: creativeName,
      pageId: page_id,
      instagramActorId: instagram_actor_id,
      imageHash,
      message: chosen.texto,
      headline: chosen.headline,
      destinationType: isWhatsApp ? "WHATSAPP" : "WEBSITE",
      whatsappNumber: isWhatsApp ? whatsapp_number : undefined,
      cta: isWhatsApp ? "WHATSAPP_MESSAGE" : (chosen.cta === "Fale no WhatsApp" ? "WHATSAPP_MESSAGE" : "LEARN_MORE"),
    });

    // Create new ad PAUSED in same adset
    const newAdName = `${proposal.ad_name} [SUBST ${date} V${versao.toUpperCase()}]`;
    const newAdId = await createAd(ad_account_id, access_token, adsetId, creativeId, newAdName);

    // Pause original ad
    await pauseEntity(ad_id, access_token);

    analysis.proposals[propIdx].status = "approved";
    analysis.proposals[propIdx].resolved_at = new Date().toISOString();
    analysis.proposals[propIdx].result_message = `Novo anúncio ${newAdId} criado (PAUSADO). Original ${ad_id} pausado.`;
    await saveReport(report);

    return NextResponse.json({ ok: true, new_ad_id: newAdId, creative_id: creativeId, paused: ad_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
