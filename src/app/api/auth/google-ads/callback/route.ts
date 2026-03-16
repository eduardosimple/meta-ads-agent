import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state"); // contains client_id and client_secret encoded

  if (error) {
    return new NextResponse(errorPage(error), { headers: { "Content-Type": "text/html" } });
  }

  if (!code || !state) {
    return new NextResponse(errorPage("Parâmetros inválidos"), { headers: { "Content-Type": "text/html" } });
  }

  let clientId: string, clientSecret: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
    clientId = decoded.client_id;
    clientSecret = decoded.client_secret;
  } catch {
    return new NextResponse(errorPage("State inválido"), { headers: { "Content-Type": "text/html" } });
  }

  const redirectUri = `${new URL(req.url).origin}/api/auth/google-ads/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json() as {
      refresh_token?: string;
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || tokenData.error) {
      return new NextResponse(
        errorPage(tokenData.error_description ?? tokenData.error ?? "Erro ao obter tokens"),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    if (!tokenData.refresh_token) {
      return new NextResponse(
        errorPage("Google não retornou refresh_token. Certifique-se de ter revogado o acesso anterior em myaccount.google.com/permissions e tente de novo."),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    return new NextResponse(successPage(tokenData.refresh_token), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new NextResponse(errorPage(msg), { headers: { "Content-Type": "text/html" } });
  }
}

function successPage(refreshToken: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google Ads — Refresh Token</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: white; border-radius: 16px; padding: 32px; max-width: 560px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .icon { width: 48px; height: 48px; background: #e6f4ea; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 24px; }
  h1 { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px; }
  p { font-size: 14px; color: #666; margin-bottom: 20px; line-height: 1.5; }
  .token-box { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 10px; padding: 14px 16px; font-family: monospace; font-size: 13px; color: #1a1a1a; word-break: break-all; margin-bottom: 16px; }
  button { width: 100%; padding: 12px; background: #1a73e8; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
  button:hover { background: #1557b0; }
  button.copied { background: #34a853; }
  .note { font-size: 12px; color: #999; margin-top: 16px; text-align: center; }
  a { color: #1a73e8; text-decoration: none; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">✓</div>
  <h1>Autorização concluída!</h1>
  <p>Copie o Refresh Token abaixo e cole no cadastro do cliente na seção <strong>Credenciais Google Ads</strong>.</p>
  <div class="token-box" id="token">${refreshToken}</div>
  <button id="btn" onclick="copyToken()">Copiar Refresh Token</button>
  <p class="note">Guarde este token com segurança. Você pode fechar esta janela após copiar.<br>
  <a href="/clientes">Ir para Clientes →</a></p>
</div>
<script>
function copyToken() {
  navigator.clipboard.writeText(document.getElementById('token').innerText).then(() => {
    const btn = document.getElementById('btn');
    btn.textContent = '✓ Copiado!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copiar Refresh Token'; btn.classList.remove('copied'); }, 2000);
  });
}
</script>
</body></html>`;
}

function errorPage(message: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Erro</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: white; border-radius: 16px; padding: 32px; max-width: 480px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .icon { font-size: 36px; margin-bottom: 16px; }
  h1 { font-size: 18px; font-weight: 700; color: #d32f2f; margin-bottom: 8px; }
  p { font-size: 14px; color: #666; }
  a { color: #1a73e8; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">✗</div>
  <h1>Erro na autorização</h1>
  <p>${message}</p>
  <p style="margin-top:16px"><a href="/google-ads-auth">← Tentar novamente</a></p>
</div>
</body></html>`;
}
