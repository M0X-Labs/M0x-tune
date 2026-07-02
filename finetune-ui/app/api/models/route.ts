import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

const buildBackendUrl = (pathname: string) => new URL(pathname, BACKEND_BASE_URL).toString();

export async function GET() {
  try {
    const res = await fetch(buildBackendUrl("/api/models"), { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to load models" }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: string; [key: string]: unknown };
    const action = body.action ?? "search";
    let path: string;
    let payload: Record<string, unknown>;

    switch (action) {
      case "search":
        path = "/api/models/search";
        payload = {
          query: String(body.query ?? ""),
          limit: Number(body.limit ?? 12),
        };
        break;
      case "download":
        path = "/api/models/download";
        payload = {
          repoId: String(body.repoId ?? ""),
          targetPath: body.targetPath ? String(body.targetPath) : undefined,
          token: body.token ? String(body.token) : undefined,
        };
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const res = await fetch(buildBackendUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

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

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const downloadId = url.searchParams.get("downloadId");
  if (!downloadId) {
    return NextResponse.json({ error: "downloadId is required" }, { status: 400 });
  }

  try {
    const res = await fetch(buildBackendUrl(`/api/models/downloads/${downloadId}`), {
      method: "DELETE",
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "Failed to cancel download", detail }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
