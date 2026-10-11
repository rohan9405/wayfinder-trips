import { waitUntil } from "@vercel/functions";
import { aguiChatHandler, aguiResultHandler } from "@/lib/llm-router";
import { router } from "@/llm.config";
import { saveChat } from "@/lib/chat-archive";
import { identity } from "@/lib/guest-session";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Chat endpoint for <AgentInterface>. Model order, failover, caching and logging are handled
 * by the router configured in src/llm.config.ts. Turns finish even if the browser leaves;
 * GET ?id=<runId> returns a stored answer for a turn the browser didn't wait for.
 */
const chatHandler = aguiChatHandler(router, { waitUntil });

export async function POST(req: Request) {
  const session = identity(req);
  const body = await req.clone().json().catch(() => ({})) as { threadId?: unknown; runId?: unknown; messages?: unknown };
  if (typeof body.threadId === "string") {
    // Archive in the background so the answer starts streaming straight away.
    // Archive failures must not interrupt trip planning.
    waitUntil(
      saveChat({
        id: body.threadId,
        owner: session.owner,
        messages: body.messages,
        runId: typeof body.runId === "string" ? body.runId : null,
      }).catch((error) => console.error("[chat-archive] save failed", error)),
    );
  }
  const response = await chatHandler(req);
  if (session.setCookie) response.headers.append("Set-Cookie", session.setCookie);
  return response;
}
export const GET = aguiResultHandler(router);
