"use client";

import { useEffect, useState } from "react";

interface Campaign { id: string; name: string; objective: string }
interface Adset { id: string; name: string; campaign_id: string; optimization_goal: string }

interface Props {
  slug: string;
  clientName: string;
  viewKey: string;
  /** Adset pré-selecionado (quando vem do contexto de uma sub_acao). */
  preselectedAdsetId?: string;
  preselectedCampaignId?: string;
  /** Nome do adset pra exibir como contexto fixo. Quando presente
   *  com preselectedAdsetId, o modal esconde os selects e usa só esse alvo. */
  preselectedAdsetName?: string;
  /** Label exibido no botão que abre o modal. */
  triggerLabel?: string;
  /** Variante visual do botão. */
  variant?: "primary" | "subtle";
}

type Tab = "file" | "drive" | "instagram";

export default function UploadCriativoModal({
  slug, clientName, viewKey, preselectedAdsetId, preselectedCampaignId, preselectedAdsetName, triggerLabel, variant,
}: Props) {
  const targetLocked = !!preselectedAdsetId;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("file");
  const [file, setFile] = useState<File | null>(null);
  const [driveLink, setDriveLink] = useState("");
  const [igLink, setIgLink] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adsets, setAdsets] = useState<Adset[]>([]);
  const [campaignId, setCampaignId] = useState(preselectedCampaignId ?? "");
  const [adsetId, setAdsetId] = useState(preselectedAdsetId ?? "");
  const [headline, setHeadline] = useState("");
  const [texto, setTexto] = useState("");
  const [cta, setCta] = useState("WHATSAPP_MESSAGE");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!open || campaigns.length > 0) return;
    fetch(`/api/creatives/list-targets?slug=${encodeURIComponent(slug)}&view_key=${encodeURIComponent(viewKey)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setResult({ ok: false, msg: d.error });
        else {
          setCampaigns(d.campaigns ?? []);
          setAdsets(d.adsets ?? []);
          // Quando há preselectedAdsetId mas o campaign_id veio vazio do contexto,
          // descobre via lookup nos adsets carregados.
          if (preselectedAdsetId && !preselectedCampaignId) {
            const a = (d.adsets ?? []).find((x: Adset) => x.id === preselectedAdsetId);
            if (a) setCampaignId(a.campaign_id);
          }
        }
      })
      .catch(e => setResult({ ok: false, msg: String(e) }));
  }, [open, slug, viewKey, campaigns.length, preselectedAdsetId, preselectedCampaignId]);

  const adsetsFiltered = campaignId ? adsets.filter(a => a.campaign_id === campaignId) : adsets;

  async function submit() {
    setLoading(true); setResult(null);
    try {
      // Quando o destino vem pré-fixado (Ação 5 do checklist), usa ele direto;
      // senão, usa o que o usuário selecionou.
      const finalAdsetId = preselectedAdsetId ?? adsetId;
      const finalCampaignId = preselectedCampaignId ?? campaignId;
      if (!finalAdsetId || !finalCampaignId) throw new Error("Selecione campanha e conjunto");

      let body: BodyInit;
      const headers: Record<string, string> = {};
      if (tab === "file") {
        if (!file) throw new Error("Selecione um arquivo");
        const fd = new FormData();
        fd.set("file", file);
        fd.set("view_key", viewKey); fd.set("slug", slug);
        fd.set("campaign_id", finalCampaignId); fd.set("adset_id", finalAdsetId);
        fd.set("headline", headline); fd.set("texto", texto); fd.set("cta", cta);
        body = fd;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({
          view_key: viewKey, slug, campaign_id: finalCampaignId, adset_id: finalAdsetId,
          headline, texto, cta,
          drive_link: tab === "drive" ? driveLink : undefined,
          instagram_link: tab === "instagram" ? igLink : undefined,
        });
      }
      const r = await fetch("/api/creatives/upload-and-deploy", { method: "POST", headers, body });
      const data = await r.json();
      if (r.ok && data.ok) {
        setResult({ ok: true, msg: `Anúncio criado em PAUSED (ad ${data.ad_id}). Revise no Meta antes de ativar.` });
      } else {
        setResult({ ok: false, msg: data.message ?? data.error ?? `HTTP ${r.status}` });
      }
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setLoading(false);
    }
  }

  const triggerCls = variant === "subtle"
    ? "text-xs px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300"
    : "text-xs px-3 py-1 rounded border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/15 text-purple-200";

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerCls}>
        {triggerLabel ?? "Enviar criativo"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => !loading && setOpen(false)}>
          <div className="bg-[#0e0e10] border border-zinc-700 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-zinc-800 flex items-baseline justify-between">
              <h3 className="font-semibold text-zinc-100">Subir criativo — {clientName}</h3>
              <button onClick={() => !loading && setOpen(false)} className="text-zinc-500 hover:text-zinc-200">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Tabs */}
              <div className="flex gap-1 border-b border-zinc-800">
                {(["file", "drive", "instagram"] as Tab[]).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1.5 text-xs border-b-2 -mb-px ${tab === t ? "border-purple-400 text-purple-300" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
                    {t === "file" ? "Arquivo" : t === "drive" ? "Link Drive" : "Link Instagram"}
                  </button>
                ))}
              </div>

              {tab === "file" && (
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Imagem (PNG/JPG)</label>
                  <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}
                    className="text-xs text-zinc-300 file:mr-3 file:px-3 file:py-1 file:rounded file:border file:border-zinc-700 file:bg-zinc-800 file:text-zinc-200" />
                </div>
              )}

              {tab === "drive" && (
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Link compartilhado do Google Drive</label>
                  <input type="url" placeholder="https://drive.google.com/file/d/..." value={driveLink} onChange={e => setDriveLink(e.target.value)}
                    className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200" />
                  <p className="text-[11px] text-zinc-500 mt-1">Arquivo precisa estar com acesso &quot;qualquer pessoa com o link&quot;.</p>
                </div>
              )}

              {tab === "instagram" && (
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Link da publicação no Instagram (post público)</label>
                  <input type="url" placeholder="https://www.instagram.com/p/..." value={igLink} onChange={e => setIgLink(e.target.value)}
                    className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200" />
                  <p className="text-[11px] text-zinc-500 mt-1">Funciona melhor com posts públicos com imagem (vídeos podem precisar de upload manual).</p>
                </div>
              )}

              {targetLocked ? (
                <div className="bg-zinc-900/60 border border-zinc-700 rounded px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Destino (já definido pelo checklist)</p>
                  <p className="text-sm text-zinc-100">
                    GA: <span className="font-medium">{preselectedAdsetName ?? adsets.find(a => a.id === preselectedAdsetId)?.name ?? `id ${preselectedAdsetId}`}</span>
                  </p>
                  {campaignId && (
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Campanha: {campaigns.find(c => c.id === campaignId)?.name ?? `id ${campaignId}`}
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">Campanha</label>
                    <select value={campaignId} onChange={e => { setCampaignId(e.target.value); setAdsetId(""); }}
                      className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200">
                      <option value="">— escolha —</option>
                      {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">Conjunto de anúncios</label>
                    <select value={adsetId} onChange={e => setAdsetId(e.target.value)} disabled={!campaignId}
                      className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 disabled:opacity-50">
                      <option value="">— escolha —</option>
                      {adsetsFiltered.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Headline (≤40 caracteres)</label>
                <input value={headline} onChange={e => setHeadline(e.target.value.slice(0, 40))}
                  className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Texto principal (≤125 caracteres)</label>
                <textarea value={texto} onChange={e => setTexto(e.target.value.slice(0, 125))} rows={2}
                  className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">CTA</label>
                <select value={cta} onChange={e => setCta(e.target.value)}
                  className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200">
                  <option value="WHATSAPP_MESSAGE">WHATSAPP_MESSAGE</option>
                  <option value="LEARN_MORE">LEARN_MORE</option>
                  <option value="SHOP_NOW">SHOP_NOW</option>
                  <option value="SIGN_UP">SIGN_UP</option>
                  <option value="CONTACT_US">CONTACT_US</option>
                  <option value="GET_QUOTE">GET_QUOTE</option>
                </select>
              </div>

              {result && (
                <div className={`text-xs px-3 py-2 rounded border ${result.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
                  {result.msg}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button onClick={() => setOpen(false)} disabled={loading}
                  className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancelar</button>
                <button onClick={submit} disabled={loading || !campaignId || (!adsetId && !preselectedAdsetId) || !headline}
                  className="text-xs px-4 py-1.5 rounded border border-purple-500/50 bg-purple-500/15 hover:bg-purple-500/25 text-purple-100 disabled:opacity-40">
                  {loading ? "Subindo…" : "Subir criativo (PAUSED)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
