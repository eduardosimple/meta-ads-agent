import { NextRequest, NextResponse } from "next/server";
import { getGoogleTokens, applyRefreshedTokenCookie } from "@/lib/google-auth";

interface DriveFile {
  id: string;
  name: string;
  thumbnailLink: string | null;
  webContentLink: string | null;
  mimeType: string;
  size: string | null;
}

interface DriveListResponse {
  files: Array<{
    id: string;
    name: string;
    thumbnailLink?: string;
    webContentLink?: string;
    mimeType: string;
    size?: string;
  }>;
  nextPageToken?: string;
}

export async function GET(req: NextRequest) {
  const tokenResult = await getGoogleTokens(req);
  if (!tokenResult) {
    return NextResponse.json(
      { error: "google_auth_required" },
      { status: 401 }
    );
  }

  const { tokens, newEncrypted } = tokenResult;
  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q") ?? "";
  const pageToken = searchParams.get("pageToken") ?? "";

  // Build Drive API query
  let driveQuery = "mimeType contains 'image/' and trashed = false";
  if (query.trim()) {
    // Escape single quotes
    const safeQuery = query.replace(/'/g, "\\'");
    driveQuery += ` and name contains '${safeQuery}'`;
  }

  const params = new URLSearchParams({
    q: driveQuery,
    fields: "nextPageToken,files(id,name,thumbnailLink,webContentLink,mimeType,size)",
    pageSize: "30",
    orderBy: "modifiedTime desc",
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );

  if (!driveRes.ok) {
    const err = await driveRes.json().catch(() => ({}));
    console.error("Drive API error:", err);
    if (driveRes.status === 401) {
      return NextResponse.json({ error: "google_auth_required" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Erro ao listar arquivos do Drive" },
      { status: 502 }
    );
  }

  const data = (await driveRes.json()) as DriveListResponse;

  const files: DriveFile[] = (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    thumbnailLink: f.thumbnailLink ?? null,
    webContentLink: f.webContentLink ?? null,
    mimeType: f.mimeType,
    size: f.size ?? null,
  }));

  const res = NextResponse.json({
    files,
    nextPageToken: data.nextPageToken ?? null,
  });

  applyRefreshedTokenCookie(res, newEncrypted);

  return res;
}
