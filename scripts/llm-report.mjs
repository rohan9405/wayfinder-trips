#!/usr/bin/env node
// Router health report: model order, benched models, today's usage, recent turns.
// Usage: npm run llm:report [-- --url http://localhost:3000] [-- --limit 30] [-- --json]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const base = arg("url", "https://wayfinder-trips.vercel.app");
const res = await fetch(`${base}/api/admin/llm?limit=${arg("limit", "30")}`, {
  headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN ?? env.ADMIN_TOKEN}` },
});
if (!res.ok) {
  console.error(`Report failed: HTTP ${res.status}`);
  process.exit(1);
}
const r = await res.json();
if (args.includes("--json")) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

const now = Date.now();
console.log(`\n== Model order (${r.order.length}) — ✗ = benched`);
for (const m of r.order) {
  const until = r.benched[m];
  console.log(`${until > now ? "✗" : "✓"} ${m}${until > now ? `  (back in ${Math.ceil((until - now) / 60000)} min)` : ""}`);
}
console.log(`\n== Usage on ${r.day} (UTC)`);
console.log("requests  fail  in-tok   out-tok  model");
for (const u of r.usage) {
  console.log(`${String(u.requests).padStart(8)}  ${String(u.failures).padStart(4)}  ${String(u.inputTokens).padStart(7)}  ${String(u.outputTokens).padStart(8)}  ${u.model}`);
}
const turns = r.turns;
const by = (k) => turns.reduce((m, t) => ((m[t[k]] = (m[t[k]] ?? 0) + 1), m), {});
console.log(`\n== Last ${turns.length} turns: outcomes ${JSON.stringify(by("outcome"))}, cache ${JSON.stringify(by("cache"))}`);
for (const t of turns) {
  const when = new Date(t.ts).toISOString().slice(5, 16).replace("T", " ");
  const fails = t.attempts.filter((a) => !a.ok).map((a) => `${a.model.split(":").slice(1).join(":")}→${a.status}`);
  console.log(
    `${when}  ${t.outcome.padEnd(9)} ${String(t.latencyMs).padStart(6)}ms  ${(t.answeredBy ?? "-").padEnd(40)} ${t.question.slice(0, 50)}${fails.length ? `\n${" ".repeat(19)}failed: ${fails.join(", ")}` : ""}`,
  );
}
