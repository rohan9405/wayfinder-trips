import { FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import { stallGuard } from "../stall";
import { ProviderError, type Provider, type RoundRequest, type ToolCall, type TranscriptItem } from "../types";

// Gemini's documented placeholder for function calls the current model didn't produce itself.
const SKIP_SIGNATURE = "skip_thought_signature_validator";

/**
 * Google Gemini via AI Studio. Stays free as long as the key's project has no billing:
 * requests past the free quota then fail with 429 instead of being charged.
 */
export function geminiProvider(opts: { apiKey: () => string | undefined; id?: string }): Provider {
  const id = opts.id ?? "gemini";
  let client: GoogleGenAI | null = null;
  let clientKey: string | undefined;
  const getClient = () => {
    const key = opts.apiKey();
    if (!key) throw new ProviderError("Gemini API key is not set", 401);
    if (!client || clientKey !== key) {
      client = new GoogleGenAI({ apiKey: key });
      clientKey = key;
    }
    return client;
  };

  return {
    id,
    enabled: () => Boolean(opts.apiKey()),
    async round({ model, system, transcript, tools, toolChoice, signal }: RoundRequest) {
      const guard = stallGuard(signal);
      const parts: Part[] = [];
      const calls: ToolCall[] = [];
      let text = "";
      let finishReason: string | undefined;
      let usage: { inputTokens?: number; outputTokens?: number } | undefined;

      try {
        const response = await getClient().models.generateContentStream({
          model,
          contents: toContents(transcript, `${id}:${model}`),
          config: {
            systemInstruction: system,
            ...(tools.length
              ? {
                  tools: [
                    {
                      functionDeclarations: tools.map((t) => ({
                        name: t.name,
                        description: t.description,
                        parametersJsonSchema: t.parameters,
                      })),
                    },
                  ],
                  ...(toolChoice === "none"
                    ? { toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } } }
                    : {}),
                }
              : {}),
            // Gemini 3 models take a thinking level; aliases (…-latest) keep their defaults.
            ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            abortSignal: guard.signal,
          },
        });
        for await (const chunk of response) {
          guard.gotData();
          const candidate = chunk.candidates?.[0];
          if (candidate?.finishReason) finishReason = candidate.finishReason;
          if (chunk.usageMetadata) {
            usage = {
              inputTokens: chunk.usageMetadata.promptTokenCount,
              outputTokens: chunk.usageMetadata.candidatesTokenCount,
            };
          }
          for (const part of candidate?.content?.parts ?? []) {
            parts.push(part); // keeps thought signatures for the next round
            if (part.thought) continue;
            if (part.text) text += part.text;
            if (part.functionCall) {
              const call = {
                id: part.functionCall.id ?? `call_${crypto.randomUUID().slice(0, 8)}`,
                name: part.functionCall.name ?? "",
                args: (part.functionCall.args ?? {}) as Record<string, unknown>,
              };
              part.functionCall.id = call.id;
              calls.push(call);
            }
          }
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (guard.stalled) throw new ProviderError(`${model} sent nothing in time`, 503);
        const status = (error as { status?: number })?.status ?? 500;
        const message = String((error as { message?: string })?.message ?? error);
        throw new ProviderError(message.slice(0, 300), status, message.includes("PerDay") ? "daily" : "");
      } finally {
        guard.dispose();
      }
      if (finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(finishReason) && calls.length === 0) {
        // MAX_TOKENS, SAFETY, MALFORMED_FUNCTION_CALL…: let another model try.
        throw new ProviderError(`${model} stopped early (${finishReason})`, 502);
      }
      return { text, calls, raw: parts, usage };
    },
  };
}

function toContents(transcript: TranscriptItem[], self: string): Content[] {
  const out: Content[] = [];
  const push = (role: "user" | "model", parts: Part[]) => {
    if (!parts.length) return;
    const last = out[out.length - 1];
    if (last?.role === role) last.parts!.push(...parts);
    else out.push({ role, parts });
  };
  for (const item of transcript) {
    if (item.role === "user") push("user", [{ text: item.text }]);
    else if (item.role === "assistant") {
      if (item.raw && item.rawFor === self) push("model", item.raw as Part[]);
      else
        push("model", [
          ...(item.text.trim() ? [{ text: item.text }] : []),
          ...item.calls.map((c) => ({
            functionCall: { id: c.id, name: c.name, args: c.args },
            thoughtSignature: SKIP_SIGNATURE,
          })),
        ]);
    } else {
      push(
        "user",
        item.results.map((r) => ({
          functionResponse: { id: r.id, name: r.name, response: r.isError ? { error: r.result } : { output: r.result } },
        })),
      );
    }
  }
  return out;
}
