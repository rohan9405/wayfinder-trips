import { resolveAirport } from "@/lib/airports";

/**
 * GET /api/airports?q=Surat&q=London → { "Surat": "STV", "London": "LHR" }.
 * Lets the maps place names the model passed instead of codes. No model call.
 */
export async function GET(req: Request) {
  const names = new URL(req.url).searchParams.getAll("q").slice(0, 12);
  const out: Record<string, string | null> = {};
  for (const name of names) out[name] = resolveAirport(name)?.code ?? null;
  return Response.json(out, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
}
