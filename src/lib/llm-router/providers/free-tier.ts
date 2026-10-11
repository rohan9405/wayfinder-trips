import { geminiProvider } from "./gemini";
import { openAICompatibleProvider } from "./openai-compatible";
import type { Provider } from "../types";

/**
 * Ready-made free-tier providers, configured from environment variables. Each is enabled only
 * when its credentials are present, and is set up so it can't be billed:
 *
 * | Provider    | Env                                          | Free limits (as of Oct 2026)                       |
 * |-------------|----------------------------------------------|----------------------------------------------------|
 * | gemini      | GEMINI_API_KEY                               | ~5 req/min, ~20 req/day per model (no billing)     |
 * | groq        | GROQ_API_KEY                                 | per model: 30 req/min, 1K req/day, 8K tok/min, 200K tok/day |
 * | openrouter  | OPENROUTER_API_KEY                           | ":free" models only; 20 req/min, 50 req/day/account |
 * | cloudflare  | CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN | 10,000 neurons/day (Workers Free), 300 req/min     |
 * | nvidia      | NVIDIA_API_KEY                               | free developer access, ~40 req/min                 |
 */

type Discovered = { id: string; context_length?: number; supported_parameters?: string[] };

/** Cached `/models` listing, filtered and ranked by preference. */
export function cachedDiscovery(opts: {
  name: string;
  url: string;
  key?: () => string | undefined;
  filter: (m: Discovered) => boolean;
  preference: string[];
  onlyPreferred?: boolean;
  limit?: number;
}) {
  let cached: { at: number; models: string[] } | null = null;
  return async () => {
    if (cached && Date.now() - cached.at < 3_600_000) return cached.models;
    try {
      const key = opts.key?.();
      const res = await fetch(opts.url, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { data } = (await res.json()) as { data: Discovered[] };
      const rank = (id: string) => {
        const i = opts.preference.findIndex((p) => id.toLowerCase().includes(p));
        return i === -1 ? opts.preference.length : i;
      };
      const models = data
        .filter(opts.filter)
        .filter((m) => !opts.onlyPreferred || rank(m.id) < opts.preference.length)
        .sort((a, b) => rank(a.id) - rank(b.id) || (b.context_length ?? 0) - (a.context_length ?? 0))
        .slice(0, opts.limit ?? 4)
        .map((m) => m.id);
      cached = { at: Date.now(), models };
      return models;
    } catch (error) {
      console.warn(`[llm-router] could not list ${opts.name} models`, error);
      return cached?.models ?? [];
    }
  };
}

// Model families that handle tool calling and long structured output well, best first.
export const STRONG_FAMILIES = [
  "deepseek",
  "kimi-k2",
  "nemotron-3-ultra",
  "gpt-oss-120b",
  "qwen3",
  "gemma-4-31b",
  "llama-4",
  "nemotron-3-super",
  "glm",
  "llama-3.3-70b",
  "inkling",
];

export function freeTierProviders(env: NodeJS.ProcessEnv = process.env): Provider[] {
  return [
    geminiProvider({ apiKey: () => env.GEMINI_API_KEY }),

    openAICompatibleProvider({
      id: "groq",
      baseURL: () => "https://api.groq.com/openai/v1",
      apiKey: () => env.GROQ_API_KEY,
      // 8K tokens/minute: keep hidden reasoning short.
      extraBody: (model) =>
        model.includes("gpt-oss") ? { reasoning_effort: "low" } : model.includes("qwen") ? { reasoning_format: "hidden" } : {},
    }),

    openAICompatibleProvider({
      id: "openrouter",
      baseURL: () => "https://openrouter.ai/api/v1",
      apiKey: () => env.OPENROUTER_API_KEY,
      headers: { "X-Title": "llm-router" },
      allowModel: (model) => model.endsWith(":free"), // never a paid model
      discoverModels: cachedDiscovery({
        name: "OpenRouter",
        url: "https://openrouter.ai/api/v1/models",
        filter: (m) =>
          m.id.endsWith(":free") &&
          Boolean(m.supported_parameters?.includes("tools")) &&
          (m.context_length ?? 0) >= 64_000 &&
          !m.id.includes("safety"),
        preference: STRONG_FAMILIES,
      }),
    }),

    openAICompatibleProvider({
      id: "cloudflare",
      baseURL: () =>
        env.CLOUDFLARE_ACCOUNT_ID
          ? `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`
          : undefined,
      apiKey: () => env.CLOUDFLARE_API_TOKEN,
      // Workers AI's default output cap is too short for a full answer.
      extraBody: () => ({ max_tokens: 4096 }),
      // Paid-only Workers AI models are never allowed.
      allowModel: (model) => !/kimi-k2\.[67]|glm-5|deepseek-v4/.test(model),
    }),

    openAICompatibleProvider({
      id: "nvidia",
      baseURL: () => "https://integrate.api.nvidia.com/v1",
      apiKey: () => env.NVIDIA_API_KEY,
      discoverModels: cachedDiscovery({
        name: "NVIDIA",
        url: "https://integrate.api.nvidia.com/v1/models",
        key: () => env.NVIDIA_API_KEY,
        filter: (m) => !/embed|rerank|guard|safety|vision|vlm|reward|parse|clip/i.test(m.id),
        preference: STRONG_FAMILIES,
        onlyPreferred: true,
      }),
    }),
  ];
}
