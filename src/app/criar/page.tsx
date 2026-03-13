"use client";

import { useAppContext } from "@/context/AppContext";
import WizardProgress from "@/components/wizard/WizardProgress";
import StepCampanha from "@/components/wizard/steps/StepCampanha";
import StepAdSet from "@/components/wizard/steps/StepAdSet";
import StepCriativo from "@/components/wizard/steps/StepCriativo";
import StepAnuncio from "@/components/wizard/steps/StepAnuncio";
import StepRevisao from "@/components/wizard/steps/StepRevisao";
import type { CampanhaFormData } from "@/components/wizard/steps/StepCampanha";
import type { AdSetFormData } from "@/components/wizard/steps/StepAdSet";
import type { CriativoFormData } from "@/components/wizard/steps/StepCriativo";
import type { AnuncioFormData } from "@/components/wizard/steps/StepAnuncio";
import Link from "next/link";
import { useState } from "react";

interface WizardState {
  currentStep: number;
  campaignId: string | null;
  adsetId: string | null;
  creativeId: string | null;
  adId: string | null;
  imageHash: string | null;
  campaignData: CampanhaFormData | null;
  adsetData: AdSetFormData | null;
  creativeData: CriativoFormData | null;
  adData: AnuncioFormData | null;
}

const INITIAL_STATE: WizardState = {
  currentStep: 0,
  campaignId: null,
  adsetId: null,
  creativeId: null,
  adId: null,
  imageHash: null,
  campaignData: null,
  adsetData: null,
  creativeData: null,
  adData: null,
};

export default function CriarCampanhaPage() {
  const { selectedClient, token } = useAppContext();
  const [wizard, setWizard] = useState<WizardState>(INITIAL_STATE);
  const [campaignActivated, setCampaignActivated] = useState(false);

  if (!selectedClient) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <svg
              className="w-7 h-7 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800">
            Nenhum cliente selecionado
          </h2>
          <p className="text-sm text-gray-500">
            Selecione um cliente no menu superior (Navbar) antes de criar uma
            campanha.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)",
            }}
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  if (campaignActivated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-green-600"
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
          </div>
          <h2 className="text-xl font-bold text-gray-800">
            Campanha ativada com sucesso!
          </h2>
          <p className="text-sm text-gray-500">
            Sua campanha <strong>{wizard.campaignData?.name}</strong> está
            ativa e começará a ser veiculada em breve.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/campanhas"
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{
                background:
                  "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)",
              }}
            >
              Ver Campanhas
            </Link>
            <button
              onClick={() => {
                setWizard(INITIAL_STATE);
                setCampaignActivated(false);
              }}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Nova Campanha
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Nova Campanha
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cliente:{" "}
            <strong className="text-gray-700">
              {selectedClient.nome}
            </strong>
          </p>
        </div>

        {/* Progress */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6">
          <WizardProgress currentStep={wizard.currentStep} />
        </div>

        {/* Card do passo atual */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {wizard.currentStep === 0 && (
            <StepCampanha
              selectedClient={selectedClient}
              initialData={wizard.campaignData}
              token={token}
              onNext={(data, id) =>
                setWizard((prev) => ({
                  ...prev,
                  currentStep: 1,
                  campaignId: id,
                  campaignData: data,
                }))
              }
            />
          )}

          {wizard.currentStep === 1 && wizard.campaignId && (
            <StepAdSet
              selectedClient={selectedClient}
              campaignId={wizard.campaignId}
              initialData={wizard.adsetData}
              token={token}
              onNext={(data, id) =>
                setWizard((prev) => ({
                  ...prev,
                  currentStep: 2,
                  adsetId: id,
                  adsetData: data,
                }))
              }
              onBack={() =>
                setWizard((prev) => ({ ...prev, currentStep: 0 }))
              }
            />
          )}

          {wizard.currentStep === 2 && (
            <StepCriativo
              selectedClient={selectedClient}
              initialData={wizard.creativeData}
              token={token}
              onNext={(data, id, hash) =>
                setWizard((prev) => ({
                  ...prev,
                  currentStep: 3,
                  creativeId: id,
                  creativeData: data,
                  imageHash: hash,
                }))
              }
              onBack={() =>
                setWizard((prev) => ({ ...prev, currentStep: 1 }))
              }
            />
          )}

          {wizard.currentStep === 3 &&
            wizard.campaignId &&
            wizard.adsetId &&
            wizard.creativeId &&
            wizard.campaignData && (
              <StepAnuncio
                selectedClient={selectedClient}
                campaignId={wizard.campaignId}
                adsetId={wizard.adsetId}
                creativeId={wizard.creativeId}
                campaignName={wizard.campaignData.name}
                initialData={wizard.adData}
                token={token}
                onNext={(data, id) =>
                  setWizard((prev) => ({
                    ...prev,
                    currentStep: 4,
                    adId: id,
                    adData: data,
                  }))
                }
                onBack={() =>
                  setWizard((prev) => ({ ...prev, currentStep: 2 }))
                }
              />
            )}

          {wizard.currentStep === 4 &&
            wizard.campaignId &&
            wizard.adsetId &&
            wizard.creativeId &&
            wizard.adId &&
            wizard.campaignData &&
            wizard.adsetData &&
            wizard.creativeData &&
            wizard.adData && (
              <StepRevisao
                campaignId={wizard.campaignId}
                adsetId={wizard.adsetId}
                creativeId={wizard.creativeId}
                adId={wizard.adId}
                campaignData={wizard.campaignData}
                adsetData={wizard.adsetData}
                creativeData={wizard.creativeData}
                adData={wizard.adData}
                clientSlug={selectedClient.slug}
                token={token}
                onBack={() =>
                  setWizard((prev) => ({ ...prev, currentStep: 3 }))
                }
                onActivated={() => setCampaignActivated(true)}
              />
            )}
        </div>
      </div>
    </div>
  );
}
