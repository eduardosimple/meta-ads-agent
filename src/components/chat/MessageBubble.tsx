"use client";

import type { ChatMessage } from "@/types/chat";
import CreativeApprovalCard from "./CreativeApprovalCard";

interface Props {
  message: ChatMessage;
  onApprove?: (message: string) => void;
  onReject?: (messageId: string) => void;
  approved?: boolean;
  rejected?: boolean;
}

export default function MessageBubble({ message, onApprove, onReject, approved, rejected }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center mr-2 mt-1 shrink-0"
             style={{ background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)" }}>
          <span className="text-white text-xs font-bold">M</span>
        </div>
      )}

      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
          isUser
            ? "text-white rounded-tr-sm"
            : "bg-white text-gray-800 rounded-tl-sm border border-gray-100"
        }`}
        style={isUser ? { background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)" } : {}}
      >
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ fontFamily: "inherit" }}
        >
          {message.content || (
            <span className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>
        <p className={`text-xs mt-1 ${isUser ? "text-white/60 text-right" : "text-gray-400"}`}>
          {new Date(message.timestamp).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

        {message.creative && onApprove && onReject && (
          <CreativeApprovalCard
            creative={message.creative}
            onApprove={onApprove}
            onReject={() => onReject(message.id)}
            approved={approved}
            rejected={rejected}
          />
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center ml-2 mt-1 shrink-0">
          <span className="text-gray-600 text-xs font-bold">U</span>
        </div>
      )}
    </div>
  );
}
