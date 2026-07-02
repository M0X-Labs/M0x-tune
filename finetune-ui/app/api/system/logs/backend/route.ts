import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const backendUrl = new URL("/api/system/logs/backend", BACKEND_BASE_URL).toString();

  const response = await fetch(backendUrl, {
    headers: { Accept: "text/event-stream" },
    cache: "no-store",
    signal: request.signal,
  }).catch(() => null);

  if (!response?.ok || !response.body) {
    return NextResponse.json({ error: "Backend event stream is unavailable" }, { status: 502 });
  }

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
