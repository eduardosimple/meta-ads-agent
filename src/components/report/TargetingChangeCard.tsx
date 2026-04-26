"use client";

import { useState } from "react";

interface Props {
  clientSlug: string;
  date: string;
  adId: string;
  reportKey: string;
  targetingSummaryOld: string;
  targetingSummaryNew: string;
  adsetNameNew?: string;
  actionType: "update_targeting" | "create_adset";
  initialStatus: string;
  initialResultMessage?: string;
}

export default function TargetingChangeCard({
  clientSlug, date, adId, reportKey,
  targetingSummaryOld, targetingSummaryNew, adsetNameNew,
  actionType, initialStatus, initialResultMessage,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(initialResultMessage ?? "");

  if (status === "approved") {
    return <p className="text-xs text-green-600 font-medium mt-1">{actionType === "create_adset" ? "Conjunto criado (pausado)" : "Público atualizado"} — {result}</p>;
  }
  if (status === "rejected") {
    return <p className="text-xs text-gray-400 mt-1">Ignorado.</p>;
  }

  async function execute() {
    setLoading(true);
    try {
      const res = await fetch(`/api/daily-reports/${clientSlug}/proposals/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-report-key": reportKey },
        body: JSON.stringify({ date, ad_id: adId, platform: "meta", action_type: actionType === "create_adset" ? "create_adset" : "update_targeting" }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("approved");
        setResult(data.result_message ?? "Targeting atualizado.");
      } else {
        setResult(`Erro: ${data.error}`);
      }
    } catch (e) {
      setResult(`Erro: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function ignore() {
    setLoading(true);
    try {
      await fetch(`/api/daily-reports/${clientSlug}/proposals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-report-key": reportKey },
        body: JSON.stringify({ date, ad_id: adId, platform: "meta", status: "rejected" }),
      });
      setStatus("rejected");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-orange-700">
        {actionType === "create_adset" ? "Novo Conjunto de Anúncios (criado pausado)" : "Alteração de Público"}
      </p>
      {adsetNameNew && (
        <div className="flex gap-2 items-start">
          <span className="text-xs text-gray-400 shrink-0 w-14">Nome:</span>
          <span className="text-xs text-gray-800 font-mono font-medium">{adsetNameNew}</span>
        </div>
      )}
      <div className="space-y-1">
        <div className="flex gap-2 items-start">
          <span className="text-xs text-gray-400 shrink-0 w-14">Atual:</span>
          <span className="text-xs text-gray-600">{targetingSummaryOld}</span>
        </div>
        <div className="flex gap-2 items-start">
          <span className="text-xs font-medium text-orange-700 shrink-0 w-14">Novo:</span>
          <span className="text-xs text-gray-800 font-medium">{targetingSummaryNew}</span>
        </div>
      </div>
      {result && <p className="text-xs text-red-500">{result}</p>}
      <div className="flex gap-2">
        <button
          onClick={execute}
          disabled={loading}
          className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {loading
            ? (actionType === "create_adset" ? "Criando conjunto..." : "Atualizando público...")
            : (actionType === "create_adset" ? "Criar conjunto (pausado)" : "Aplicar alteração de público")}
        </button>
        <button
          onClick={ignore}
          disabled={loading}
          className="px-3 py-2 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          Ignorar
        </button>
      </div>
    </div>
  );
}
