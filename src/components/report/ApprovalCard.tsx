"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CopyVersion {
  headline: string;
  texto: string;
  cta: string;
}

interface Props {
  clientSlug: string;
  date: string;
  adId: string;
  platform: "meta" | "google";
  adName: string;
  imageBase64?: string;
  versaoA: CopyVersion;
  versaoB: CopyVersion;
  initialStatus: string;
  resultMessage?: string;
  reportKey: string;
  /** Quando "new_ad_in_adset", aprovar CRIA ad novo no adset (adId vira adset_id).
   *  Default "replace_ad" mantém comportamento histórico (substitui ad). */
  requestTarget?: "replace_ad" | "new_ad_in_adset";
  targetAdsetId?: string;
}

export default function ApprovalCard({
  clientSlug, date, adId, platform, imageBase64,
  versaoA, versaoB, initialStatus, resultMessage, reportKey,
  requestTarget, targetAdsetId,
}: Props) {
  const isNewMode = requestTarget === "new_ad_in_adset";
  const adsetIdForNew = targetAdsetId ?? (isNewMode ? adId : undefined);
  const [selected, setSelected] = useState<"a" | "b">("a");
  const [status, setStatus] = useState(initialStatus);
  const [result, setResult] = useState(resultMessage ?? "");
  const [loading, setLoading] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [refining, setRefining] = useState(false);
  const router = useRouter();

  async function approve() {
    setLoading(true);
    try {
      if (isNewMode && adsetIdForNew) {
        // MODO B — criar ad NOVO no adset (Ação 5). Não substitui nada.
        if (!imageBase64) throw new Error("Imagem não disponível pra criar ad novo");
        // Pra descobrir o campaign_id do adset, consultamos list-targets do cliente
        const lt = await fetch(`/api/creatives/list-targets?slug=${encodeURIComponent(clientSlug)}&view_key=${encodeURIComponent(reportKey)}`);
        const ltData = await lt.json();
        const adset = (ltData.adsets ?? []).find((a: { id: string; campaign_id: string }) => a.id === adsetIdForNew);
        const campaignId = adset?.campaign_id;
        if (!campaignId) throw new Error(`Adset ${adsetIdForNew} não encontrado entre ativos`);
        const chosen = selected === "a" ? versaoA : versaoB;
        const res = await fetch("/api/creatives/upload-and-deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            view_key: reportKey,
            slug: clientSlug,
            campaign_id: campaignId,
            adset_id: adsetIdForNew,
            headline: chosen.headline,
            texto: chosen.texto,
            cta: chosen.cta,
            image_base64: imageBase64,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setStatus("approved");
          setResult(`Ad NOVO criado no GA: ${data.ad_id} (PAUSED). Revise no Meta.`);
          // Marca proposal como approved
          await fetch(`/api/daily-reports/${clientSlug}/proposals`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-report-key": reportKey },
            body: JSON.stringify({ date, ad_id: adId, platform, status: "approved" }),
          });
        } else {
          setResult(`Erro: ${data.message ?? data.error}`);
        }
      } else {
        // MODO A — substitui ad existente (fluxo histórico)
        const res = await fetch(`/api/daily-reports/${clientSlug}/proposals/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-report-key": reportKey },
          body: JSON.stringify({ date, ad_id: adId, platform, versao: selected }),
        });
        const data = await res.json();
        if (data.ok) {
          setStatus("approved");
          setResult(`Novo anuncio: ${data.new_ad_id}. Original pausado.`);
        } else {
          setResult(`Erro: ${data.error}`);
        }
      }
    } catch (e) {
      setResult(`Erro: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function reject() {
    setLoading(true);
    try {
      await fetch(`/api/daily-reports/${clientSlug}/proposals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-report-key": reportKey },
        body: JSON.stringify({ date, ad_id: adId, platform, status: "rejected" }),
      });
      setStatus("rejected");
    } finally {
      setLoading(false);
    }
  }

  async function submitRefinement() {
    if (!feedback.trim()) return;
    setRefining(true);
    setResult("");
    try {
      const res = await fetch(`/api/daily-reports/${clientSlug}/proposals/refine-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-report-key": reportKey },
        body: JSON.stringify({ date, ad_id: adId, platform, feedback: feedback.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("creative_requested");
        setResult("Feedback enviado ao agente. Nova versao em ate ~5 min — atualize a pagina.");
        router.refresh();
      } else {
        setResult(`Erro: ${data.error}`);
      }
    } catch (e) {
      setResult(`Erro: ${e}`);
    } finally {
      setRefining(false);
    }
  }

  if (status === "approved") {
    return (
      <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-300">
        Aprovado e publicado. {result}
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="mt-3 rounded-xl bg-[#0f0f12] border border-[#1c1c20] px-4 py-2.5 text-xs text-zinc-500">
        Criativo rejeitado.
      </div>
    );
  }

  if (status === "creative_requested" || status === "generating") {
    return (
      <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-xs text-amber-200 space-y-1">
        <p className="font-semibold text-amber-300">Refinando copy com seu feedback…</p>
        <p>O conteudo-agent vai gerar uma nova versão. Atualize a pagina em ~5min.</p>
        {result && <p className="text-amber-200/80 italic">{result}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[#1c1c20] bg-[#18181b] overflow-hidden">
      {imageBase64 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${imageBase64}`}
          alt="Criativo sugerido"
          className="w-full aspect-square object-cover"
        />
      )}
      <div className="p-4 space-y-3">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.22em]">Copy sugerida — escolha A ou B</p>

        {/* As DUAS versões visíveis lado a lado, clicáveis para selecionar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(["a", "b"] as const).map(v => {
            const c = v === "a" ? versaoA : versaoB;
            const isSelected = selected === v;
            return (
              <button
                key={v}
                onClick={() => setSelected(v)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50"
                    : "border-[#1c1c20] bg-[#0f0f12] hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] tracking-[0.22em] uppercase font-bold ${isSelected ? "text-blue-300" : "text-zinc-500"}`}>
                    Versão {v.toUpperCase()}
                  </span>
                  {isSelected && <span className="text-blue-300 text-xs">✓</span>}
                </div>
                <p className="text-sm font-semibold text-zinc-100 leading-snug">{c.headline}</p>
                <p className="text-xs text-zinc-400 mt-1 leading-snug">{c.texto}</p>
                <p className="text-[10px] text-zinc-500 mt-1.5 font-mono uppercase">cta: {c.cta}</p>
              </button>
            );
          })}
        </div>

        {result && <p className="text-xs text-rose-400">{result}</p>}

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={approve}
            disabled={loading || refining}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#7c3aed] to-[#3b82f6] hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_4px_20px_-4px_rgba(124,58,237,0.4)]"
          >
            {loading
              ? (isNewMode ? "Criando ad novo..." : "Publicando...")
              : isNewMode
                ? `Aprovar Versão ${selected.toUpperCase()} e Criar Ad NOVO no GA`
                : `Aprovar Versão ${selected.toUpperCase()} e Publicar`}
          </button>
          <button
            onClick={reject}
            disabled={loading || refining}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 bg-zinc-800/60 hover:bg-zinc-700/60 disabled:opacity-50 transition-colors"
          >
            Rejeitar
          </button>
        </div>

        {/* Feedback / refinamento */}
        <div className="pt-2 border-t border-[#1c1c20]">
          {!feedbackOpen ? (
            <button
              onClick={() => setFeedbackOpen(true)}
              disabled={loading || refining}
              className="w-full py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 transition-colors text-left px-3 flex items-center gap-1.5"
            >
              <span className="text-zinc-500">✎</span>
              Sugerir ajuste no copy — pedir ao agente pra refazer
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] tracking-[0.22em] uppercase font-medium text-zinc-500">Sua sugestão (vai pro conteudo-agent)</p>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ex: menos texto, foca na localização Chapecó, troca o CTA por Saiba mais, urgência maior..."
                rows={3}
                className="w-full bg-[#0f0f12] border border-[#1c1c20] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitRefinement}
                  disabled={refining || !feedback.trim()}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {refining ? "Enviando..." : "Reenviar com feedback"}
                </button>
                <button
                  onClick={() => { setFeedbackOpen(false); setFeedback(""); }}
                  disabled={refining}
                  className="px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
