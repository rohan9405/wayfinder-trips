import { AIRPORTS, airportByCode, isHub, type Airport } from "./airports";

/** Departure airport the user picked in an OriginNote; set in the browser, read here. */
export const ORIGIN_COOKIE = "wf_origin";

export type OriginSource = "saved" | "location";

function cookie(req: Request, name: string) {
  const match = req.headers.get("cookie")?.split("; ").find((part) => part.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

const HUB_RADIUS_KM = 400;

function km(lat: number, lon: number, a: Airport) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((a.lat - lat) * rad) / 2) ** 2 +
    Math.cos(lat * rad) * Math.cos(a.lat * rad) * Math.sin(((a.lon - lon) * rad) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/** The big airport people near a point actually fly from: a nearby hub, else the nearest large airport. */
function nearestBigAirport(lat: number, lon: number): Airport | undefined {
  const nearest = (list: Airport[]) =>
    list.reduce<Airport | undefined>((best, a) => (!best || km(lat, lon, a) < km(lat, lon, best) ? a : best), undefined);
  const hub = nearest(AIRPORTS.filter((a) => isHub(a.code)));
  if (hub && km(lat, lon, hub) <= HUB_RADIUS_KM) return hub;
  return nearest(AIRPORTS.filter((a) => a.size === "L"));
}

/**
 * Where to fly from when the user doesn't say: their saved choice, else the nearest large
 * airport to their IP location (Vercel geo headers; absent in local development).
 */
export function homeAirport(req: Request): { airport: Airport; source: OriginSource } | null {
  const saved = airportByCode(cookie(req, ORIGIN_COOKIE));
  if (saved) return { airport: saved, source: "saved" };
  // Local development has no geo headers; DEV_GEO="lat,lon" stands in for them.
  const devGeo = process.env.VERCEL ? undefined : process.env.DEV_GEO?.split(",");
  const latText = req.headers.get("x-vercel-ip-latitude") ?? devGeo?.[0];
  const lat = Number(latText);
  const lon = Number(req.headers.get("x-vercel-ip-longitude") ?? devGeo?.[1]);
  if (!latText || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const airport = nearestBigAirport(lat, lon);
  return airport ? { airport, source: "location" } : null;
}

/**
 * Per-request system prompt context. Only the airport and how it was chosen go to the model
 * (not the user's city), so cached answers stay shareable between users near the same airport.
 */
export function originContext(req: Request): string {
  const home = homeAirport(req);
  if (!home) return "\n\nDEFAULT ORIGIN: unknown. If the user hasn't said where they fly from, ask (see the origin rule).";
  const { airport, source } = home;
  const how = source === "saved" ? "the departure airport the user chose earlier" : "the nearest large airport to the user's location";
  return `\n\nDEFAULT ORIGIN: ${airport.city} (${airport.code}), ${how}. Use it only when the user hasn't named a departure city or airport in this conversation, and then show OriginNote("${airport.code}", "${airport.city}", "${source}").`;
}
