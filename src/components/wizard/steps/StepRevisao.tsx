"use client";

import { useState } from "react";
import type { CampanhaFormData } from "./StepCampanha";
import type { AdSetFormData } from "./StepAdSet";
import type { CriativoFormData } from "./StepCriativo";
import type { AnuncioFormData } from "./StepAnuncio";

interface StepRevisaoProps {
  campaignId: string;
  adsetId: string;
  creativeId: string;
  adId: string;
  campaignData: CampanhaFormData;
  adsetData: AdSetFormData;
  creativeData: CriativoFormData;
  adData: AnuncioFormData;
  clientSlug: string;
  onBack: () => void;
  onActivated: () => void;
  token: string | null;
}

const CHECKLIST_ITEMS = [
  { id: "textos", label: "Textos revisados e aprovados" },
  { id: "imagens", label: "Imagens aprovadas" },
  { id: "url", label: "URL de destino testada" },
  { id: "orcamento", label: "Orçamento confirmado" },
];

function StatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300 rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
      {label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
      {children}
    </h3>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 w-32 shrink-0">{label}:</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function formatBudget(data: CampanhaFormData) {
  const val = parseFloat(data.budgetValue).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return `${val} ${data.budgetType === "daily" ? "/ dia" : "(total)"}`;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Geração de Leads",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_AWARENESS: "Reconhecimento",
};

const CTA_LABELS: Record<string, string> = {
  LEARN_MORE: "Saiba mais",
  CONTACT_US: "Fale conosco",
  GET_QUOTE: "Solicitar orçamento",
  SIGN_UP: "Cadastrar-se",
};

