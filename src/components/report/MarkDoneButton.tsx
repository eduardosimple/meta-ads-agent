"use client";

import { useState } from "react";

interface Props {
  clientSlug: string;
  date: string;
  adId: string;
  platform: "meta" | "google";
  reportKey: string;
  ajusteTipo: string;
}

const tipoLabel: Record<string, string> = {
  publico: "Público ajustado",
  lance: "Lance/orçamento ajustado",
  configuracao: "Configuração ajustada",
};

export default function MarkDoneButton({ clientSlug, date, adId, platform, reportKey, ajusteTipo }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [ignored, setIgnored] = useState(false);
  const [error, setError] = useState("");

  async function patch(newStatus: "approved" | "rejected") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/daily-reports/${clientSlug}/proposals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-report-key": reportKey },
        body: JSON.stringify({ date, ad_id: adId, platform, status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        if (newStatus === "approved") setDone(true);
        else setIgnored(true);
      } else {
        setError(data.error ?? "Erro");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (done) return <p className="text-xs text-green-600 font-medium mt-1">{tipoLabel[ajusteTipo] ?? "Ajuste confirmado."}</p>;
  if (ignored) return <p className="text-xs text-gray-400 mt-1">Ignorado.</p>;

  return (
    <div className="mt-2 space-y-1">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => patch("approved")}
          disabled={loading}
          className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Salvando..." : "Marcar como feito"}
        </button>
        <button
          onClick={() => patch("rejected")}
          disabled={loading}
          className="px-3 py-2 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          Ignorar
        </button>
      </div>
    </div>
  );
}
