import { createHash } from "node:crypto";
import {
  candidateKey,
  ProviderError,
  type AttemptLog,
  type Candidate,
  type CachedTurn,
  type OrderEntry,
  type Provider,
  type RouterEvent,
  type RouterStore,
  type ToolCall,
  type ToolDeclaration,
  type ToolResult,
  type TranscriptItem,
  type TurnLog,
  type TurnOutcome,
} from "./types";

export interface RouterConfig {
  /** Namespaces cache, health, logs and usage, so several apps can share one store. */
  app: string;
  providers: Provider[];
  /** Ranked fallback order: tried top to bottom, model by model. */
  order: OrderEntry[];
  /** Rough AI answers per day across all models, for the "answers left today" counter. */
  dailyAnswerBudget?: number;
  /** System prompt variants, referenced by `OrderEntry.prompt` ("full" is the default). */
  prompts: Record<string, string>;
  /** Appended to every system prompt at request time (e.g. today's date). */
  systemSuffix?: () => string;
  tools: {
    declarations: ToolDeclaration[];
    run(name: string, args: Record<string, unknown>): Promise<{ result: unknown; isError: boolean }>;
  };
  store: RouterStore;
  cache?: {
    /**
     * Cache refresh timer: every cached answer is dropped at the end of each window of this
     * length (windows are aligned to UTC midnight, so 24h = a fresh cache every day).
     */
    refreshEveryMs: number;
    /** Return false to skip the cache for a transcript (e.g. very long threads). */
    shouldCache?: (transcript: TranscriptItem[]) => boolean;
  };
  /** Turn a model's final text into what the client shows; return "" if nothing usable. */
  finalizeAnswer?: (text: string) => string;
  /**
   * True when an answer shows data that must come from a tool in this turn. Such an answer
   * from a model that called no tools is rejected and the next model is tried (the last
   * model's answer is kept, so a turn never fails on this check alone).
   */
  needsTools?: (answer: string) => boolean;
  /** Turn a plain notice (e.g. the "all exhausted" message) into client format. */
  formatNotice?: (text: string) => string;
  messages: { exhausted: string; gaveUp: string };
  /** Readable label for a user message in logs (e.g. strip client envelopes). */
  questionLabel?: (text: string) => string;
  maxRounds?: number;
  maxAttempts?: number;
  /** How long to skip a model after an error. */
  benchMs?: (error: ProviderError) => number;
}

export interface TurnResult {
  log: TurnLog;
  /** Storage writes still in flight; hand to `waitUntil` on serverless. */
  pending: Promise<unknown>;
}

const defaultBenchMs = (error: ProviderError) =>
  error.status === 401 || error.status === 403 || error.status === 404
    ? 6 * 3_600_000 // bad key, not allowed, retired
    : error.status === 429 && error.detail === "daily"
      ? 3_600_000 // daily quota: check hourly
      : error.status === 429
        ? 60_000 // per-minute quota
        : error.status === 413
          ? 10 * 60_000 // request larger than the model's per-minute budget
          : 30_000; // overloaded, stalled, malformed reply

