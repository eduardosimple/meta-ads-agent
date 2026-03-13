"use client";

import { useState, useEffect, useRef } from "react";
import type { ClientPublic } from "@/types/client";
import DriveFilePicker, { type DriveFile } from "@/components/drive/DriveFilePicker";

export interface CriativoFormData {
  format: "image" | "carousel";
  title: string;
  message: string;
  description: string;
  ctaType: string;
  linkUrl: string;
  imagePreviewUrl: string | null;
  imageName: string | null;
  driveFileId?: string | null;
}

interface StepCriativoProps {
  selectedClient: ClientPublic;
  initialData: CriativoFormData | null;
  onNext: (data: CriativoFormData, creativeId: string, imageHash: string | null) => void;
  onBack: () => void;
  token: string | null;
}

const CTA_OPTIONS = [
  { value: "LEARN_MORE", label: "LEARN_MORE — Saiba mais" },
  { value: "CONTACT_US", label: "CONTACT_US — Fale conosco" },
  { value: "GET_QUOTE", label: "GET_QUOTE — Solicitar orçamento" },
  { value: "SIGN_UP", label: "SIGN_UP — Cadastrar-se" },
];

const MAX_TITLE = 40;
const MAX_MESSAGE = 125;
const MAX_DESCRIPTION = 30;

