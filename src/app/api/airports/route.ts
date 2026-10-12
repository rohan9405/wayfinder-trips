import { resolveAirport, suggestAirports } from "@/lib/airports";

/**
 * GET /api/airports?q=Surat&q=London → { "Surat": "STV", "London": "LHR" }.
 * Lets the maps place names the model passed instead of codes. No model call.
 * GET /api/airports?search=mum → [{ code, city, country }] for the departure picker.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const cache = { "Cache-Control": "public, max-age=86400, s-maxage=86400" };
  const search = params.get("search");
  if (search !== null) {
    const exact = resolveAirport(search);
    const list = [...(exact ? [exact] : []), ...suggestAirports(search, 6)]
      .filter((a, i, all) => all.findIndex((b) => b.code === a.code) === i)
      .slice(0, 6)
      .map(({ code, city, country }) => ({ code, city, country }));
    return Response.json(list, { headers: cache });
  }
  const names = params.getAll("q").slice(0, 12);
  const out: Record<string, string | null> = {};
  for (const name of names) out[name] = resolveAirport(name)?.code ?? null;
  return Response.json(out, { headers: cache });
}
