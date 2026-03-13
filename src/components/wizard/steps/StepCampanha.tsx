"use client";

import { useState, useEffect } from "react";
import type { ClientPublic } from "@/types/client";

export interface CampanhaFormData {
  name: string;
  objective: string;
  budgetType: "daily" | "lifetime";
  budgetValue: string;
  startDate: string;
  endDate: string;
}

interface StepCampanhaProps {
  selectedClient: ClientPublic;
  initialData: CampanhaFormData | null;
  onNext: (data: CampanhaFormData, campaignId: string) => void;
  token: string | null;
}

const OBJECTIVES = [
  { value: "OUTCOME_LEADS", label: "OUTCOME_LEADS — Geração de Leads" },
  { value: "OUTCOME_TRAFFIC", label: "OUTCOME_TRAFFIC — Tráfego" },
  { value: "OUTCOME_AWARENESS", label: "OUTCOME_AWARENESS — Reconhecimento" },
];

function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

export default function StepCampanha({
  selectedClient,
  initialData,
  onNext,
  token,
}: StepCampanhaProps) {
  const defaultBudget = (
    selectedClient.contexto.orcamento_diario_padrao / 100
  ).toFixed(2);

  const [form, setForm] = useState<CampanhaFormData>(
    initialData ?? {
      name: "",
      objective: "OUTCOME_LEADS",
      budgetType: "daily",
      budgetValue: defaultBudget,
      startDate: getTodayString(),
      endDate: "",
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof CampanhaFormData, string>>>({});

  useEffect(() => {
    if (initialData) setForm(initialData);
  }, [initialData]);

  function validate(): boolean {
    const e: Partial<Record<keyof CampanhaFormData, string>> = {};
    if (!form.name.trim()) e.name = "Nome da campanha é obrigatório";
    if (!form.budgetValue || parseFloat(form.budgetValue) <= 0)
      e.budgetValue = "Informe um orçamento válido";
    if (!form.startDate) e.startDate = "Data de início é obrigatória";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setError(null);

    try {
      const budgetCents = Math.round(parseFloat(form.budgetValue) * 100);
      const body: Record<string, unknown> = {
        clientSlug: selectedClient.slug,
        name: form.name.trim(),
        objective: form.objective,
        startTime: new Date(form.startDate + "T00:00:00").toISOString(),
      };

      if (form.budgetType === "daily") {
        body.dailyBudget = budgetCents;
      } else {
        body.lifetimeBudget = budgetCents;
      }

      if (form.endDate) {
        body.endTime = new Date(form.endDate + "T23:59:59").toISOString();
      }

      const res = await fetch("/api/meta/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar campanha");

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
        <h2 className="text-xl font-bold text-gray-800">Passo 1 — Campanha</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure os dados principais da campanha. Ela será criada pausada.
        </p>
      </div>

      {/* Sugestão de orçamento */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
        Orçamento padrão do cliente:{" "}
        <strong>R$ {defaultBudget}/dia</strong>
      </div>

      <div className="space-y-4">
        {/* Nome */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome da campanha <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex: Residencial Aurora — Leads Maio 2026"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.name ? "border-red-400" : "border-gray-300"
            }`}
          />
          {errors.name && (
            <p className="text-red-500 text-xs mt-1">{errors.name}</p>
          )}
        </div>

        {/* Objetivo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Objetivo da campanha
          </label>
          <select
            value={form.objective}
            onChange={(e) => setForm({ ...form, objective: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {OBJECTIVES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tipo de orçamento */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de orçamento
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="budgetType"
                value="daily"
                checked={form.budgetType === "daily"}
                onChange={() => setForm({ ...form, budgetType: "daily" })}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700">Diário</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="budgetType"
                value="lifetime"
                checked={form.budgetType === "lifetime"}
                onChange={() => setForm({ ...form, budgetType: "lifetime" })}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700">Total da campanha</span>
            </label>
          </div>
        </div>

        {/* Valor do orçamento */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Valor do orçamento (R$){" "}
            <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
              R$
            </span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.budgetValue}
              onChange={(e) =>
                setForm({ ...form, budgetValue: e.target.value })
              }
              placeholder="50.00"
              className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.budgetValue ? "border-red-400" : "border-gray-300"
              }`}
            />
          </div>
          {errors.budgetValue && (
            <p className="text-red-500 text-xs mt-1">{errors.budgetValue}</p>
          )}
        </div>

        {/* Datas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de início <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) =>
                setForm({ ...form, startDate: e.target.value })
              }
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.startDate ? "border-red-400" : "border-gray-300"
              }`}
            />
            {errors.startDate && (
              <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de fim{" "}
              <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="date"
              value={form.endDate}
              min={form.startDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end pt-2">
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
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
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
            "Criar Campanha e Avançar"
          )}
        </button>
      </div>
    </div>
  );
}
