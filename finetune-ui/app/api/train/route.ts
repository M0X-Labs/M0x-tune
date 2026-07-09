import { NextResponse } from "next/server";

import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

type BackendJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type RouteProcessStatus = "idle" | "training" | "completed" | "failed";

type JobSnapshot = {
  job_id: string;
  status: BackendJobStatus;
  step: number;
  total_steps: number;
  percent: number;
  loss: number | null;
  learning_rate: number | null;
  epoch: number | null;
  logs: string[];
};

const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

let activeJobId: string | null = null;
let processStatus: RouteProcessStatus = "idle";

const buildBackendUrl = (pathname: string) => new URL(pathname, BACKEND_BASE_URL).toString();

const toRouteStatus = (status: BackendJobStatus): RouteProcessStatus => {
  if (status === "queued" || status === "running") return "training";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "idle";
};

const formatSse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

async function getSnapshot(jobId: string): Promise<JobSnapshot | null> {
  const response = await fetch(buildBackendUrl(`/api/jobs/${jobId}`), {
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json()) as JobSnapshot;
}

async function loadTrainingPayload(request: Request) {
  const parentDir = path.resolve(process.cwd(), "..");
  const configPath = path.join(parentDir, "finetune_config.json");

  let fileConfig: Record<string, unknown> = {};
  try {
    fileConfig = JSON.parse(await readFile(configPath, "utf-8")) as Record<string, unknown>;
  } catch {
    fileConfig = {};
  }

  let requestConfig: Record<string, unknown> = {};
  try {
    requestConfig = (await request.json()) as Record<string, unknown>;
  } catch {
    requestConfig = {};
  }

  return { ...fileConfig, ...requestConfig };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedJobId = url.searchParams.get("jobId");
  let jobId = requestedJobId ?? activeJobId;

  if (!jobId) {
    try {
      const activeRes = await fetch(buildBackendUrl("/api/jobs/active"), {
        cache: "no-store",
      });
      if (activeRes.ok) {
        const data = (await activeRes.json()) as { jobId: string | null; status: BackendJobStatus };
        if (data.jobId) {
          jobId = data.jobId;
          activeJobId = data.jobId;
          processStatus = toRouteStatus(data.status);
        }
      }
    } catch (err) {
      console.error("Failed to fetch active job from backend", err);
    }
  }

  if (!jobId) {
    return new NextResponse(
      formatSse("status", { status: processStatus }) +
        formatSse("progress", { percent: 0, step: 0, totalSteps: 0 }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }
    );
  }

  const response = await fetch(buildBackendUrl(`/api/jobs/${jobId}/events`), {
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

export async function POST(request: Request) {
  try {
    const activeRes = await fetch(buildBackendUrl("/api/jobs/active"), {
      cache: "no-store",
    });
    if (activeRes.ok) {
      const data = (await activeRes.json()) as { jobId: string | null; status: BackendJobStatus };
      if (data.jobId && (data.status === "queued" || data.status === "running")) {
        activeJobId = data.jobId;
        processStatus = toRouteStatus(data.status);
        return NextResponse.json({ error: "Training is already running", jobId: data.jobId }, { status: 400 });
      }
    }
  } catch (err) {
    if (activeJobId) {
      const snapshot = await getSnapshot(activeJobId);
      if (snapshot && (snapshot.status === "queued" || snapshot.status === "running")) {
        return NextResponse.json({ error: "Training is already running", jobId: activeJobId }, { status: 400 });
      }
    }
  }

  const payload = await loadTrainingPayload(request);
  const response = await fetch(buildBackendUrl("/api/jobs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: "Failed to create backend job", detail: errorText }, { status: 502 });
  }

  const data = (await response.json()) as { jobId: string; status: BackendJobStatus };
  activeJobId = data.jobId;
  processStatus = toRouteStatus(data.status);
  return NextResponse.json({ success: true, status: "started", jobId: activeJobId });
}

export async function DELETE() {
  let jobId = activeJobId;
  if (!jobId) {
    try {
      const activeRes = await fetch(buildBackendUrl("/api/jobs/active"), {
        cache: "no-store",
      });
      if (activeRes.ok) {
        const data = (await activeRes.json()) as { jobId: string | null };
        jobId = data.jobId;
      }
    } catch {}
  }

  if (!jobId) {
    return NextResponse.json({ error: "No training process is running" }, { status: 400 });
  }

  const response = await fetch(buildBackendUrl(`/api/jobs/${jobId}`), {
    method: "DELETE",
  }).catch(() => null);

  if (!response?.ok) {
    const detail = response ? await response.text() : "Backend request failed";
    return NextResponse.json({ error: "Failed to terminate backend job", detail }, { status: 502 });
  }

  if (jobId === activeJobId) {
    activeJobId = null;
    processStatus = "idle";
  }
  return NextResponse.json({ success: true, status: "terminated", jobId });
}
