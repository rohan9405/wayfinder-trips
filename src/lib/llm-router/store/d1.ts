import type { AttemptLog, CachedTurn, RouterStore, TurnLog, TurnResultRecord } from "../types";
import { memoryStore } from "./memory";

/**
 * Cloudflare D1 over its REST API (works from any server, including Vercel). Free plan: 5M
 * reads and 100K writes per day; past that requests fail instead of being billed.
 *
 * Schema (create once):
 *   CREATE TABLE cache (key TEXT PRIMARY KEY, app TEXT NOT NULL, value TEXT NOT NULL,
 *     created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0);
 *   CREATE TABLE turns (id TEXT PRIMARY KEY, app TEXT NOT NULL, ts INTEGER NOT NULL,
 *     outcome TEXT NOT NULL, cache TEXT NOT NULL, answered_by TEXT, attempts INTEGER NOT NULL,
 *     rounds INTEGER NOT NULL, tools TEXT, latency_ms INTEGER NOT NULL, question TEXT, detail TEXT);
 *   CREATE TABLE model_health (app TEXT NOT NULL, model TEXT NOT NULL, benched_until INTEGER NOT NULL,
 *     last_status INTEGER, last_error TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (app, model));
 *   CREATE TABLE turn_results (id TEXT PRIMARY KEY, app TEXT NOT NULL, status TEXT NOT NULL,
 *     value TEXT, created_at INTEGER NOT NULL);
 *   CREATE TABLE model_usage (app TEXT NOT NULL, day TEXT NOT NULL, model TEXT NOT NULL,
 *     requests INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
 *     input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
 *     PRIMARY KEY (app, day, model));
 *
 * Any D1 failure falls back to an in-memory store, so storage problems never break a chat.
 */
