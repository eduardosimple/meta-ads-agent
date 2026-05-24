"use client";

/**
 * Error boundary do relatório diário — captura crashes da página inteira
 * (em vez do "Application error: digest XXX" do Next padrão) e mostra um
 * card legível com a mensagem + botão de retry.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-[#18181b] border border-rose-500/30 rounded-2xl p-6 space-y-4">
        <div>
          <p className="text-[11px] tracking-[0.22em] uppercase text-rose-400 font-medium">Erro no relatório</p>
          <h2 className="text-zinc-50 text-lg font-semibold mt-1">Algo quebrou ao renderizar</h2>
        </div>
        <pre className="text-xs text-zinc-400 bg-[#0f0f12] border border-[#1c1c20] rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
          {error.message || "Erro desconhecido"}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <button
          onClick={reset}
          className="w-full py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#7c3aed] to-[#3b82f6] hover:opacity-90 transition"
        >
          Tentar de novo
        </button>
        <p className="text-[10px] text-zinc-500 text-center">
          Se persistir: pode ser dado de algum cliente em formato inesperado. Veja logs no Vercel.
        </p>
      </div>
    </div>
  );
}
