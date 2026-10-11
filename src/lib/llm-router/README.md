# llm-router

A small, app-agnostic layer for answering chat turns with tool calling across a ranked list
of free-tier models. It fails over silently, caches answers, shares model health between
server instances, and logs every turn. Nothing in this folder knows about Wayfinder; copy the
folder into another app to reuse it.

## What it does per turn

1. **Cache:** the same conversation (case, spacing and trailing punctuation ignored) within the
   current refresh window returns the stored answer, without calling a model. The cache refreshes
   on a timer (`cache.refreshEveryMs`; windows are aligned to UTC midnight). Editing a prompt
   invalidates it immediately.
2. **Ordering:** expands the ranked `order` into concrete provider and model pairs, skipping
   providers without credentials. Models that failed recently move to the back of the queue
   rather than being removed.
3. **Failover:** if a model fails at any point (quota, overload, timeout, bad output), the next
   model continues the same turn with the full transcript, including tool results already
   fetched. Answers are released only once complete, so nothing half-written is ever shown.
4. **Exhaustion:** when every model has failed, the user gets `messages.exhausted`.
5. **Survives disconnects:** a turn keeps running if the client goes away (e.g. the user
   switches chats). Its answer is stored under the request's `runId`, so the client can fetch it
   later with `GET /api/chat?id=<runId>` (`aguiResultHandler`).
6. **Logging:** each turn records its outcome, cache hit or miss, every attempt (model, HTTP
   status, latency, tokens), tools used, and the model that answered. Per-model daily usage is
   counted, and failed models are benched for a period that depends on the error.

## Using it in another app

```ts
// llm.config.ts
import { createRouter, d1Store, freeTierProviders } from "./lib/llm-router";

export const router = createRouter({
  app: "my-app",                       // namespaces cache/logs/health in a shared store
  providers: freeTierProviders(),      // enabled by whichever API keys are set
  order: [
    { provider: "gemini", models: ["gemini-3.8-flash", "gemini-3.7-flash"] },
    { provider: "groq", models: ["openai/gpt-oss-120b"], prompt: "compact" },
    { provider: "openrouter", models: "discover", limit: 4 },
  ],
  prompts: { full: SYSTEM_PROMPT, compact: SHORT_SYSTEM_PROMPT },
  tools: { declarations: TOOLS, run: (name, args) => runMyTool(name, args) },
  store: d1Store({ accountId, databaseId, apiToken }),   // or memoryStore() locally
  cache: { refreshEveryMs: 24 * 3_600_000 },   // whole cache refreshes daily
  messages: { exhausted: "Token limits reached in all models, try again after sometime.", gaveUp: "…" },
});

// app/api/chat/route.ts (Next.js + OpenUI <AgentInterface>)
import { waitUntil } from "@vercel/functions";
export const POST = aguiChatHandler(router, { waitUntil });
```

Clients that don't use AG-UI can call `router.runTurn({ transcript, emit, signal })` directly.
It emits `tool_call`, `tool_result` and a single `answer` event.

## Daily counter

`router.quota()` returns `{ answersLeft, dailyBudget, today, resetsAt }`: the configured
`dailyAnswerBudget` minus AI answers given since 00:00 UTC (cached answers don't count). It is a
lightweight estimate from a single count query, not a live provider quota.

## Changing the order

The order is data: edit the `order` array. Each entry gives a provider, its models (or
`"discover"`), an optional prompt variant, and a `note`. To decide what to change, run
`router.report()` (exposed at `/api/admin/llm` in Wayfinder). It shows the effective order,
which models are benched and until when, today's requests, failures and tokens per model, and
the recent turns with every attempt.

## Files

| File | Purpose |
| --- | --- |
| `router.ts` | Ordering, failover, cache, health, logging |
| `agui.ts` | AG-UI over SSE handler (turns survive disconnects), stored-result handler, transcript conversion |
| `providers/gemini.ts` | Gemini (AI Studio) |
| `providers/openai-compatible.ts` | Any OpenAI-compatible API |
| `providers/free-tier.ts` | Preset free-tier providers: Gemini, Groq, OpenRouter `:free`, Cloudflare Workers AI, NVIDIA |
| `store/memory.ts` / `store/d1.ts` | Storage: per-process, or Cloudflare D1 over REST (schema in the file) |
