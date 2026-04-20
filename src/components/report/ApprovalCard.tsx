"use client";

import { useState } from "react";

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
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ApprovalCard({
  clientSlug, date, adId, platform, adName, imageBase64,
  versaoA, versaoB, initialStatus, resultMessage, reportKey,
}: Props) {
  const [selected, setSelected] = useState<"a" | "b">("a");
  const [status, setStatus] = useState(initialStatus);
  const [result, setResult] = useState(resultMessage ?? "");
  const [loading, setLoading] = useState(false);

  const copy = selected === "a" ? versaoA : versaoB;

  async function approve() {
    setLoading(true);
    try {
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

  if (status === "approved") {
    return (
      <div className="mt-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
        Aprovado e publicado. {result}
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5 text-xs text-gray-400">
        Criativo rejeitado.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-white overflow-hidden">
      {imageBase64 && (
        <img
          src={`data:image/png;base64,${imageBase64}`}
          alt="Criativo sugerido"
          className="w-full aspect-square object-cover"
        />
      )}
      <div className="p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Copy sugerida</p>

        {/* Version tabs */}
        <div className="flex gap-2">
          {(["a", "b"] as const).map(v => (
            <button
              key={v}
              onClick={() => setSelected(v)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selected === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Versão {v.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Copy */}
        <div className="space-y-1.5 text-sm bg-gray-50 rounded-lg p-3">
          <p className="font-semibold text-gray-800">{copy.headline}</p>
          <p className="text-gray-600 text-xs">{copy.texto}</p>
        </div>

        {result && <p className="text-xs text-red-500">{result}</p>}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={approve}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Publicando..." : `Aprovar Versão ${selected.toUpperCase()} e Publicar`}
          </button>
          <button
            onClick={reject}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Rejeitar
          </button>
        </div>
      </div>
    </div>
  );
}
