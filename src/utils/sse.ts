import type { ServerResponse } from "http";
import type { SSEEvent } from "../session/types.js";

export function sendSSE(res: ServerResponse, event: SSEEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  // Flush immediately so the browser receives each chunk as it arrives
  if (typeof (res as any).flush === 'function') (res as any).flush();
}

export function sseHeaders(res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });
}