export default function StepCriativo({
  selectedClient,
  initialData,
  onNext,
  onBack,
  token,
}: StepCriativoProps) {
  const [form, setForm] = useState<CriativoFormData>(
    initialData ?? {
      format: "image",
      title: "",
      message: "",
      description: "",
      ctaType: "LEARN_MORE",
      linkUrl: "",
      imagePreviewUrl: null,
      imageName: null,
    }
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [driveFile, setDriveFile] = useState<DriveFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) setForm(initialData);
  }, [initialData]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setDriveFile(null);
    const url = URL.createObjectURL(file);
    setForm((prev) => ({
      ...prev,
      imagePreviewUrl: url,
      imageName: file.name,
      driveFileId: null,
    }));
  }

  function handleDriveSelect(file: DriveFile) {
    setDriveFile(file);
    setImageFile(null);
    setForm((prev) => ({
      ...prev,
      imagePreviewUrl: file.thumbnailLink,
      imageName: file.name,
      driveFileId: file.id,
    }));
  }

  async function uploadImage(file: File): Promise<string> {
    setUploadingImage(true);
    const formData = new FormData();
    formData.append("image", file);
    formData.append("clientSlug", selectedClient.slug);

    const res = await fetch("/api/meta/upload-image", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Erro no upload da imagem");
    setUploadingImage(false);
    return data.hash as string;
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Título é obrigatório";
    if (!form.message.trim()) e.message = "Texto principal é obrigatório";
    if (!form.linkUrl.trim()) e.linkUrl = "URL de destino é obrigatória";
    else {
      try {
        new URL(form.linkUrl);
      } catch {
        e.linkUrl = "Informe uma URL válida (ex: https://...)";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setError(null);

    try {
      let imageHash: string | null = null;

      if (imageFile) {
        imageHash = await uploadImage(imageFile);
      } else if (driveFile) {
        setUploadingImage(true);
        const driveRes = await fetch("/api/drive/download", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            fileId: driveFile.id,
            clientSlug: selectedClient.slug,
          }),
        });
        const driveData = await driveRes.json();
        setUploadingImage(false);
        if (!driveRes.ok) {
          throw new Error(driveData.error ?? "Erro ao importar imagem do Drive");
        }
        imageHash = driveData.hash as string;
      }

      const body: Record<string, unknown> = {
        clientSlug: selectedClient.slug,
        name: `Criativo — ${form.title.trim()}`,
        pageId: selectedClient.meta.page_id,
        link: form.linkUrl.trim(),
        message: form.message.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        ctaType: form.ctaType,
        format: form.format,
      };

      if (imageHash) {
        body.imageHash = imageHash;
      }

      const res = await fetch("/api/meta/creatives", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar criativo");

      onNext(form, data.id, imageHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
      setUploadingImage(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">
          Passo 3 — Criativo
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure a aparência e o conteúdo do anúncio.
        </p>
      </div>

      <div className="space-y-4">
        {/* Formato */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Formato
          </label>
          <div className="flex gap-4">
            {(["image", "carousel"] as const).map((fmt) => (
              <label
                key={fmt}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  form.format === fmt
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={fmt}
                  checked={form.format === fmt}
                  onChange={() => setForm({ ...form, format: fmt })}
                  className="text-blue-600"
                />
                <span className="text-sm font-medium">
                  {fmt === "image" ? "Imagem única" : "Carrossel"}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Upload de imagem */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Imagem do anúncio
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            {form.imagePreviewUrl ? (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.imagePreviewUrl}
                  alt="Preview"
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {form.imageName}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Clique para trocar
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <svg
                  className="mx-auto w-10 h-10 text-gray-400 mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm text-gray-500">
                  Clique para selecionar imagem
                </p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG</p>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
          />

          {/* Drive picker */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400">ou</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>
          <div className="mt-3">
            <DriveFilePicker onSelect={handleDriveSelect} />
            {driveFile && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.433 22l3.59-6.218H22l-3.59 6.218H4.433zm-2.425-2.018L5.598 14H2l2.39-4.143h6.3L7.3 14h3.604L8.012 18.69 5.59 22H2.008zM9.007 2l3.59 6.218L8.008 14H15.6l4.59-7.93L16.6 2H9.006z"/>
                </svg>
                Imagem do Google Drive selecionada
              </p>
            )}
          </div>

          {uploadingImage && (
            <p className="text-blue-600 text-xs mt-1 flex items-center gap-1">
              <svg
                className="animate-spin w-3 h-3"
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
              Enviando imagem...
            </p>
          )}
        </div>

        {/* Título */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Título{" "}
            <span className="text-red-500">*</span>
            <span className="text-gray-400 font-normal ml-2">
              ({form.title.length}/{MAX_TITLE})
            </span>
          </label>
          <input
            type="text"
            maxLength={MAX_TITLE}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex: Apartamentos a partir de R$ 350mil"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.title ? "border-red-400" : "border-gray-300"
            }`}
          />
          {errors.title && (
            <p className="text-red-500 text-xs mt-1">{errors.title}</p>
          )}
        </div>

        {/* Texto principal */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Texto principal{" "}
            <span className="text-red-500">*</span>
            <span className="text-gray-400 font-normal ml-2">
              ({form.message.length}/{MAX_MESSAGE})
            </span>
          </label>
          <textarea
            maxLength={MAX_MESSAGE}
            rows={3}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Ex: Realize o sonho da casa própria. Localização privilegiada, lazer completo e financiamento facilitado."
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
              errors.message ? "border-red-400" : "border-gray-300"
            }`}
          />
          {errors.message && (
            <p className="text-red-500 text-xs mt-1">{errors.message}</p>
          )}
        </div>

        {/* Descrição */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descrição{" "}
            <span className="text-gray-400 font-normal">
              (opcional, {form.description.length}/{MAX_DESCRIPTION})
            </span>
          </label>
          <input
            type="text"
            maxLength={MAX_DESCRIPTION}
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="Ex: Condições especiais de lançamento"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* CTA */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Chamada para ação (CTA)
          </label>
          <select
            value={form.ctaType}
            onChange={(e) => setForm({ ...form, ctaType: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CTA_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL de destino <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            value={form.linkUrl}
            onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
            placeholder="https://www.seusite.com.br/imovel"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.linkUrl ? "border-red-400" : "border-gray-300"
            }`}
          />
          {errors.linkUrl && (
            <p className="text-red-500 text-xs mt-1">{errors.linkUrl}</p>
          )}
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
            "Criar Criativo e Avançar"
          )}
        </button>
      </div>
    </div>
  );
}
