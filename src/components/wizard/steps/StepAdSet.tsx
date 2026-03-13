"use client";

import { useState, useEffect } from "react";
import type { ClientPublic } from "@/types/client";

export interface AdSetFormData {
  name: string;
  cityName: string;
  cityKey: string;
  radiusKm: number;
  ageMin: number;
  ageMax: number;
  optimizationGoal: string;
}

interface GeoResult {
  key: string;
  name: string;
  country_code: string;
  region?: string;
}

interface StepAdSetProps {
  selectedClient: ClientPublic;
  campaignId: string;
  initialData: AdSetFormData | null;
  onNext: (data: AdSetFormData, adsetId: string) => void;
  onBack: () => void;
  token: string | null;
}

const RADIUS_OPTIONS = [5, 10, 15, 20, 30, 50];
const AGE_OPTIONS = Array.from({ length: 48 }, (_, i) => i + 18);
const OPTIMIZATION_GOALS = [
  { value: "LEAD_GENERATION", label: "LEAD_GENERATION — Geração de leads" },
  { value: "LINK_CLICKS", label: "LINK_CLICKS — Cliques no link" },
  { value: "IMPRESSIONS", label: "IMPRESSIONS — Impressões" },
];

export default function StepAdSet({
  selectedClient,
  campaignId,
  initialData,
  onNext,
  onBack,
  token,
}: StepAdSetProps) {
  const [form, setForm] = useState<AdSetFormData>(
    initialData ?? {
      name: "",
      cityName: selectedClient.contexto.cidade ?? "",
      cityKey: "",
      radiusKm: 10,
      ageMin: 25,
      ageMax: 65,
      optimizationGoal: "LEAD_GENERATION",
    }
  );
  const [geoQuery, setGeoQuery] = useState(
    initialData?.cityName ?? selectedClient.contexto.cidade ?? ""
  );
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof AdSetFormData, string>>>({});

  useEffect(() => {
    if (initialData) {
      setForm(initialData);
      setGeoQuery(initialData.cityName);
    }
  }, [initialData]);

  async function handleGeoSearch() {
    if (!geoQuery.trim()) return;
    setGeoLoading(true);
    try {
      const params = new URLSearchParams({
        q: geoQuery,
        clientSlug: selectedClient.slug,
      });
      const res = await fetch(`/api/meta/geo-search?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setGeoResults(data.locations ?? []);
    } catch {
      setGeoResults([]);
    } finally {
      setGeoLoading(false);
    }
  }

  function selectCity(city: GeoResult) {
    setForm({ ...form, cityName: city.name, cityKey: city.key });
    setGeoQuery(city.name);
    setGeoResults([]);
  }

  function validate(): boolean {
    const e: Partial<Record<keyof AdSetFormData, string>> = {};
    if (!form.name.trim()) e.name = "Nome do conjunto é obrigatório";
    if (!form.cityName.trim()) e.cityName = "Selecione uma cidade";
    if (form.ageMin >= form.ageMax)
      e.ageMax = "Idade máxima deve ser maior que a mínima";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/meta/adsets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          clientSlug: selectedClient.slug,
          campaignId,
          name: form.name.trim(),
          targeting: {
            cityKey: form.cityKey || form.cityName,
            cityName: form.cityName,
            radiusKm: form.radiusKm,
            ageMin: form.ageMin,
            ageMax: form.ageMax,
          },
          optimizationGoal: form.optimizationGoal,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar conjunto");

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
        <h2 className="text-xl font-bold text-gray-800">
          Passo 2 — Conjunto de Anúncios
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure a segmentação e entrega do conjunto.
        </p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
        Com categoria <strong>HOUSING</strong>, a Meta pode limitar
        segmentação por idade e gênero conforme políticas de habitação.
      </div>

      <div className="space-y-4">
        {/* Nome */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome do conjunto <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex: Conjunto — São Paulo 10km"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.name ? "border-red-400" : "border-gray-300"
            }`}
          />
          {errors.name && (
            <p className="text-red-500 text-xs mt-1">{errors.name}</p>
          )}
        </div>

        {/* Cidade */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cidade <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={geoQuery}
              onChange={(e) => setGeoQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGeoSearch()}
              placeholder="Ex: São Paulo"
              className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.cityName ? "border-red-400" : "border-gray-300"
              }`}
            />
            <button
              type="button"
              onClick={handleGeoSearch}
              disabled={geoLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {geoLoading ? "..." : "Buscar"}
            </button>
          </div>
          {errors.cityName && (
            <p className="text-red-500 text-xs mt-1">{errors.cityName}</p>
          )}
          {form.cityKey && (
            <p className="text-green-600 text-xs mt-1">
              Cidade selecionada: <strong>{form.cityName}</strong>
            </p>
          )}

          {/* Dropdown de resultados */}
          {geoResults.length > 0 && (
            <div className="mt-1 border border-gray-200 rounded-lg shadow-sm bg-white max-h-48 overflow-y-auto">
              {geoResults.map((city) => (
                <button
                  key={city.key}
                  type="button"
                  onClick={() => selectCity(city)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b last:border-b-0"
                >
                  {city.name}
                  {city.region ? ` — ${city.region}` : ""},{" "}
                  {city.country_code}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Raio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Raio de alcance
          </label>
          <select
            value={form.radiusKm}
            onChange={(e) =>
              setForm({ ...form, radiusKm: parseInt(e.target.value) })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </div>

        {/* Faixa etária */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Idade mínima
            </label>
            <select
              value={form.ageMin}
              onChange={(e) =>
                setForm({ ...form, ageMin: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AGE_OPTIONS.map((age) => (
                <option key={age} value={age}>
                  {age} anos
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Idade máxima
            </label>
            <select
              value={form.ageMax}
              onChange={(e) =>
                setForm({ ...form, ageMax: parseInt(e.target.value) })
              }
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.ageMax ? "border-red-400" : "border-gray-300"
              }`}
            >
              {AGE_OPTIONS.map((age) => (
                <option key={age} value={age}>
                  {age} anos
                </option>
              ))}
            </select>
            {errors.ageMax && (
              <p className="text-red-500 text-xs mt-1">{errors.ageMax}</p>
            )}
          </div>
        </div>

        {/* Otimização */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Otimização de entrega
          </label>
          <select
            value={form.optimizationGoal}
            onChange={(e) =>
              setForm({ ...form, optimizationGoal: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {OPTIMIZATION_GOALS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
            "Criar Conjunto e Avançar"
          )}
        </button>
      </div>
    </div>
  );
}
