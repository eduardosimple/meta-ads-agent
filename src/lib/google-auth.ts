/**
 * Utility to get a valid Google access token from the request cookie,
 * refreshing automatically if expired.
 */

import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { decryptTokens, encryptTokens } from "./google-crypto";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

export interface GoogleTokens {
  access_token: string;
  refresh_token: string | null;
  expiry_date: number;
  token_type: string;
  scope: string;
}

interface RefreshResult {
  tokens: GoogleTokens;
  /** If refreshed, the new encrypted value to set back in the cookie */
  newEncrypted: string | null;
}

export async function getGoogleTokens(req: NextRequest): Promise<RefreshResult | null> {
  const cookieValue = req.cookies.get("google_tokens")?.value;
  if (!cookieValue) return null;

  const tokens = await decryptTokens<GoogleTokens>(cookieValue);
  if (!tokens || !tokens.access_token) return null;

  // Check if access token is expired (with 5-minute buffer)
  const FIVE_MINUTES = 5 * 60 * 1000;
  if (tokens.expiry_date > Date.now() + FIVE_MINUTES) {
    return { tokens, newEncrypted: null };
  }

  // Token expired — try to refresh
  if (!tokens.refresh_token) return null;

  try {
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!refreshRes.ok) return null;

    const refreshData = (await refreshRes.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    const newTokens: GoogleTokens = {
      ...tokens,
      access_token: refreshData.access_token,
      expiry_date: Date.now() + refreshData.expires_in * 1000,
      token_type: refreshData.token_type,
    };

    const newEncrypted = await encryptTokens(newTokens);
    return { tokens: newTokens, newEncrypted };
  } catch {
    return null;
  }
}

/**
 * Apply the refreshed token cookie to a NextResponse if the token was refreshed.
 */
export function applyRefreshedTokenCookie(
  res: NextResponse,
  newEncrypted: string | null
): void {
  if (!newEncrypted) return;
  res.cookies.set("google_tokens", newEncrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
}
