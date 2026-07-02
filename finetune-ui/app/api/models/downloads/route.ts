import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
const buildBackendUrl = (pathname: string) => new URL(pathname, BACKEND_BASE_URL).toString();

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const downloadId = url.searchParams.get("downloadId");
  const path = downloadId
    ? `/api/models/downloads/${downloadId}`
    : "/api/models/downloads";

  try {
    const res = await fetch(buildBackendUrl(path), { cache: "no-store" });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "Backend request failed", detail }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
