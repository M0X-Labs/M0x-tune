import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const modelId = url.searchParams.get("modelId");
  if (!modelId) {
    return NextResponse.json({ error: "modelId is required" }, { status: 400 });
  }

  try {
    const backendUrl = new URL("/api/models/files", BACKEND_BASE_URL);
    backendUrl.searchParams.set("model_id", modelId);

    const res = await fetch(backendUrl.toString(), { cache: "no-store" });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "Failed to get model files", detail }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
