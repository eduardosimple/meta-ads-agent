"use client";

import { useRef, useCallback } from "react";

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled = false, placeholder }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const value = textareaRef.current?.value.trim();
    if (!value || disabled) return;
    onSend(value);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
  }, [onSend, disabled]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }

  return (
    <div className="flex items-end gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-2">
      <textarea
        ref={textareaRef}
        rows={1}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={placeholder ?? "Digite sua mensagem... (Enter para enviar, Shift+Enter para nova linha)"}
        className="flex-1 resize-none bg-transparent outline-none text-gray-800
                   placeholder-gray-400 text-sm py-2 px-2 leading-relaxed
                   disabled:opacity-50 max-h-[200px] min-h-[40px]"
        style={{ fontFamily: "inherit" }}
      />
      <button
        onClick={handleSend}
        disabled={disabled}
        className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                   text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed
                   hover:scale-105 active:scale-95"
        style={{ background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)" }}
        aria-label="Enviar mensagem"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5"
        >
          <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
        </svg>
      </button>
    </div>
  );
}