export function createRouter(config: RouterConfig) {
  const providers = new Map(config.providers.map((p) => [p.id, p]));
  const maxRounds = config.maxRounds ?? 8;
  const maxAttempts = config.maxAttempts ?? 20;
  const benchMs = config.benchMs ?? defaultBenchMs;
  const finalize = config.finalizeAnswer ?? ((t: string) => t.trim());
  const notice = config.formatNotice ?? ((t: string) => t);
  // Cache entries are tied to the prompts, so editing a prompt invalidates old answers.
  const promptVersion = hash(JSON.stringify(config.prompts)).slice(0, 12);

  /** Expand the order into concrete provider+model candidates, skipping disabled providers. */
  async function candidates(): Promise<Candidate[]> {
    const lists = await Promise.all(
      config.order.map(async (entry) => {
        const provider = providers.get(entry.provider);
        if (!provider?.enabled()) return [];
        const models =
          entry.models === "discover" ? ((await provider.discoverModels?.()) ?? []) : entry.models;
        return models
          .slice(0, entry.limit ?? models.length)
          .map((model) => ({
            provider: entry.provider,
            model,
            prompt: entry.prompt ?? "full",
          }));
      }),
    );
    const seen = new Set<string>();
    return lists.flat().filter((c) => !seen.has(candidateKey(c)) && seen.add(candidateKey(c)));
  }

  /** The current refresh window; keys change when it ends, so every entry refreshes together. */
  function cacheWindow() {
    const every = config.cache!.refreshEveryMs;
    const index = Math.floor(Date.now() / every);
    return { index, endsAt: (index + 1) * every };
  }

  function cacheKey(transcript: TranscriptItem[], context: string) {
    const turns = transcript.map((t) =>
      t.role === "user" ? `u:${normalize(t.text)}` : t.role === "assistant" ? `a:${t.text.trim()}` : "",
    );
    return hash(`${promptVersion}|${cacheWindow().index}|${context}|${turns.join("\n")}`);
  }

  async function runTurn(input: {
    transcript: TranscriptItem[];
    emit: (event: RouterEvent) => void | Promise<void>;
    signal: AbortSignal;
    /** When set, the final answer is stored so a disconnected client can fetch it later. */
    requestId?: string;
    /** Per-request system prompt text (e.g. the user's default origin); part of the cache key. */
    context?: string;
  }): Promise<TurnResult> {
    const { signal, requestId } = input;
    // Remember the answer (and tools) as they're emitted, for the stored result.
    const resultTools: { call: ToolCall; result: ToolResult }[] = [];
    let lastCall: ToolCall | null = null;
    const emit = async (event: RouterEvent) => {
      if (event.type === "tool_call") lastCall = event.call;
      if (event.type === "tool_result" && lastCall) resultTools.push({ call: lastCall, result: event.result });
      if (event.type === "answer" && requestId) {
        writes.push(config.store.putResult(config.app, requestId, { status: "done", answer: event.text, tools: resultTools }));
      }
      await input.emit(event);
    };
    const transcript = [...input.transcript];
    const started = Date.now();
    const question = [...transcript].reverse().find((t) => t.role === "user");
    const log: TurnLog = {
      id: crypto.randomUUID(),
      app: config.app,
      ts: started,
      outcome: "failed",
      cache: "skip",
      attempts: [],
      rounds: 0,
      tools: [],
      latencyMs: 0,
      question: question?.role === "user" ? (config.questionLabel ?? ((t: string) => t))(question.text) : "",
    };
    const writes: Promise<unknown>[] = [];
    if (requestId) writes.push(config.store.putResult(config.app, requestId, { status: "pending" }));
    const finish = (outcome: TurnOutcome) => {
      log.outcome = outcome;
      log.latencyMs = Date.now() - started;
      console.log(JSON.stringify({ llmRouterTurn: { ...log, attempts: log.attempts.map((a) => `${a.model} ${a.ok ? "ok" : a.status} ${a.ms}ms`) } }));
      writes.push(config.store.logTurn(log), config.store.recordUsage(config.app, log.attempts));
      return { log, pending: Promise.allSettled(writes) };
    };

    // 1. Cache.
    const useCache = Boolean(config.cache) && (config.cache?.shouldCache?.(transcript) ?? true);
    const key = useCache ? cacheKey(transcript, input.context ?? "") : "";
    const [cached, benched, all] = await Promise.all([
      useCache ? config.store.cacheGet(config.app, key) : Promise.resolve(null),
      config.store.getBenched(config.app),
      candidates(),
    ]);
    if (useCache) log.cache = cached ? "hit" : "miss";
    if (cached) {
      for (const { call, result } of cached.tools) {
        await emit({ type: "tool_call", call });
        await emit({ type: "tool_result", result });
      }
      await emit({ type: "answer", text: cached.answer });
      log.answeredBy = `cache (${cached.answeredBy})`;
      log.tools = cached.tools.map((t) => t.call.name);
      return finish("cached");
    }

    // 2. Models, healthy ones first; recently failed ones stay at the back as a last resort.
    const isReady = (c: Candidate) => (benched[candidateKey(c)] ?? 0) <= Date.now();
    const queue = [...all.filter(isReady), ...all.filter((c) => !isReady(c))];
    const toolLog: CachedTurn["tools"] = [];
    let index = 0;

    try {
      for (let round = 0; round < maxRounds; round++) {
        log.rounds = round + 1;
        let response: { text: string; calls: ToolCall[]; raw?: unknown } | null = null;
        let answer = "";

        while (!response) {
          const candidate = queue[index];
          if (!candidate || log.attempts.length >= maxAttempts) {
            await emit({ type: "answer", text: notice(config.messages.exhausted) });
            return finish("exhausted");
          }
          const attemptStart = Date.now();
          try {
            const provider = providers.get(candidate.provider)!;
            // The last round has no tools, so a long tool chain still ends in an answer.
            const lastRound = round === maxRounds - 1;
            const system =
              (config.prompts[candidate.prompt] ?? config.prompts.full) +
              (config.systemSuffix?.() ?? "") +
              (input.context ?? "") +
              (lastRound ? "\n\nNo more tool calls are available: write the final answer now using the tool results above." : "");
            const r = await provider.round({
              model: candidate.model,
              system,
              transcript,
              tools: config.tools.declarations,
              toolChoice: lastRound ? "none" : "auto",
              signal,
            });
            if (r.calls.length === 0) {
              answer = finalize(r.text);
              if (!answer) throw new ProviderError("empty or unusable answer", 502);
              if (toolLog.length === 0 && index < queue.length - 1 && config.needsTools?.(answer)) {
                throw new ProviderError("answered with data but called no tools", 422);
              }
            }
            log.attempts.push({
              model: candidateKey(candidate),
              ok: true,
              ms: Date.now() - attemptStart,
              inputTokens: r.usage?.inputTokens,
              outputTokens: r.usage?.outputTokens,
            });
            response = r;
          } catch (error) {
            if (signal.aborted) return finish("aborted");
            const err = error instanceof ProviderError ? error : new ProviderError(String(error), 500);
            log.attempts.push({
              model: candidateKey(candidate),
              ok: false,
              status: err.status,
              error: `${err.detail ? `${err.detail}: ` : ""}${err.message}`.slice(0, 200),
              ms: Date.now() - attemptStart,
            });
            // Skipping tools is a one-off slip, not a reason to rest the model.
            if (err.status !== 422) {
              const until = Date.now() + benchMs(err);
              benched[candidateKey(candidate)] = until;
              writes.push(config.store.bench(config.app, candidateKey(candidate), until, err.status, err.message));
            }
            index++;
          }
        }

        const model = queue[index];
        transcript.push({ role: "assistant", text: response.text, calls: response.calls, raw: response.raw, rawFor: candidateKey(model) });

        if (response.calls.length === 0) {
          await emit({ type: "answer", text: answer });
          log.answeredBy = candidateKey(model);
          if (useCache) {
            writes.push(
              config.store.cacheSet(
                config.app,
                key,
                { answer, tools: toolLog, answeredBy: candidateKey(model) },
                Math.max(60_000, cacheWindow().endsAt - Date.now()),
              ),
            );
          }
          return finish("answered");
        }

        // Run the requested tools, then continue (possibly on another model) with the results.
        const results: ToolResult[] = [];
        for (const raw of response.calls) {
          // Some models leak format tokens into names ("search_flights<|channel|>commentary").
          const call = { ...raw, name: canonicalToolName(raw.name, config.tools.declarations) };
          await emit({ type: "tool_call", call });
          const { result, isError } = await config.tools.run(call.name, call.args);
          const toolResult = { id: call.id, name: call.name, result, isError };
          await emit({ type: "tool_result", result: toolResult });
          results.push(toolResult);
          toolLog.push({ call, result: toolResult });
          log.tools.push(call.name);
        }
        transcript.push({ role: "tool", results });
      }
      await emit({ type: "answer", text: notice(config.messages.gaveUp) });
      return finish("gave_up");
    } catch (error) {
      if (signal.aborted) return finish("aborted");
      console.error("[llm-router] unexpected error", error);
      await emit({ type: "answer", text: notice(config.messages.gaveUp) });
      return finish("failed");
    }
  }

  /**
   * Simple daily counter: the configured answer budget minus AI answers given today (cached
   * answers don't count). Resets at 00:00 UTC. An estimate, not a live provider quota.
   */
  async function quota() {
    const now = new Date();
    const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const today = await config.store.countTurns(config.app, startOfDay);
    const budget = config.dailyAnswerBudget ?? 150;
    return {
      answersLeft: Math.max(0, budget - today.answered),
      dailyBudget: budget,
      today,
      resetsAt: new Date(startOfDay + 86_400_000).toISOString(),
    };
  }

  return {
    runTurn,
    candidates,
    quota,
    /** The stored result of a turn (for clients that disconnected mid-turn). */
    result: (requestId: string) => config.store.getResult(config.app, requestId),
    /** Today's usage and recent turns, for an admin endpoint. */
    async report(limit = 50) {
      const day = new Date().toISOString().slice(0, 10);
      const [usage, turns, benched] = await Promise.all([
        config.store.usage(config.app, day),
        config.store.recentTurns(config.app, limit),
        config.store.getBenched(config.app),
      ]);
      return { day, order: (await candidates()).map(candidateKey), benched, usage, turns };
    },
  };
}

export type Router = ReturnType<typeof createRouter>;

/** Map a slightly mangled tool name back to a declared one (exact match, else longest prefix). */
function canonicalToolName(name: string, declarations: ToolDeclaration[]) {
  if (declarations.some((d) => d.name === name)) return name;
  const match = declarations
    .filter((d) => name.startsWith(d.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  return match?.name ?? name;
}

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

/** Normalise a user message for cache matching: case, spacing and trailing punctuation. */
function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[\s.!?…]+$/u, "").trim();
}
