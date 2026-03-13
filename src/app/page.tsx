"use client";

import { useSelectedClient } from "@/hooks/useSelectedClient";
import ChatInterface from "@/components/chat/ChatInterface";

export default function HomePage() {
  const { selectedClient, hasClient } = useSelectedClient();

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-64px)] flex flex-col p-4">
      {/* Header */}
      <div className="mb-3">
        {hasClient ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-gray-600">
              Trabalhando com{" "}
              <span className="font-semibold text-gray-800">{selectedClient!.nome}</span>
              {" "}—{" "}
              <span className="text-gray-500">{selectedClient!.contexto.cidade}, {selectedClient!.contexto.estado}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="#d97706" className="w-4 h-4 shrink-0">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span className="text-amber-700">
              Selecione um cliente no menu acima para começar a criar campanhas
            </span>
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <ChatInterface />
      </div>
    </div>
  );
}
