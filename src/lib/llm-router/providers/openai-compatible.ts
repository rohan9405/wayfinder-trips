import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { stallGuard } from "../stall";
import { ProviderError, type Provider, type RoundRequest, type ToolCall, type TranscriptItem } from "../types";

export interface OpenAICompatibleOptions {
  id: string;
  baseURL: () => string | undefined;
  apiKey: () => string | undefined;
  /** Optional model discovery for `models: "discover"` order entries. */
  discoverModels?: () => Promise<string[]>;
  /** Extra request body fields per model (e.g. reasoning settings). */
  extraBody?: (model: string) => Record<string, unknown>;
  /** Only allow models that pass this check (e.g. OpenRouter ":free" ids). */
  allowModel?: (model: string) => boolean;
  headers?: Record<string, string>;
}

/** Any provider that speaks the OpenAI Chat Completions API with streaming and tools. */
export function openAICompatibleProvider(opts: OpenAICompatibleOptions): Provider {
  let client: OpenAI | null = null;
  let clientFor = "";
  const getClient = () => {
    const apiKey = opts.apiKey();
    const baseURL = opts.baseURL();
    if (!apiKey || !baseURL) throw new ProviderError(`${opts.id} is not configured`, 401);
    if (!client || clientFor !== `${baseURL}|${apiKey}`) {
      client = new OpenAI({ apiKey, baseURL, maxRetries: 0, defaultHeaders: opts.headers });
      clientFor = `${baseURL}|${apiKey}`;
    }
    return client;
  };

  return {
    id: opts.id,
    enabled: () => Boolean(opts.apiKey() && opts.baseURL()),
    discoverModels: opts.discoverModels,
    async round({ model, system, transcript, tools, toolChoice, signal }: RoundRequest) {
      if (opts.allowModel && !opts.allowModel(model)) {
        throw new ProviderError(`${model} is not allowed for ${opts.id}`, 403);
      }
      const guard = stallGuard(signal);
      const pending = new Map<number, { id: string; name: string; args: string }>();
      let text = "";
      let finishReason: string | null = null;
      let usage: { inputTokens?: number; outputTokens?: number } | undefined;

      try {
        const stream = await getClient().chat.completions.create(
          {
            model,
            messages: toMessages(system, transcript),
            ...(tools.length
              ? {
                  tools: tools.map((t) => ({
                    type: "function" as const,
                    function: { name: t.name, description: t.description, parameters: t.parameters },
                  })),
                  ...(toolChoice === "none" ? { tool_choice: "none" as const } : {}),
                }
              : {}),
            stream: true,
            stream_options: { include_usage: true },
            ...(opts.extraBody?.(model) ?? {}),
          },
          { signal: guard.signal },
        );
        for await (const chunk of stream) {
          guard.gotData();
          // Some gateways report upstream failures inside an otherwise successful stream.
          const inline = (chunk as unknown as { error?: { code?: number; message?: string } }).error;
          if (inline) throw new ProviderError(inline.message ?? "Upstream error", Number(inline.code) || 502);
          if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
          const choice = chunk.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta;
          if (delta?.content) text += delta.content;
          for (const tc of delta?.tool_calls ?? []) {
            const entry = pending.get(tc.index) ?? { id: "", name: "", args: "" };
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name += tc.function.name;
            if (tc.function?.arguments) entry.args += tc.function.arguments;
            pending.set(tc.index, entry);
          }
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (guard.stalled) throw new ProviderError(`${model} sent nothing in time`, 503);
        const status = (error as { status?: number })?.status ?? 502;
        const message = String((error as { message?: string })?.message ?? error);
        const daily = /per[- ]?day|free-models-per-day|daily|tokens per day|\(TPD\)|\(RPD\)/i.test(message) ? "daily" : "";
        throw new ProviderError(message.slice(0, 300), status, daily);
      } finally {
        guard.dispose();
      }
      if (finishReason === "length") throw new ProviderError(`${model} hit its output limit`, 413);

      const calls: ToolCall[] = [...pending.values()]
        .filter((c) => c.name)
        .map((c) => ({ id: c.id || `call_${crypto.randomUUID().slice(0, 8)}`, name: c.name, args: safeJson(c.args) }));
      return { text, calls, usage };
    },
  };
}

function toMessages(system: string, transcript: TranscriptItem[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [{ role: "system", content: system }];
  for (const item of transcript) {
    if (item.role === "user") out.push({ role: "user", content: item.text });
    else if (item.role === "assistant") {
      out.push({
        role: "assistant",
        // "" rather than null: some providers (Cloudflare gpt-oss) reject null content.
        content: item.text.trim() ? item.text : "",
        ...(item.calls.length
          ? {
              tool_calls: item.calls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      });
    } else {
      for (const r of item.results) {
        out.push({ role: "tool", tool_call_id: r.id, content: JSON.stringify(r.isError ? { error: r.result } : r.result) });
      }
    }
  }
  return out;
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
