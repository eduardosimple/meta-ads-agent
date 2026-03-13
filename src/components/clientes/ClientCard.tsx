"use client";

import { useState } from "react";
import { useAppContext } from "@/context/AppContext";
import type { ClientPublic } from "@/types/client";

interface Props {
  client: ClientPublic;
  onEdit: (client: ClientPublic) => void;
  onDelete: (slug: string) => void;
}

export default function ClientCard({ client, onEdit, onDelete }: Props) {
  const { token } = useAppContext();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Deseja realmente excluir "${client.nome}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients?slug=${client.slug}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) onDelete(client.slug);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)" }}
        >
          {client.nome.charAt(0).toUpperCase()}
        </div>
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full ${
            client.ativo
              ? "bg-green-50 text-green-600 border border-green-100"
              : "bg-gray-100 text-gray-500 border border-gray-200"
          }`}
        >
          {client.ativo ? "Ativo" : "Inativo"}
        </span>
      </div>

      {/* Info */}
      <h3 className="font-semibold text-gray-800 mb-1 truncate" title={client.nome}>
        {client.nome}
      </h3>
      <p className="text-xs text-gray-400 mb-1 font-mono">{client.slug}</p>
      {client.contexto.cidade && (
        <p className="text-sm text-gray-500 mb-1">
          {client.contexto.cidade}, {client.contexto.estado}
        </p>
      )}
      <p className="text-xs text-gray-400 truncate mb-1" title={client.meta.ad_account_id}>
        {client.meta.ad_account_id}
      </p>
      {client.meta.page_name && (
        <p className="text-xs text-gray-400 truncate">
          Página: {client.meta.page_name}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onEdit(client)}
          className="flex-1 text-xs font-medium px-3 py-2 rounded-lg
                     border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
        >
          Editar
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex-1 text-xs font-medium px-3 py-2 rounded-lg
                     border border-red-200 text-red-500 hover:bg-red-50 transition-colors
                     disabled:opacity-50"
        >
          {deleting ? "..." : "Excluir"}
        </button>
      </div>
    </div>
  );
}
