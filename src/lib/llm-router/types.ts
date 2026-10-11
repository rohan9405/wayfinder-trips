/**
 * llm-router: a small, app-agnostic layer that answers chat turns with tool calling across a
 * ranked list of (usually free-tier) models, failing over silently, caching answers, and
 * logging every turn. Nothing in this folder knows about the app that uses it.
 */

// ── Conversation ─────────────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  result: unknown;
  isError: boolean;
}

/** Provider-neutral transcript, so a turn can move between providers mid-way. */
export type TranscriptItem =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      calls: ToolCall[];
      /** Provider-specific raw output, replayed only to the same provider+model. */
      raw?: unknown;
      rawFor?: string;
    }
  | { role: "tool"; results: ToolResult[] };

export interface ToolDeclaration {
  name: string;
  description: string;
  /** JSON Schema for the single object argument. */
  parameters: Record<string, unknown>;
}

// ── Providers ────────────────────────────────────────────────────────────

export interface RoundRequest {
  model: string;
  system: string;
  transcript: TranscriptItem[];
  tools: ToolDeclaration[];
  /** "none" forbids tool calls this round (the model must answer). */
  toolChoice?: "auto" | "none";
  signal: AbortSignal;
}

export interface RoundResponse {
  text: string;
  calls: ToolCall[];
  raw?: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface Provider {
  id: string;
  /** False when credentials are missing; the router then skips it. */
  enabled(): boolean;
  /** Models to try when the order entry says `models: "discover"`. */
  discoverModels?(): Promise<string[]>;
  /** One model request. Must throw ProviderError on failure. */
  round(req: RoundRequest): Promise<RoundResponse>;
}

/** A failed model request. `status` follows HTTP; `detail` is "daily" for daily quotas. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail = "",
  ) {
    super(message);
  }
}

// ── Ordering ─────────────────────────────────────────────────────────────

/** One entry of the ranked fallback order. Entries are tried top to bottom. */
export interface OrderEntry {
  provider: string;
  /** Explicit model ids (best first) or "discover" to ask the provider. */
  models: string[] | "discover";
  /** Which system prompt variant to send (e.g. "full", "compact"). */
  prompt?: string;
  /** Use at most this many discovered models. */
  limit?: number;
  /** Optional note for humans reading logs/config. */
  note?: string;
}

export interface Candidate {
  provider: string;
  model: string;
  prompt: string;
}

export const candidateKey = (c: { provider: string; model: string }) => `${c.provider}:${c.model}`;

// ── Storage (cache, health, logs, usage) ─────────────────────────────────

export interface CachedTurn {
  answer: string;
  tools: { call: ToolCall; result: ToolResult }[];
  answeredBy: string;
}

export interface AttemptLog {
  model: string;
  ok: boolean;
  status?: number;
  error?: string;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type TurnOutcome = "answered" | "cached" | "exhausted" | "gave_up" | "aborted" | "failed";

export interface TurnLog {
  id: string;
  app: string;
  ts: number;
  outcome: TurnOutcome;
  cache: "hit" | "miss" | "skip";
  answeredBy?: string;
  attempts: AttemptLog[];
  rounds: number;
  tools: string[];
  latencyMs: number;
  question: string;
}

/** A turn's final answer, kept briefly so a client that disconnected can fetch it later. */
export interface TurnResultRecord {
  status: "pending" | "done";
  answer?: string;
  tools?: { call: ToolCall; result: ToolResult }[];
}

export interface TurnCounts {
  answered: number;
  cached: number;
  exhausted: number;
}

export interface RouterStore {
  putResult(app: string, id: string, value: TurnResultRecord): Promise<void>;
  getResult(app: string, id: string): Promise<TurnResultRecord | null>;
  /** Turns by outcome since a timestamp (for the daily quota estimate). */
  countTurns(app: string, sinceMs: number): Promise<TurnCounts>;
  cacheGet(app: string, key: string): Promise<CachedTurn | null>;
  cacheSet(app: string, key: string, value: CachedTurn, ttlMs: number): Promise<void>;
  /** Models benched until a timestamp (ms), shared across server instances when durable. */
  getBenched(app: string): Promise<Record<string, number>>;
  bench(app: string, model: string, untilMs: number, status: number, error: string): Promise<void>;
  logTurn(log: TurnLog): Promise<void>;
  recordUsage(app: string, attempts: AttemptLog[]): Promise<void>;
  recentTurns(app: string, limit: number): Promise<TurnLog[]>;
  usage(app: string, day: string): Promise<{ model: string; requests: number; failures: number; inputTokens: number; outputTokens: number }[]>;
}

// ── Events the router emits while answering ──────────────────────────────

export type RouterEvent =
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; result: ToolResult }
  /** The finished answer text for this turn (already post-processed). */
  | { type: "answer"; text: string };
