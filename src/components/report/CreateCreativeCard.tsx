"use client";

import { useState } from "react";

interface AdSummary {
  ad_id: string;
  ad_name: string;
  verdict: string;
  diagnostico: string;
  metricas_problema: string[];
}

interface Props {
  clientSlug: string;
  clientName: string;
  date: string;
  worstAd: AdSummary;
  bestAd: AdSummary;
  bestThumbnailUrl?: string;
  hasBrief: boolean;
  reportKey: string;
}

export default function CreateCreativeCard({
  clientSlug, clientName, date, worstAd, bestAd,
  bestThumbnailUrl, hasBrief, reportKey,
}: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "requested" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function requestCreative() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/daily-reports/${clientSlug}/proposals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-report-key": reportKey },
        body: JSON.stringify({
          date,
          ad_id: worstAd.ad_id,
          platform: "meta",
          status: "creative_requested",
          best_ad_id: bestAd.ad_id,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("requested");
        setMsg("");
      } else {
        setStatus("error");
        setMsg(data.error ?? "Erro ao solicitar");
      }
    } catch (e) {
      setStatus("error");
      setMsg(String(e));
    }
  }

  if (status === "requested") {
    return (
      <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 text-sm text-amber-200 space-y-1.5">
        <p className="font-semibold text-amber-300">Pedido registrado na fila.</p>
        <p className="text-xs text-amber-200/80">
          O pipeline de criativo está em manutenção e <b>pode não processar agora</b>.
          Seu pedido aparece no painel "Pedidos de criativo pendentes" no topo do relatório.
          {hasBrief && " O brief de design do cliente será usado quando processado."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#18181b] border border-[#1c1c20] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1c1c20] bg-[#0f0f12]">
        <p className="text-[10px] tracking-[0.22em] uppercase text-zinc-500 font-medium">{clientName} — Comparativo</p>
      </div>

      <div className="grid grid-cols-2 divide-x divide-[#1c1c20]">
        {/* Pior */}
        <div className="p-4 space-y-1.5">
          <span className="text-[10px] px-2 py-0.5 bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded-full font-bold tracking-[0.1em] uppercase">Pior performance</span>
          <p className="text-sm font-semibold text-zinc-100 mt-1 line-clamp-2">{worstAd.ad_name}</p>
          <p className="text-xs text-zinc-400 line-clamp-3">{worstAd.diagnostico}</p>
          <div className="flex flex-wrap gap-1">
            {worstAd.metricas_problema.slice(0, 2).map((m, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded text-rose-300 font-mono">{m}</span>
            ))}
          </div>
        </div>

        {/* Melhor */}
        <div className="p-4 space-y-1.5">
          <span className="text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full font-bold tracking-[0.1em] uppercase">Melhor performance</span>
          {bestThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bestThumbnailUrl}
              alt={bestAd.ad_name}
              className="w-full aspect-square object-cover rounded-lg mt-1"
            />
          ) : (
            <div className="w-full aspect-square bg-zinc-900 border border-zinc-800 rounded-lg mt-1 flex items-center justify-center">
              <p className="text-xs text-zinc-500 text-center px-2">{bestAd.ad_name}</p>
            </div>
          )}
          <p className="text-xs font-medium text-zinc-300 line-clamp-2">{bestAd.ad_name}</p>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3 border-t border-[#1c1c20] space-y-2">
        {hasBrief && (
          <p className="text-xs text-emerald-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
            Brief de design salvo — criativo seguirá o padrão visual do cliente
          </p>
        )}
        {msg && <p className="text-xs text-rose-300">{msg}</p>}
        <button
          onClick={requestCreative}
          disabled={status === "loading"}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#7c3aed] to-[#3b82f6] hover:from-[#8b4df0] hover:to-[#4d8ef7] disabled:opacity-50 transition-all shadow-[0_4px_20px_-4px_rgba(124,58,237,0.4)]"
        >
          {status === "loading" ? "Enviando..." : "Criar novo criativo baseado no melhor"}
        </button>
      </div>
    </div>
  );
}
