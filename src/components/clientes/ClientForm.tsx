"use client";

import { useState, useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import type { Client } from "@/types/client";

interface Props {
  client?: Client | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const OBJECTIVES = [
  { value: "OUTCOME_LEADS", label: "Geração de Leads" },
  { value: "OUTCOME_TRAFFIC", label: "Tráfego" },
  { value: "OUTCOME_AWARENESS", label: "Reconhecimento" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engajamento" },
  { value: "OUTCOME_SALES", label: "Vendas" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function ClientForm({ client, onSuccess, onCancel }: Props) {
  const { token } = useAppContext();
  const isEdit = !!client;

  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Client>({
    nome: "",
    slug: "",
    ativo: true,
    meta: {
      access_token: "",
      ad_account_id: "",
      app_id: "",
      app_secret: "",
      page_id: "",
      page_name: "",
    },
    contexto: {
      segmento: "imobiliário",
      cidade: "",
      estado: "",
      publico_alvo: "25-55 anos",
      orcamento_diario_padrao: 5000,
      objetivo_padrao: "OUTCOME_LEADS",
    },
  });

  useEffect(() => {
    if (client) setForm(client);
  }, [client]);

  function handleChange<T extends object>(
    section: "root" | "meta" | "contexto",
    key: string,
    value: T[keyof T] | string | number | boolean
  ) {
    if (section === "root") {
      setForm((prev) => {
        const updated = { ...prev, [key]: value };
        if (key === "nome" && !isEdit) {
          updated.slug = slugify(value as string);
        }
        return updated;
      });
    } else if (section === "meta") {
      setForm((prev) => ({ ...prev, meta: { ...prev.meta, [key]: value } }));
    } else {
      setForm((prev) => ({
        ...prev,
        contexto: { ...prev.contexto, [key]: value },
      }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Dados básicos */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
          Dados do Cliente
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Nome *</label>
            <input
              type="text"
              required
              value={form.nome}
              onChange={(e) => handleChange("root", "nome", e.target.value)}
              className={inputClass}
              placeholder="Ex: Residencial Aurora"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Slug *</label>
            <input
              type="text"
              required
              value={form.slug}
              onChange={(e) => handleChange("root", "slug", e.target.value)}
              className={inputClass}
              placeholder="residencial-aurora"
            />
          </div>
          <div className="flex items-end pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => handleChange("root", "ativo", e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500"
              />
              <span className="text-sm text-gray-700">Cliente ativo</span>
            </label>
          </div>
        </div>
      </section>

      {/* Meta API */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
          Credenciais Meta API
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Access Token *</label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                required={!isEdit}
                value={form.meta.access_token}
                onChange={(e) => handleChange("meta", "access_token", e.target.value)}
                className={`${inputClass} pr-10`}
                placeholder={isEdit ? "••••••••" : "EAAxxxxxxx..."}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showToken ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd" />
                    <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ad Account ID *</label>
              <input
                type="text"
                required
                value={form.meta.ad_account_id}
                onChange={(e) => handleChange("meta", "ad_account_id", e.target.value)}
                className={inputClass}
                placeholder="act_123456789"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">App ID *</label>
              <input
                type="text"
                required
                value={form.meta.app_id}
                onChange={(e) => handleChange("meta", "app_id", e.target.value)}
                className={inputClass}
                placeholder="123456789"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">App Secret *</label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                required={!isEdit}
                value={form.meta.app_secret}
                onChange={(e) => handleChange("meta", "app_secret", e.target.value)}
                className={`${inputClass} pr-10`}
                placeholder={isEdit ? "••••••••" : "abc123..."}
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSecret ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd" />
                    <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Page ID *</label>
              <input
                type="text"
                required
                value={form.meta.page_id}
                onChange={(e) => handleChange("meta", "page_id", e.target.value)}
                className={inputClass}
                placeholder="123456789"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nome da Página</label>
              <input
                type="text"
                value={form.meta.page_name}
                onChange={(e) => handleChange("meta", "page_name", e.target.value)}
                className={inputClass}
                placeholder="Nome da Página"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Contexto */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
          Contexto de Campanha
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cidade *</label>
              <input
                type="text"
                required
                value={form.contexto.cidade}
                onChange={(e) => handleChange("contexto", "cidade", e.target.value)}
                className={inputClass}
                placeholder="São Paulo"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Estado *</label>
              <input
                type="text"
                required
                maxLength={2}
                value={form.contexto.estado}
                onChange={(e) => handleChange("contexto", "estado", e.target.value.toUpperCase())}
                className={inputClass}
                placeholder="SP"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Segmento</label>
            <input
              type="text"
              value={form.contexto.segmento}
              onChange={(e) => handleChange("contexto", "segmento", e.target.value)}
              className={inputClass}
              placeholder="imobiliário"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Público-alvo</label>
            <input
              type="text"
              value={form.contexto.publico_alvo}
              onChange={(e) => handleChange("contexto", "publico_alvo", e.target.value)}
              className={inputClass}
              placeholder="25-55 anos, interessados em imóveis"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Orçamento Diário Padrão (em centavos)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  ¢
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.contexto.orcamento_diario_padrao}
                  onChange={(e) =>
                    handleChange("contexto", "orcamento_diario_padrao", parseInt(e.target.value) || 0)
                  }
                  className={`${inputClass} pl-7`}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                R$ {(form.contexto.orcamento_diario_padrao / 100).toFixed(2)}/dia
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Objetivo Padrão</label>
              <select
                value={form.contexto.objetivo_padrao}
                onChange={(e) => handleChange("contexto", "objetivo_padrao", e.target.value)}
                className={inputClass}
              >
                {OBJECTIVES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600
                     hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2 rounded-lg text-sm text-white font-medium
                     transition-all disabled:opacity-50 hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)" }}
        >
          {loading ? "Salvando..." : isEdit ? "Salvar alterações" : "Adicionar cliente"}
        </button>
      </div>
    </form>
  );
}
