import { timingSafeEqual } from "node:crypto";
import { router } from "@/llm.config";

export const runtime = "nodejs";

/**
 * Router health for maintainers: model order, benched models, today's usage per model and the
 * most recent turns with every attempt. Requires `Authorization: Bearer $ADMIN_TOKEN`.
 *   npm run llm:report
 */
export async function GET(req: Request) {
  const expected = process.env.ADMIN_TOKEN ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok =
    expected.length >= 16 &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });

  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50, 500);
  return Response.json(await router.report(limit));
}
