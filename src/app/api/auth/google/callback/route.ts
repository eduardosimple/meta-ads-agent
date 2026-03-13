import { NextRequest, NextResponse } from "next/server";
import { encryptTokens } from "@/lib/google-crypto";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(new URL("/criar?drive=error", req.nextUrl.origin));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/criar?drive=error", req.nextUrl.origin));
  }

  // Verify CSRF state
  let returnTo = "/criar";
  try {
    const statePayload = JSON.parse(Buffer.from(stateParam, "base64url").toString());
    const savedState = req.cookies.get("google_oauth_state")?.value;
    if (!savedState || savedState !== statePayload.csrf) {
      return NextResponse.redirect(new URL("/criar?drive=error&reason=csrf", req.nextUrl.origin));
    }
    if (statePayload.returnTo && typeof statePayload.returnTo === "string") {
      returnTo = statePayload.returnTo;
    }
  } catch {
    return NextResponse.redirect(new URL("/criar?drive=error&reason=state", req.nextUrl.origin));
  }

  // Exchange code for tokens
  let tokenData: GoogleTokenResponse;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Google token exchange failed:", err);
      return NextResponse.redirect(new URL("/criar?drive=error&reason=token", req.nextUrl.origin));
    }

    tokenData = (await tokenRes.json()) as GoogleTokenResponse;
  } catch (err) {
    console.error("Google token exchange error:", err);
    return NextResponse.redirect(new URL("/criar?drive=error&reason=token", req.nextUrl.origin));
  }

  // Build token object with expiry timestamp
  const tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? null,
    expiry_date: Date.now() + tokenData.expires_in * 1000,
    token_type: tokenData.token_type,
    scope: tokenData.scope,
  };

  // Encrypt and save in cookie
  const encrypted = await encryptTokens(tokens);

  const redirectUrl = new URL(`${returnTo}?drive=connected`, req.nextUrl.origin);
  const res = NextResponse.redirect(redirectUrl);

  // Clear CSRF cookie
  res.cookies.delete("google_oauth_state");

  res.cookies.set("google_tokens", encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });

  return res;
}
