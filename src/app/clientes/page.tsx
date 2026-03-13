"use client";

import { useState } from "react";
import { useClients } from "@/hooks/useClients";
import ClientList from "@/components/clientes/ClientList";
import ClientForm from "@/components/clientes/ClientForm";
import type { ClientPublic, Client } from "@/types/client";
import { useAppContext } from "@/context/AppContext";

export default function ClientesPage() {
  const { token } = useAppContext();
  const { clients, loading, refetch } = useClients();
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  async function handleEdit(publicClient: ClientPublic) {
    // Fetch full client (for editing we need the full data)
    try {
      const res = await fetch(
        `/api/clients?slug=${publicClient.slug}&full=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const fullClient: Client = await res.json();
        setEditingClient(fullClient);
      } else {
        // fallback: open with public data (secrets will be empty)
        setEditingClient({
          nome: publicClient.nome,
          slug: publicClient.slug,
          ativo: publicClient.ativo,
          meta: {
            access_token: "",
            app_secret: "",
            ad_account_id: publicClient.meta.ad_account_id,
            app_id: publicClient.meta.app_id,
            page_id: publicClient.meta.page_id,
            page_name: publicClient.meta.page_name,
          },
          contexto: publicClient.contexto,
        });
      }
    } catch {
      setEditingClient(null);
    }
    setShowModal(true);
  }

  function handleAdd() {
    setEditingClient(null);
    setShowModal(true);
  }

  function handleDelete(slug: string) {
    refetch();
  }

  function handleSuccess() {
    setShowModal(false);
    setEditingClient(null);
    refetch();
  }

  function handleCancel() {
    setShowModal(false);
    setEditingClient(null);
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <ClientList
        clients={clients}
        loading={loading}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleCancel}
          />

          {/* Dialog */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingClient ? "Editar Cliente" : "Adicionar Cliente"}
              </h2>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <ClientForm
                client={editingClient}
                onSuccess={handleSuccess}
                onCancel={handleCancel}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
