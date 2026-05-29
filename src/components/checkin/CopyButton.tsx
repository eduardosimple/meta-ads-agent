"use client";
import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard pode falhar em http; fallback select */
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className="text-xs px-3 py-1 rounded border border-zinc-700 hover:border-emerald-500/50 hover:text-emerald-300 transition"
    >
      {copied ? "✓ copiado" : "Copiar"}
    </button>
  );
}