export function d1Store(opts: { accountId: string; databaseId: string; apiToken: string }): RouterStore {
  const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/d1/database/${opts.databaseId}/query`;
  const fallback = memoryStore();

  async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(4_000),
    });
    const body = (await res.json()) as { success: boolean; errors?: unknown[]; result?: { results?: T[] }[] };
    if (!res.ok || !body.success) throw new Error(`D1 ${res.status}: ${JSON.stringify(body.errors).slice(0, 200)}`);
    return body.result?.[0]?.results ?? [];
  }

  /** Run against D1; on any error log once and use the in-memory fallback. */
  async function safe<T>(label: string, run: () => Promise<T>, otherwise: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      console.warn(`[llm-router] D1 ${label} failed, using memory`, String(error).slice(0, 200));
      return otherwise();
    }
  }

  const day = () => new Date().toISOString().slice(0, 10);

  return {
    putResult: (app, id, value: TurnResultRecord) =>
      safe(
        "putResult",
        async () => {
          await fallback.putResult(app, id, value);
          await query(
            "INSERT INTO turn_results (id, app, status, value, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, value = excluded.value",
            [`${app}:${id}`, app, value.status, JSON.stringify(value), Date.now()],
          );
          if (Math.random() < 0.05) await query("DELETE FROM turn_results WHERE created_at < ?", [Date.now() - 86_400_000]);
        },
        () => fallback.putResult(app, id, value),
      ),

    getResult: (app, id) =>
      safe(
        "getResult",
        async () => {
          const rows = await query<{ value: string }>("SELECT value FROM turn_results WHERE id = ?", [`${app}:${id}`]);
          return rows[0] ? (JSON.parse(rows[0].value) as TurnResultRecord) : null;
        },
        () => fallback.getResult(app, id),
      ),

    countTurns: (app, sinceMs) =>
      safe(
        "countTurns",
        async () => {
          const rows = await query<{ outcome: string; n: number }>(
            "SELECT outcome, COUNT(*) AS n FROM turns WHERE app = ? AND ts >= ? GROUP BY outcome",
            [app, sinceMs],
          );
          const n = (o: string) => rows.find((r) => r.outcome === o)?.n ?? 0;
          return { answered: n("answered"), cached: n("cached"), exhausted: n("exhausted") };
        },
        () => fallback.countTurns(app, sinceMs),
      ),

    cacheGet: (app, key) =>
      safe(
        "cacheGet",
        async () => {
          const rows = await query<{ value: string }>(
            "UPDATE cache SET hits = hits + 1 WHERE key = ? AND app = ? AND expires_at > ? RETURNING value",
            [key, app, Date.now()],
          );
          return rows[0] ? (JSON.parse(rows[0].value) as CachedTurn) : null;
        },
        () => fallback.cacheGet(app, key),
      ),

    cacheSet: (app, key, value, ttlMs) =>
      safe(
        "cacheSet",
        async () => {
          const now = Date.now();
          await query(
            "INSERT INTO cache (key, app, value, created_at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, created_at = excluded.created_at, expires_at = excluded.expires_at",
            [key, app, JSON.stringify(value), now, now + ttlMs],
          );
          // Opportunistic cleanup of expired rows.
          if (Math.random() < 0.05) await query("DELETE FROM cache WHERE expires_at < ?", [now]);
        },
        () => fallback.cacheSet(app, key, value, ttlMs),
      ),

    getBenched: (app) =>
      safe(
        "getBenched",
        async () => {
          const rows = await query<{ model: string; benched_until: number }>(
            "SELECT model, benched_until FROM model_health WHERE app = ? AND benched_until > ?",
            [app, Date.now()],
          );
          return Object.fromEntries(rows.map((r) => [r.model, r.benched_until]));
        },
        () => fallback.getBenched(app),
      ),

    bench: (app, model, untilMs, status, error) =>
      safe(
        "bench",
        async () => {
          await fallback.bench(app, model, untilMs, status, error);
          await query(
            "INSERT INTO model_health (app, model, benched_until, last_status, last_error, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(app, model) DO UPDATE SET benched_until = excluded.benched_until, last_status = excluded.last_status, last_error = excluded.last_error, updated_at = excluded.updated_at",
            [app, model, untilMs, status, error.slice(0, 300), Date.now()],
          );
        },
        () => fallback.bench(app, model, untilMs, status, error),
      ),

    logTurn: (log: TurnLog) =>
      safe(
        "logTurn",
        async () => {
          await query(
            "INSERT INTO turns (id, app, ts, outcome, cache, answered_by, attempts, rounds, tools, latency_ms, question, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              log.id,
              log.app,
              log.ts,
              log.outcome,
              log.cache,
              log.answeredBy ?? null,
              log.attempts.length,
              log.rounds,
              log.tools.join(","),
              log.latencyMs,
              log.question.slice(0, 300),
              JSON.stringify(log.attempts),
            ],
          );
          // Keep the log bounded: drop turns older than 30 days now and then.
          if (Math.random() < 0.02) await query("DELETE FROM turns WHERE ts < ?", [Date.now() - 30 * 86_400_000]);
        },
        () => fallback.logTurn(log),
      ),

    recordUsage: (app, attempts: AttemptLog[]) =>
      safe(
        "recordUsage",
        async () => {
          for (const a of attempts) {
            await query(
              "INSERT INTO model_usage (app, day, model, requests, failures, input_tokens, output_tokens) VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT(app, day, model) DO UPDATE SET requests = requests + 1, failures = failures + excluded.failures, input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens",
              [app, day(), a.model, a.ok ? 0 : 1, a.inputTokens ?? 0, a.outputTokens ?? 0],
            );
          }
        },
        () => fallback.recordUsage(app, attempts),
      ),

    recentTurns: (app, limit) =>
      safe(
        "recentTurns",
        async () => {
          const rows = await query<Record<string, unknown>>(
            "SELECT * FROM turns WHERE app = ? ORDER BY ts DESC LIMIT ?",
            [app, limit],
          );
          return rows.map((r): TurnLog => ({
            id: String(r.id),
            app: String(r.app),
            ts: Number(r.ts),
            outcome: r.outcome as TurnLog["outcome"],
            cache: r.cache as TurnLog["cache"],
            answeredBy: r.answered_by ? String(r.answered_by) : undefined,
            attempts: JSON.parse(String(r.detail ?? "[]")),
            rounds: Number(r.rounds),
            tools: String(r.tools ?? "").split(",").filter(Boolean),
            latencyMs: Number(r.latency_ms),
            question: String(r.question ?? ""),
          }));
        },
        () => fallback.recentTurns(app, limit),
      ),

    usage: (app, d) =>
      safe(
        "usage",
        async () =>
          (
            await query<{ model: string; requests: number; failures: number; input_tokens: number; output_tokens: number }>(
              "SELECT model, requests, failures, input_tokens, output_tokens FROM model_usage WHERE app = ? AND day = ? ORDER BY requests DESC",
              [app, d],
            )
          ).map((r) => ({
            model: r.model,
            requests: r.requests,
            failures: r.failures,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
          })),
        () => fallback.usage(app, d),
      ),
  };
}
