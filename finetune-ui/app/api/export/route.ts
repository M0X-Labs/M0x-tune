import { NextResponse } from "next/server";

export async function GET(request: Request) {
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (data: string) => {
        try {
          controller.enqueue(data);
        } catch {
          // Controller already closed — ignore
        }
      };

      enqueue(`data: ${JSON.stringify({ status: "idle" })}\n\n`);

      let step = 0;
      const totalSteps = 100;
      interval = setInterval(() => {
        step += 5;

        if (step > totalSteps) {
          enqueue(`data: ${JSON.stringify({ status: "completed" })}\n\n`);
          clearInterval(interval!);
          interval = null;
          try { controller.close(); } catch { /* ignore */ }
          return;
        }

        if (step % 20 === 0) {
          enqueue(
            `data: ${JSON.stringify({
              type: "log",
              text: `[SYSTEM] Export progress: ${step}% completed`,
            })}\n\n`,
          );
        }
      }, 500);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  });

  request.signal.addEventListener("abort", () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
