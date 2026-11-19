/**
 * Pipes the engine's SSE stream through the Next server so the viewer stays same-origin.
 * Plain rewrites buffer event streams in dev; a route handler with a ReadableStream does not.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:4000";

export async function GET(req: Request) {
  const upstream = await fetch(`${ENGINE_URL}/api/stream`, {
    headers: { accept: "text/event-stream" },
    signal: req.signal,
    // @ts-expect-error – node fetch extension, keeps the body un-buffered
    duplex: "half",
  }).catch((e: Error) => new Response(`engine unreachable: ${e.message}`, { status: 502 }));

  if (!upstream.ok || !upstream.body) return new Response("engine stream unavailable", { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
