/**
 * Wayfinder's LLM setup. Everything model-related is configured here; the reusable machinery
 * lives in src/lib/llm-router. To change which models answer and in what order, edit `order`.
 */
import { createRouter, d1Store, freeTierProviders, memoryStore, type OrderEntry } from "@/lib/llm-router";
import { compactSystemPrompt, systemPrompt } from "@/lib/prompt";
import { runTool, toolDeclarations } from "@/lib/tools";
import { today } from "@/lib/travel-data";

/**
 * Ranked by capability for this app (tool calling + long structured OpenUI output), then by
 * speed and free capacity. Each model is tried in turn until one answers.
 * "compact" = the ~5.5K-token prompt for providers with small token budgets.
 */
const order: OrderEntry[] = [
  {
    provider: "gemini",
    models: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-flash-latest"],
    note: "best quality; ~20 requests/day per model",
  },
  {
    provider: "groq",
    models: ["openai/gpt-oss-120b"],
    prompt: "compact",
    note: "fast; 8K tokens/min, 200K tokens/day",
  },
  { provider: "cloudflare", models: ["@cf/openai/gpt-oss-120b"], prompt: "compact", note: "10K neurons/day shared" },
  { provider: "openrouter", models: "discover", limit: 4, note: "large free models, slower" },
  {
    provider: "cloudflare",
    models: ["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/google/gemma-4-26b-a4b-it", "@cf/zai-org/glm-4.7-flash"],
    prompt: "compact",
    note: "cheaper neurons per request",
  },
  { provider: "groq", models: ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"], prompt: "compact" },
  { provider: "nvidia", models: "discover", limit: 3 },
  {
    provider: "gemini",
    models: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"],
    note: "last resort",
  },
];


const store =
  process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN && process.env.D1_DATABASE_ID
    ? d1Store({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        databaseId: process.env.D1_DATABASE_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
      })
    : memoryStore();

/**
 * Clean up what weaker models add around OpenUI Lang: Markdown code fences and prose before
 * `root = …`. A reply with no `root` is wrapped in a Card so it still renders.
 */
function finalizeOpenUI(text: string) {
  const lines = text.split("\n").filter((l) => !/^\s*```/.test(l));
  const start = lines.findIndex((l) => /^\s*root\s*=/.test(l));
  if (start !== -1) return lines.slice(start).join("\n").trim() + "\n";
  const prose = lines.join("\n").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return prose ? `root = Card([answer])\nanswer = MarkDownRenderer(${JSON.stringify(prose)})\n` : "";
}

export const router = createRouter({
  // Local development logs and caches separately from the live site.
  app: process.env.VERCEL_ENV === "production" ? "wayfinder" : "wayfinder-dev",
  providers: freeTierProviders(),
  order,
  // Rough free-tier capacity per day; drives the "answers left today" counter (estimate only).
  dailyAnswerBudget: Number(process.env.DAILY_ANSWER_BUDGET || 150),
  prompts: { full: systemPrompt, compact: compactSystemPrompt },
  systemSuffix: () => `\n\nToday's date is ${today()}.`,
  tools: {
    declarations: toolDeclarations,
    run: (name, args) => runTool(name, args),
  },
  store,
  // Same question (and same earlier conversation) within the refresh window → served from cache.
  // The whole cache refreshes every CACHE_REFRESH_HOURS (default 24, aligned to UTC midnight).
  cache: {
    refreshEveryMs: Number(process.env.CACHE_REFRESH_HOURS || 24) * 3_600_000,
    shouldCache: (t) => t.filter((x) => x.role === "user").length <= 4,
  },
  finalizeAnswer: finalizeOpenUI,
  // Insights, fares and destination cards must come from this turn's tools, never memory.
  needsTools: (answer) =>
    /\b(TravelInsights|DestinationGrid|PriceCalendar|FlightResults|FlightReview|TripDates|Itinerary|TripBudget)\(/.test(answer),
  // Button clicks arrive wrapped as "]]>openui:content\n…\n]]>openui:context\n…"; log the readable part.
  questionLabel: (text) => text.match(/openui:content\n([\s\S]*?)\n\]\]>openui:context/)?.[1] ?? text,
  formatNotice: (text) => `root = Card([note])\nnote = TextContent(${JSON.stringify(text)})\n`,
  messages: {
    exhausted: "Token limits reached in all models, try again after sometime.",
    gaveUp: "I couldn't put that answer together. Please try asking in a different way.",
  },
});