export default function StepRevisao({
  campaignId,
  adsetId,
  creativeId,
  adId,
  campaignData,
  adsetData,
  creativeData,
  adData,
  clientSlug,
  onBack,
  onActivated,
  token,
}: StepRevisaoProps) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    textos: false,
    imagens: false,
    url: false,
    orcamento: false,
  });
  const [showModal, setShowModal] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  const allChecked = CHECKLIST_ITEMS.every((item) => checklist[item.id]);

  function toggleCheck(id: string) {
    setChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleActivate() {
    setActivating(true);
    setActivateError(null);

    try {
      const res = await fetch("/api/meta/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ clientSlug, campaignId, adsetId, adId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao ativar campanha");

      setActivated(true);
      setShowModal(false);
      onActivated();
    } catch (err) {
      setActivateError(
        err instanceof Error ? err.message : "Erro inesperado"
      );
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Passo 5 — Revisão</h2>
        <p className="text-sm text-gray-500 mt-1">
          Revise todos os detalhes antes de ativar a campanha.
        </p>
      </div>

      {/* Campanha */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Campanha</SectionTitle>
          <StatusBadge label="PAUSADO" />
        </div>
        <InfoRow label="ID" value={<code className="text-xs font-mono">{campaignId}</code>} />
        <InfoRow label="Nome" value={campaignData.name} />
        <InfoRow
          label="Objetivo"
          value={OBJECTIVE_LABELS[campaignData.objective] ?? campaignData.objective}
        />
        <InfoRow label="Orçamento" value={formatBudget(campaignData)} />
        <InfoRow label="Início" value={campaignData.startDate} />
        {campaignData.endDate && (
          <InfoRow label="Fim" value={campaignData.endDate} />
        )}
      </div>

      {/* Conjunto */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Conjunto de Anúncios</SectionTitle>
          <StatusBadge label="PAUSADO" />
        </div>
        <InfoRow label="ID" value={<code className="text-xs font-mono">{adsetId}</code>} />
        <InfoRow label="Nome" value={adsetData.name} />
        <InfoRow
          label="Localização"
          value={`${adsetData.cityName} (${adsetData.radiusKm} km)`}
        />
        <InfoRow
          label="Faixa etária"
          value={`${adsetData.ageMin} – ${adsetData.ageMax} anos`}
        />
        <InfoRow label="Otimização" value={adsetData.optimizationGoal} />
      </div>

      {/* Criativo */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Criativo</SectionTitle>
          <StatusBadge label="PAUSADO" />
        </div>
        <InfoRow label="ID" value={<code className="text-xs font-mono">{creativeId}</code>} />
        {creativeData.imagePreviewUrl && (
          <div className="mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={creativeData.imagePreviewUrl}
              alt="Preview do criativo"
              className="w-full max-w-xs h-40 object-cover rounded-lg border border-gray-200"
            />
          </div>
        )}
        <InfoRow label="Formato" value={creativeData.format === "image" ? "Imagem única" : "Carrossel"} />
        <InfoRow label="Título" value={creativeData.title} />
        <InfoRow label="Texto" value={creativeData.message} />
        {creativeData.description && (
          <InfoRow label="Descrição" value={creativeData.description} />
        )}
        <InfoRow label="CTA" value={CTA_LABELS[creativeData.ctaType] ?? creativeData.ctaType} />
        <InfoRow
          label="URL"
          value={
            <a
              href={creativeData.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline break-all"
            >
              {creativeData.linkUrl}
            </a>
          }
        />
      </div>

      {/* Anúncio */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Anúncio</SectionTitle>
          <StatusBadge label="PAUSADO" />
        </div>
        <InfoRow label="ID" value={<code className="text-xs font-mono">{adId}</code>} />
        <InfoRow label="Nome" value={adData.name} />
        <InfoRow label="Campanha" value={<code className="text-xs font-mono">{campaignId}</code>} />
        <InfoRow label="Ad Set" value={<code className="text-xs font-mono">{adsetId}</code>} />
        <InfoRow label="Criativo" value={<code className="text-xs font-mono">{creativeId}</code>} />
      </div>

      {/* Checklist */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-amber-800 mb-3">
          Checklist de conformidade
        </h3>
        {CHECKLIST_ITEMS.map((item) => (
          <label
            key={item.id}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                checklist[item.id]
                  ? "bg-green-500 border-green-500"
                  : "bg-white border-gray-400 group-hover:border-green-400"
              }`}
              onClick={() => toggleCheck(item.id)}
            >
              {checklist[item.id] && (
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <span
              className="text-sm text-amber-900"
              onClick={() => toggleCheck(item.id)}
            >
              {item.label}
            </span>
          </label>
        ))}
      </div>

      {activated && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-center gap-3">
          <svg
            className="w-6 h-6 text-green-600 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-bold text-green-800">
              Campanha ativada com sucesso!
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              A campanha está ativa e começará a ser veiculada em breve.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-2">
        <button
          onClick={onBack}
          disabled={activated}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Voltar
        </button>
        <button
          onClick={() => setShowModal(true)}
          disabled={!allChecked || activated}
          className={`px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all ${
            !allChecked || activated
              ? "bg-gray-300 cursor-not-allowed"
              : "hover:opacity-90"
          }`}
          style={
            allChecked && !activated
              ? {
                  background:
                    "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)",
                }
              : {}
          }
          title={
            !allChecked
              ? "Marque todos os itens do checklist para ativar"
              : ""
          }
        >
          {activated ? "Campanha Ativa" : "Ativar Campanha"}
        </button>
      </div>

      {/* Modal de confirmação */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <svg
                  className="w-5 h-5 text-orange-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-base">
                  Confirmar ativação?
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  A campanha <strong>{campaignData.name}</strong> começará a
                  ser veiculada imediatamente após a ativação. Esta ação não
                  pode ser desfeita automaticamente.
                </p>
              </div>
            </div>

            {activateError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {activateError}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => {
                  setShowModal(false);
                  setActivateError(null);
                }}
                disabled={activating}
                className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleActivate}
                disabled={activating}
                className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
                style={{
                  background: activating
                    ? "#9ca3af"
                    : "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)",
                }}
              >
                {activating ? (
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
                    Ativando...
                  </span>
                ) : (
                  "Confirmar Ativação"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
