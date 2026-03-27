"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppContext } from "@/context/AppContext";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import type { ChatMessage } from "@/types/chat";

const CREATIVE_MARKER = "CRIATIVO_GERADO:";

function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

function extractCreative(content: string) {
  const idx = content.indexOf(CREATIVE_MARKER);
  if (idx === -1) return { text: content, creative: undefined };
  try {
    const jsonStr = content.slice(idx + CREATIVE_MARKER.length).trim();
    const creative = JSON.parse(jsonStr);
    return { text: content.slice(0, idx).trim(), creative };
  } catch {
    return { text: content, creative: undefined };
  }
}

export default function ChatInterface() {
  const { token, selectedClient } = useAppContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!token) return;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: text,
            clientSlug: selectedClient?.slug ?? "",
            history,
          }),
        });

        if (!res.ok || !res.body) {
          let errDetail = `HTTP ${res.status}`;
          try {
            const errJson = await res.json();
            errDetail = errJson.error ?? errDetail;
          } catch { /* ignore */ }
          throw new Error(`Falha na requisição: ${errDetail}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;

          // Exibir sem o bloco do marcador enquanto streama
          const { text: displayText } = extractCreative(fullContent);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: displayText } : m
            )
          );
        }

        // Após streaming completo — detectar criativo
        const { text: finalText, creative } = extractCreative(fullContent);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: finalText, creative }
              : m
          )
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `Erro: ${errMsg}` }
              : m
          )
        );
      } finally {
        setStreaming(false);
      }
    },
    [token, selectedClient, messages]
  );

  function handleApprove(message: string, messageId: string) {
    setApprovedIds((prev) => new Set(prev).add(messageId));
    sendMessage(message);
  }

  function handleReject(messageId: string) {
    setRejectedIds((prev) => new Set(prev).add(messageId));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-8 h-8">
                <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              Meta Ads Agent
            </h3>
            <p className="text-gray-500 text-sm max-w-md">
              {selectedClient
                ? `Trabalhando com ${selectedClient.nome}. Como posso ajudar hoje?`
                : "Selecione um cliente acima e comece a criar campanhas de anúncios no Meta."}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onApprove={(approvalMsg) => handleApprove(approvalMsg, msg.id)}
            onReject={handleReject}
            approved={approvedIds.has(msg.id)}
            rejected={rejectedIds.has(msg.id)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-gray-50 p-4">
        <ChatInput
          onSend={sendMessage}
          disabled={streaming}
          placeholder={
            streaming
              ? "Aguardando resposta..."
              : "Pergunte sobre campanhas, métricas ou peça para criar um anúncio..."
          }
        />
        {streaming && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            Gerando resposta...
          </p>
        )}
      </div>
    </div>
  );
}
