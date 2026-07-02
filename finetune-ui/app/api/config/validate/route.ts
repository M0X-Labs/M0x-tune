import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
const buildBackendUrl = (pathname: string) => new URL(pathname, BACKEND_BASE_URL).toString();

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: string; [key: string]: unknown };
    const action = body.action ?? "validate";

    let path: string;
    let init: RequestInit;

    if (action === "validate") {
      path = "/api/config/validate";
      init = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body.payload ?? {}),
      };
    } else if (action === "quantizations") {
      path = "/api/config/quantizations";
      init = { method: "GET" };
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const res = await fetch(buildBackendUrl(path), init);
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
