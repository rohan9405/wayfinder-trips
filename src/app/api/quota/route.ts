import { router } from "@/llm.config";

export const runtime = "nodejs";

/** Public, cached estimate of how many AI answers are left today. */
export async function GET() {
  const q = await router.quota();
  return Response.json(q, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
