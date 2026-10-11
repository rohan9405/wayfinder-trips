/**
 * Every airport with scheduled service and an IATA code (~4,000, from OurAirports; see
 * src/data/README.md), plus name resolution: "Surat", "surat", "STV" and "Heathrow" all map to
 * an airport in code, so the model can pass whatever the user said without an extra lookup call.
 * Server-side: the browser uses the light coordinates file via airport-coords.ts.
 */
import raw from "@/data/airports.json";

export interface Airport {
  code: string;
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  size: "L" | "M" | "S";
  name: string;
}

type Row = [string, string, string, number, number, "L" | "M" | "S", string];

// Friendlier city names than the dataset's municipalities ("Kuta, Badung" → "Bali").
const CITY_OVERRIDES: Record<string, string> = {
  DEL: "Delhi",
  GOI: "Goa",
  DPS: "Bali",
  HKT: "Phuket",
  KTM: "Kathmandu",
  ICN: "Seoul",
  IST: "Istanbul",
  CDG: "Paris",
  FCO: "Rome",
  ZRH: "Zurich",
  SFO: "San Francisco",
  CPT: "Cape Town",
  SYD: "Sydney",
  DXB: "Dubai",
  SIN: "Singapore",
  BKK: "Bangkok",
  CMB: "Colombo",
  AMS: "Amsterdam",
  LIS: "Lisbon",
  BCN: "Barcelona",
  COK: "Kochi",
};

// Common names that don't match the dataset's city field.
const ALIASES: Record<string, string> = {
  bombay: "BOM",
  bangalore: "BLR",
  madras: "MAA",
  calcutta: "CCU",
  gurgaon: "DEL",
  gurugram: "DEL",
  noida: "DEL",
  "new delhi": "DEL",
  cochin: "COK",
  trivandrum: "TRV",
  poona: "PNQ",
  bali: "DPS",
  denpasar: "DPS",
  maldives: "MLE",
  male: "MLE",
  "sri lanka": "CMB",
  nepal: "KTM",
  tokyo: "HND",
  seoul: "ICN",
  "new york": "JFK",
  nyc: "JFK",
  london: "LHR",
  paris: "CDG",
  rome: "FCO",
  milan: "MXP",
  dubai: "DXB",
  "abu dhabi": "AUH",
  bangkok: "BKK",
  "kuala lumpur": "KUL",
  "hong kong": "HKG",
  sydney: "SYD",
  melbourne: "MEL",
  toronto: "YYZ",
  "los angeles": "LAX",
  "san francisco": "SFO",
  chicago: "ORD",
  washington: "IAD",
  istanbul: "IST",
  moscow: "SVO",
  beijing: "PEK",
  shanghai: "PVG",
  singapore: "SIN",
  phuket: "HKT",
  goa: "GOI",
  ladakh: "IXL",
  leh: "IXL",
  zurich: "ZRH",
  barcelona: "BCN",
  lisbon: "LIS",
  amsterdam: "AMS",
  "cape town": "CPT",
};

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (iso: string) => {
  try {
    return countryNames.of(iso) ?? iso;
  } catch {
    return iso;
  }
};

export const AIRPORTS: Airport[] = (raw as Row[]).map(([code, city, iso, lat, lon, size, name]) => ({
  code,
  city: CITY_OVERRIDES[code] ?? city,
  country: countryName(iso),
  countryCode: iso,
  lat,
  lon,
  size,
  name,
}));

const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));
const SIZE_RANK = { L: 0, M: 1, S: 2 } as const;
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(airport|international|intl|city)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Exact IATA lookup. */
export function airportByCode(code: string | null | undefined): Airport | undefined {
  return code ? BY_CODE.get(code.trim().toUpperCase()) : undefined;
}

/**
 * Resolve what a user or model wrote ("STV", "Surat", "london heathrow", "Bombay") to an airport.
 * Prefers exact codes, then aliases, then city and name matches (bigger airports first).
 */
export function resolveAirport(input: string | null | undefined): Airport | undefined {
  if (!input) return undefined;
  const text = input.trim();
  // "Surat (STV)" or a bare code.
  const code = text.match(/\(([A-Za-z]{3})\)\s*$/)?.[1] ?? (/^[A-Za-z]{3}$/.test(text) ? text : null);
  if (code) {
    const hit = airportByCode(code);
    if (hit) return hit;
  }
  const q = norm(text.replace(/\([^)]*\)/g, ""));
  if (!q) return undefined;
  if (ALIASES[q]) return airportByCode(ALIASES[q]);

  const rank = (a: Airport) => SIZE_RANK[a.size];
  const pick = (list: Airport[]) => list.sort((a, b) => rank(a) - rank(b))[0];
  const byCity = AIRPORTS.filter((a) => norm(a.city) === q);
  if (byCity.length) return pick(byCity);
  const byName = AIRPORTS.filter((a) => norm(a.name).includes(q));
  if (byName.length) return pick(byName);
  const byPrefix = AIRPORTS.filter((a) => norm(a.city).startsWith(q));
  if (byPrefix.length) return pick(byPrefix);
  return undefined;
}

/** Up to `n` larger airports near a point (for "no airport there; nearest are…"). */
export function nearestAirports(lat: number, lon: number, n = 3): Airport[] {
  const d = (a: Airport) => (a.lat - lat) ** 2 + ((a.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
  return AIRPORTS.filter((a) => a.size !== "S")
    .sort((a, b) => d(a) - d(b))
    .slice(0, n);
}

/** Suggestions when a name can't be resolved: partial matches on city or name. */
export function suggestAirports(input: string, n = 4): Airport[] {
  const q = norm(input);
  if (!q) return [];
  const words = q.split(" ").filter((w) => w.length >= 3);
  return AIRPORTS.filter((a) => words.some((w) => norm(a.city).includes(w) || norm(a.name).includes(w)))
    .sort((a, b) => SIZE_RANK[a.size] - SIZE_RANK[b.size])
    .slice(0, n);
}
