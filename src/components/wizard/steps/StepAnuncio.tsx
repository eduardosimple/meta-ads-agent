"use client";

import { useState, useEffect } from "react";
import type { ClientPublic } from "@/types/client";

export interface AnuncioFormData {
  name: string;
}

interface StepAnuncioProps {
  selectedClient: ClientPublic;
  campaignId: string;
  adsetId: string;
  creativeId: string;
  campaignName: string;
  initialData: AnuncioFormData | null;
  onNext: (data: AnuncioFormData, adId: string) => void;
  onBack: () => void;
  token: string | null;
}

export default function StepAnuncio({
  selectedClient,
  campaignId,
  adsetId,
  creativeId,
  campaignName,
  initialData,
  onNext,
  onBack,
  token,
}: StepAnuncioProps) {
  const suggestedName = `Anúncio — ${campaignName}`;

  const [form, setForm] = useState<AnuncioFormData>(
    initialData ?? { name: suggestedName }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) setForm(initialData);
  }, [initialData]);

  async function handleSubmit() {
    if (!form.name.trim()) {
      setNameError("Nome do anúncio é obrigatório");
      return;
    }
    setNameError(null);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/meta/ads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          clientSlug: selectedClient.slug,
          name: form.name.trim(),
          adsetId,
          creativeId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar anúncio");

      onNext(form, data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Passo 4 — Anúncio</h2>
        <p className="text-sm text-gray-500 mt-1">
          Nomeie o anúncio e confirme os objetos vinculados.
        </p>
      </div>

      <div className="space-y-4">
        {/* Nome do anúncio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome do anúncio <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ name: e.target.value })}
            placeholder={suggestedName}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              nameError ? "border-red-400" : "border-gray-300"
            }`}
          />
          {nameError && (
            <p className="text-red-500 text-xs mt-1">{nameError}</p>
          )}
        </div>

        {/* IDs vinculados */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Objetos vinculados
          </h3>
          {[
            { label: "Campanha ID", value: campaignId },
            { label: "Ad Set ID", value: adsetId },
            { label: "Criativo ID", value: creativeId },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-24 shrink-0">
                {label}
              </span>
              <code className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-800 font-mono overflow-auto">
                {value}
              </code>
              <span className="shrink-0">
                <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 border border-green-200 rounded-full px-2 py-0.5">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  OK
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Aviso */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          Ao clicar em <strong>Criar Anúncio</strong>, o anúncio será criado
          com status <strong>PAUSADO</strong> e estará pronto para revisão
          antes da ativação.
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: loading
              ? "#9ca3af"
              : "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)",
          }}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
              Criando...
            </span>
          ) : (
            "Criar Anúncio e Avançar"
          )}
        </button>
      </div>
    </div>
  );
}
