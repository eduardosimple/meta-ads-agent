"use client";

import { useState } from "react";

const SCOPES = "https://www.googleapis.com/auth/adwords";

export default function GoogleAdsAuthPage() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState("");

  function handleAuthorize() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError("Preencha Client ID e Client Secret.");
      return;
    }
    setError("");

    const state = btoa(JSON.stringify({ client_id: clientId.trim(), client_secret: clientSecret.trim() }));
    const redirectUri = `${window.location.origin}/api/auth/google-ads/callback`;

    const params = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri,
      scope: SCOPES,
      access_type: "offline",
      response_type: "code",
      prompt: "consent",
      state,
    });

    window.location.href = `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
  }

  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white";

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Autorizar Google Ads</h1>
            <p className="text-xs text-gray-500">Gera o Refresh Token para integração</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-blue-800">Antes de continuar:</p>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>No Google Cloud Console, abra seu projeto OAuth2</li>
            <li>Vá em <strong>Credenciais → OAuth 2.0 → editar</strong></li>
            <li>Em <strong>URIs de redirecionamento autorizados</strong>, adicione:</li>
          </ol>
          <div className="bg-white rounded-lg px-3 py-2 text-xs font-mono text-gray-700 border border-blue-200 break-all">
            {typeof window !== "undefined" ? window.location.origin : "https://meta-ads-agent-ten.vercel.app"}/api/auth/google-ads/callback
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className={inputClass}
              placeholder="xxxxx.apps.googleusercontent.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Client Secret</label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                className={`${inputClass} pr-10`}
                placeholder="GOCSPX-..."
              />
              <button
                type="button"
                onClick={() => setShowSecret(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                  <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleAuthorize}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #1877f2 0%, #34a853 100%)" }}
          >
            Autorizar com Google →
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center">
          O Refresh Token gerado será exibido nesta janela. Nenhuma credencial é armazenada nesta etapa.
        </p>
      </div>
    </div>
  );
}
