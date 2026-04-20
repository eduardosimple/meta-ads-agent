"use client";

import { useState } from "react";
import type { CreativeApprovalData } from "@/types/chat";

interface Props {
  creative: CreativeApprovalData;
  onApprove: (message: string) => void;
  onReject: () => void;
  approved?: boolean;
  rejected?: boolean;
}

export default function CreativeApprovalCard({ creative, onApprove, onReject, approved, rejected }: Props) {
  const [selected, setSelected] = useState<"a" | "b">("a");

  const versaoAtual = selected === "a" ? creative.versao_a : creative.versao_b;
  const label = selected === "a" ? "Versão A" : "Versão B";

  function handleApprove() {
    const msg =
      `Aprovar criativo — ${label}\n` +
      `Headline: ${versaoAtual.headline}\n` +
      `Texto: ${versaoAtual.texto}\n` +
      `CTA: ${versaoAtual.cta}\n` +
      `Criativo ID original: ${creative.criativo_id ?? "N/A"}\n` +
      `Cliente: ${creative.cliente}\n\n` +
      `Execute /criar-criativo com esses dados e suba o anúncio pausado para revisão.`;
    onApprove(msg);
  }

  if (approved) {
    return (
      <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        Criativo aprovado e enviado para criação no Meta Ads.
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        Criativo descartado.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-white shadow-sm overflow-hidden">
      {/* Imagem */}
      {creative.image_base64 && (
        <div className="w-full aspect-square bg-gray-100 overflow-hidden">
          <img
            src={`data:image/png;base64,${creative.image_base64}`}
            alt="Criativo gerado"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Tabs A / B */}
        <div className="flex gap-2">
          {(["a", "b"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSelected(v)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selected === v
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Versão {v.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Copy */}
        <div className="space-y-1.5 text-sm">
          <div>
            <span className="text-xs text-gray-400 uppercase font-medium">Headline</span>
            <p className="text-gray-800 font-medium">{versaoAtual.headline}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400 uppercase font-medium">Texto</span>
            <p className="text-gray-700">{versaoAtual.texto}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400 uppercase font-medium">CTA</span>
            <p className="text-gray-600">{versaoAtual.cta}</p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleApprove}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
            style={{ background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)" }}
          >
            Aprovar {label}
          </button>
          <button
            onClick={onReject}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Rejeitar
          </button>
        </div>
      </div>
    </div>
  );
}
