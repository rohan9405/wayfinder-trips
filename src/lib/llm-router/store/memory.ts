import type { AttemptLog, CachedTurn, RouterStore, TurnLog, TurnResultRecord } from "../types";

const day = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);

/**
 * Per-process store. Fine for local development; on serverless each instance has its own copy
 * and it vanishes on cold start, so use a durable store (e.g. d1Store) in production.
 */
export function memoryStore(): RouterStore {
  const cache = new Map<string, { value: CachedTurn; expires: number }>();
  const benched = new Map<string, number>();
  const turns: TurnLog[] = [];
  const usage = new Map<string, { requests: number; failures: number; inputTokens: number; outputTokens: number }>();
  const results = new Map<string, { value: TurnResultRecord; at: number }>();

  return {
    async putResult(app, id, value) {
      results.set(`${app}|${id}`, { value, at: Date.now() });
      for (const [k, r] of results) if (Date.now() - r.at > 3_600_000) results.delete(k);
    },
    async getResult(app, id) {
      return results.get(`${app}|${id}`)?.value ?? null;
    },
    async countTurns(app, sinceMs) {
      const recent = turns.filter((t) => t.app === app && t.ts >= sinceMs);
      return {
        answered: recent.filter((t) => t.outcome === "answered").length,
        cached: recent.filter((t) => t.outcome === "cached").length,
        exhausted: recent.filter((t) => t.outcome === "exhausted").length,
      };
    },
    async cacheGet(app, key) {
      const hit = cache.get(`${app}|${key}`);
      if (!hit || hit.expires < Date.now()) return null;
      return hit.value;
    },
    async cacheSet(app, key, value, ttlMs) {
      cache.set(`${app}|${key}`, { value, expires: Date.now() + ttlMs });
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
    },
    async getBenched(app) {
      const out: Record<string, number> = {};
      for (const [k, until] of benched) if (k.startsWith(`${app}|`) && until > Date.now()) out[k.slice(app.length + 1)] = until;
      return out;
    },
    async bench(app, model, untilMs) {
      benched.set(`${app}|${model}`, untilMs);
    },
    async logTurn(log) {
      turns.unshift(log);
      turns.length = Math.min(turns.length, 500);
    },
    async recordUsage(app, attempts: AttemptLog[]) {
      for (const a of attempts) {
        const k = `${app}|${day()}|${a.model}`;
        const u = usage.get(k) ?? { requests: 0, failures: 0, inputTokens: 0, outputTokens: 0 };
        u.requests++;
        if (!a.ok) u.failures++;
        u.inputTokens += a.inputTokens ?? 0;
        u.outputTokens += a.outputTokens ?? 0;
        usage.set(k, u);
      }
    },
    async recentTurns(app, limit) {
      return turns.filter((t) => t.app === app).slice(0, limit);
    },
    async usage(app, d) {
      const prefix = `${app}|${d}|`;
      return [...usage.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, u]) => ({ model: k.slice(prefix.length), ...u }));
    },
  };
}
