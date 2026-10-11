import type { Message as AGUIMessage } from "@openuidev/react-headless";
import type { Router } from "./router";
import type { TranscriptItem } from "./types";

/**
 * HTTP handler that speaks AG-UI over SSE, for OpenUI's <AgentInterface> (or any AG-UI
 * client): `fetchLLM({ url, streamAdapter: agUIAdapter(), messageFormat: identityMessageFormat })`.
 */
export function aguiChatHandler(
  router: Router,
  opts: {
    maxTurns?: number;
    maxMessageChars?: number;
    waitUntil?: (p: Promise<unknown>) => void;
    /** Hard stop for a turn, below the platform's function time limit. */
    maxTurnMs?: number;
  } = {},
) {
  const maxTurns = opts.maxTurns ?? 24;
  const maxChars = opts.maxMessageChars ?? 2000;

  return async function POST(req: Request): Promise<Response> {
    const body = (await req.json()) as { messages?: AGUIMessage[]; runId?: unknown };
    const transcript = toTranscript(body.messages ?? [], maxTurns, maxChars);
    if (transcript.length === 0 || transcript[transcript.length - 1].role !== "user") {
      return Response.json({ error: "Send a message to start." }, { status: 400 });
    }
    const requestId =
      typeof body.runId === "string" && /^[\w-]{8,64}$/.test(body.runId) ? body.runId : undefined;

    // The turn runs to completion even if the browser goes away (e.g. the user switches chats):
    // it is not tied to req.signal, and its answer is stored under `requestId` for later.
    const work = new AbortController();
    const hardStop = setTimeout(() => work.abort(), opts.maxTurnMs ?? 280_000);
    let clientGone = false;
    req.signal.addEventListener("abort", () => (clientGone = true));

    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const send = (event: Record<string, unknown>) => {
      if (clientGone || !controllerRef) return;
      try {
        controllerRef.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch {
        clientGone = true;
      }
    };

    const threadId = crypto.randomUUID();
    const runId = requestId ?? crypto.randomUUID();
    const turn = router
      .runTurn({
        transcript,
        signal: work.signal,
        requestId,
        emit: async (event) => {
          if (event.type === "tool_call") {
            send({ type: "TOOL_CALL_START", toolCallId: event.call.id, toolCallName: event.call.name });
            send({ type: "TOOL_CALL_ARGS", toolCallId: event.call.id, delta: JSON.stringify(event.call.args) });
            send({ type: "TOOL_CALL_END", toolCallId: event.call.id });
          } else if (event.type === "tool_result") {
            send({
              type: "TOOL_CALL_RESULT",
              messageId: crypto.randomUUID(),
              toolCallId: event.result.id,
              content: JSON.stringify(event.result.result),
              role: "tool",
              ...(event.result.isError ? { isError: true } : {}),
            });
          } else {
            await streamText(send, event.text, () => clientGone);
          }
        },
      })
      .then(({ pending }) => pending)
      .catch((error) => console.error("[llm-router] handler error", error))
      .finally(() => clearTimeout(hardStop));
    // Keep the function alive until the turn (and its storage writes) finish.
    opts.waitUntil?.(turn);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controllerRef = controller;
        send({ type: "RUN_STARTED", threadId, runId });
        await turn;
        send({ type: "RUN_FINISHED", threadId, runId });
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      },
      cancel() {
        clientGone = true;
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
    });
  };
}

/** GET ?id=<runId>: the stored result of a turn whose client disconnected. */
export function aguiResultHandler(router: Router) {
  return async function GET(req: Request): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[\w-]{8,64}$/.test(id)) return Response.json({ status: "unknown" }, { status: 400 });
    const result = await router.result(id);
    return Response.json(result ?? { status: "unknown" }, { headers: { "Cache-Control": "no-store" } });
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send the finished answer a couple of lines at a time so the UI still builds up in order. */
async function streamText(send: (e: Record<string, unknown>) => void, text: string, gone: () => boolean) {
  if (!text) return;
  const messageId = crypto.randomUUID();
  send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
  const lines = text.split(/(?<=\n)/);
  for (let i = 0; i < lines.length; i += 2) {
    send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: lines.slice(i, i + 2).join("") });
    if (i + 2 < lines.length && !gone()) await sleep(30);
  }
  send({ type: "TEXT_MESSAGE_END", messageId });
}

/**
 * AG-UI thread → neutral transcript. Only the text of earlier turns is replayed (user messages
 * and the assistant's answers); earlier tool calls are dropped to keep requests small.
 */
export function toTranscript(thread: AGUIMessage[], maxTurns: number, maxChars: number): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  for (const m of thread) {
    const last = out[out.length - 1];
    if (m.role === "user") {
      const text = (
        typeof m.content === "string"
          ? m.content
          : m.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n")
      ).slice(0, maxChars);
      if (!text.trim()) continue;
      if (last?.role === "user") last.text += `\n\n${text}`;
      else out.push({ role: "user", text });
    } else if (m.role === "assistant" && m.content?.trim()) {
      if (last?.role === "assistant") last.text += `\n${m.content}`;
      else out.push({ role: "assistant", text: m.content, calls: [] });
    }
  }
  const recent = out.slice(-maxTurns);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}
