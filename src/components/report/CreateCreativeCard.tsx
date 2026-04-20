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
      // Mark worst ad as creative_requested
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
        setMsg("Solicitação enviada. O Orquestrador irá gerar o criativo no próximo ciclo.");
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
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-700">
        Criativo solicitado. O Orquestrador vai gerar baseado no melhor da conta.
        {hasBrief && <span className="block text-xs mt-1 text-blue-500">Brief de design do cliente disponível — será usado na criação.</span>}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{clientName} — Comparativo</p>
      </div>

      <div className="grid grid-cols-2 divide-x divide-gray-100">
        {/* Pior criativo */}
        <div className="p-4 space-y-1.5">
          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">Pior performance</span>
          <p className="text-sm font-semibold text-gray-800 mt-1 line-clamp-2">{worstAd.ad_name}</p>
          <p className="text-xs text-gray-500 line-clamp-3">{worstAd.diagnostico}</p>
          {worstAd.metricas_problema.slice(0, 2).map((m, i) => (
            <span key={i} className="inline-block text-xs px-1.5 py-0.5 bg-red-50 rounded text-red-500 mr-1">{m}</span>
          ))}
        </div>

        {/* Melhor criativo */}
        <div className="p-4 space-y-1.5">
          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full font-medium">Melhor performance</span>
          {bestThumbnailUrl ? (
            <img
              src={bestThumbnailUrl}
              alt={bestAd.ad_name}
              className="w-full aspect-square object-cover rounded-lg mt-1"
            />
          ) : (
            <div className="w-full aspect-square bg-gray-100 rounded-lg mt-1 flex items-center justify-center">
              <p className="text-xs text-gray-400 text-center px-2">{bestAd.ad_name}</p>
            </div>
          )}
          <p className="text-xs font-medium text-gray-700 line-clamp-2">{bestAd.ad_name}</p>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-2">
        {hasBrief && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
            Brief de design salvo — criativo seguirá o padrão visual do cliente
          </p>
        )}
        {msg && <p className="text-xs text-red-500">{msg}</p>}
        <button
          onClick={requestCreative}
          disabled={status === "loading"}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 transition-all"
        >
          {status === "loading" ? "Enviando..." : "Criar novo criativo baseado no melhor"}
        </button>
      </div>
    </div>
  );
}
