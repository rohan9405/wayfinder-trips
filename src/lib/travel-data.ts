/**
 * Mock travel data. Everything here is deterministic (seeded by the inputs), so the same
 * search always returns the same flights and an offerId can be re-derived and validated
 * later. Swap these functions for a real provider (Duffel, Amadeus, Kiwi) when you're ready;
 * the tool layer in tools.ts only depends on their return shapes.
 */

export type Currency = "USD" | "INR" | "EUR";
export type Cabin = "economy" | "premium_economy" | "business";

const RATES: Record<Currency, number> = { USD: 1, INR: 84, EUR: 0.92 };

import { airportByCode, resolveAirport, suggestAirports, type Airport } from "./airports";
import { describeEvent, eventFareFactor, eventsInMonth, eventsOn } from "./events";

interface Destination {
  airport: string;
  tagline: string;
  interests: string[];
  bestMonths: number[]; // 1-12
  dailyBudgetUsd: number; // rough mid-range daily spend, excluding flights
  climate: Record<"winter" | "spring" | "summer" | "autumn", string>;
}

const DESTINATIONS: Destination[] = [
  { airport: "GOI", tagline: "Beaches, Portuguese quarters and long sunsets", interests: ["beach", "nightlife", "food", "relaxation"], bestMonths: [11, 12, 1, 2, 3], dailyBudgetUsd: 60, climate: { winter: "26–32°C, dry", spring: "28–33°C, humid", summer: "Monsoon rains", autumn: "27–31°C, drying out" } },
  { airport: "IXL", tagline: "High-altitude lakes, monasteries and mountain roads", interests: ["mountains", "adventure", "culture", "road trip"], bestMonths: [6, 7, 8, 9], dailyBudgetUsd: 55, climate: { winter: "Below freezing", spring: "5–15°C", summer: "15–25°C, clear", autumn: "5–18°C" } },
  { airport: "JAI", tagline: "Forts, palaces and bazaars in the Pink City", interests: ["culture", "history", "food", "shopping"], bestMonths: [10, 11, 12, 1, 2, 3], dailyBudgetUsd: 50, climate: { winter: "10–24°C, pleasant", spring: "22–38°C", summer: "35–42°C, very hot", autumn: "20–33°C" } },
  { airport: "COK", tagline: "Backwaters, spice markets and Kerala cuisine", interests: ["nature", "food", "relaxation", "culture"], bestMonths: [10, 11, 12, 1, 2], dailyBudgetUsd: 50, climate: { winter: "23–32°C", spring: "26–33°C, humid", summer: "Heavy monsoon", autumn: "24–30°C" } },
  { airport: "DXB", tagline: "Skyline, desert safaris and big-city shopping", interests: ["shopping", "luxury", "food", "family"], bestMonths: [11, 12, 1, 2, 3], dailyBudgetUsd: 150, climate: { winter: "18–26°C, ideal", spring: "24–35°C", summer: "40°C+, very hot", autumn: "28–38°C" } },
  { airport: "SIN", tagline: "Hawker food, gardens and an easy first trip abroad", interests: ["food", "family", "city", "shopping"], bestMonths: [2, 3, 4, 7, 8], dailyBudgetUsd: 140, climate: { winter: "25–31°C, wetter", spring: "26–32°C", summer: "26–31°C", autumn: "25–31°C, showers" } },
  { airport: "BKK", tagline: "Street food, temples and buzzing night markets", interests: ["food", "nightlife", "culture", "shopping", "budget"], bestMonths: [11, 12, 1, 2], dailyBudgetUsd: 60, climate: { winter: "22–32°C, dry", spring: "27–35°C, hot", summer: "Rainy season", autumn: "25–32°C, rains easing" } },
  { airport: "HKT", tagline: "Island hopping, clear water and beach clubs", interests: ["beach", "nightlife", "relaxation", "adventure"], bestMonths: [11, 12, 1, 2, 3, 4], dailyBudgetUsd: 75, climate: { winter: "24–32°C, dry", spring: "26–34°C", summer: "Monsoon, rough seas", autumn: "25–31°C, wet" } },
  { airport: "DPS", tagline: "Rice terraces, surf beaches and wellness retreats", interests: ["beach", "nature", "relaxation", "culture", "honeymoon"], bestMonths: [5, 6, 7, 8, 9], dailyBudgetUsd: 65, climate: { winter: "Wet season", spring: "26–31°C, drying", summer: "24–30°C, dry", autumn: "25–31°C" } },
  { airport: "MLE", tagline: "Overwater villas and some of the world's clearest water", interests: ["beach", "luxury", "honeymoon", "relaxation"], bestMonths: [12, 1, 2, 3, 4], dailyBudgetUsd: 300, climate: { winter: "27–31°C, dry", spring: "28–32°C", summer: "Southwest monsoon", autumn: "26–30°C" } },
  { airport: "CMB", tagline: "Tea country, wildlife safaris and southern beaches", interests: ["nature", "beach", "culture", "budget"], bestMonths: [12, 1, 2, 3, 4], dailyBudgetUsd: 50, climate: { winter: "24–31°C", spring: "26–32°C", summer: "Southwest monsoon", autumn: "25–30°C" } },
  { airport: "KTM", tagline: "Himalayan treks, temples and old-town squares", interests: ["mountains", "adventure", "culture", "budget"], bestMonths: [3, 4, 10, 11], dailyBudgetUsd: 40, climate: { winter: "2–19°C", spring: "12–28°C, clear", summer: "Monsoon", autumn: "10–25°C, clear" } },
  { airport: "HND", tagline: "Neon cities, shrines, ramen and cherry blossoms", interests: ["culture", "food", "city", "shopping"], bestMonths: [3, 4, 10, 11], dailyBudgetUsd: 160, climate: { winter: "2–12°C", spring: "10–20°C, blossoms", summer: "25–33°C, humid", autumn: "13–23°C, foliage" } },
  { airport: "ICN", tagline: "K-culture, palaces and late-night food streets", interests: ["culture", "food", "city", "shopping"], bestMonths: [4, 5, 9, 10], dailyBudgetUsd: 130, climate: { winter: "-6–4°C", spring: "8–20°C", summer: "24–30°C, monsoon", autumn: "10–22°C" } },
  { airport: "IST", tagline: "Bazaars, Bosphorus views and two continents in one city", interests: ["culture", "history", "food", "city"], bestMonths: [4, 5, 9, 10], dailyBudgetUsd: 90, climate: { winter: "3–10°C", spring: "10–20°C", summer: "22–29°C", autumn: "14–22°C" } },
  { airport: "CDG", tagline: "Museums, cafés and riverside walks", interests: ["culture", "food", "city", "honeymoon"], bestMonths: [4, 5, 6, 9, 10], dailyBudgetUsd: 200, climate: { winter: "3–8°C", spring: "8–19°C", summer: "16–26°C", autumn: "9–19°C" } },
  { airport: "LHR", tagline: "Theatre, history and world-class museums", interests: ["culture", "history", "city", "shopping"], bestMonths: [5, 6, 7, 8, 9], dailyBudgetUsd: 210, climate: { winter: "3–8°C, grey", spring: "6–16°C", summer: "14–23°C", autumn: "8–16°C" } },
  { airport: "FCO", tagline: "Ancient ruins, piazzas and pasta", interests: ["history", "culture", "food", "honeymoon"], bestMonths: [4, 5, 9, 10], dailyBudgetUsd: 170, climate: { winter: "4–13°C", spring: "10–22°C", summer: "20–31°C, hot", autumn: "12–23°C" } },
  { airport: "BCN", tagline: "Gaudí architecture, beaches and late dinners", interests: ["beach", "culture", "food", "nightlife"], bestMonths: [5, 6, 9, 10], dailyBudgetUsd: 160, climate: { winter: "6–14°C", spring: "11–21°C", summer: "20–29°C", autumn: "13–23°C" } },
  { airport: "LIS", tagline: "Hilly streets, tiled facades and Atlantic sunsets", interests: ["culture", "food", "city", "budget"], bestMonths: [4, 5, 6, 9, 10], dailyBudgetUsd: 120, climate: { winter: "9–15°C", spring: "12–22°C", summer: "18–28°C", autumn: "14–23°C" } },
  { airport: "ZRH", tagline: "Alpine lakes, scenic trains and snowy peaks", interests: ["mountains", "nature", "luxury", "adventure"], bestMonths: [6, 7, 8, 12, 1], dailyBudgetUsd: 260, climate: { winter: "-2–4°C, snow in the Alps", spring: "5–16°C", summer: "14–25°C", autumn: "6–15°C" } },
  { airport: "JFK", tagline: "Skyscrapers, Broadway and every cuisine on earth", interests: ["city", "food", "shopping", "culture"], bestMonths: [4, 5, 6, 9, 10, 12], dailyBudgetUsd: 260, climate: { winter: "-3–5°C", spring: "8–20°C", summer: "21–30°C", autumn: "10–21°C" } },
  { airport: "SYD", tagline: "Harbour views, surf beaches and coastal walks", interests: ["beach", "city", "nature", "adventure"], bestMonths: [10, 11, 12, 1, 2, 3], dailyBudgetUsd: 190, climate: { winter: "Mild summer (Dec–Feb), 19–27°C", spring: "Autumn, 14–23°C", summer: "Winter, 8–17°C", autumn: "Spring, 12–23°C" } },
  { airport: "CPT", tagline: "Table Mountain, winelands and dramatic coastline", interests: ["nature", "adventure", "food", "beach"], bestMonths: [11, 12, 1, 2, 3], dailyBudgetUsd: 110, climate: { winter: "Summer, 16–27°C", spring: "Autumn, 12–23°C", summer: "Winter, 8–18°C, wet", autumn: "Spring, 11–21°C" } },
];

const AIRLINE_CODES: Record<string, string> = {
  IndiGo: "6E", "Air India": "AI", "Akasa Air": "QP", "Air India Express": "IX",
  "Singapore Airlines": "SQ", "Thai Airways": "TG", AirAsia: "AK", Emirates: "EK",
  Lufthansa: "LH", "Air France": "AF", "British Airways": "BA", "Turkish Airlines": "TK",
  "Qatar Airways": "QR", United: "UA", Etihad: "EY",
};

const AIRLINES_BY_REGION: Record<string, string[]> = {
  India: ["IndiGo", "Air India", "Akasa Air", "Air India Express"],
  Asia: ["Singapore Airlines", "Thai Airways", "AirAsia", "Emirates", "Air India", "IndiGo"],
  Europe: ["Lufthansa", "Air France", "British Airways", "Turkish Airlines", "Emirates", "Qatar Airways"],
  Long: ["Emirates", "Qatar Airways", "Air India", "United", "Etihad", "Turkish Airlines"],
};

// ── Deterministic randomness ─────────────────────────────────────────────

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function distanceKm(a: Airport, b: Airport): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function convert(usd: number, currency: Currency): number {
  const value = usd * RATES[currency];
  return currency === "INR" ? Math.round(value / 50) * 50 : Math.round(value);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function addDays(date: string, days: number): string {
  return new Date(parseDate(date).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

// Northern-hemisphere season names; climate strings for southern places already describe
// the local season under these keys.
function season(month: number): keyof Destination["climate"] {
  const seasons = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"] as const;
  return seasons[month - 1];
}

/** One-way economy fare in USD for one adult, before day-of-week and season effects. */
function baseFareUsd(origin: Airport, dest: Airport): number {
  const km = distanceKm(origin, dest);
  const sameCountry = origin.country === dest.country;
  return Math.round((sameCountry ? 35 : 70) + km * (sameCountry ? 0.055 : 0.065));
}

function dailyFareUsd(origin: Airport, dest: Airport, date: string): number {
  const rand = seeded(`${origin.code}-${dest.code}-${date}`);
  const d = parseDate(date);
  const month = d.getUTCMonth() + 1;
  const weekday = d.getUTCDay();
  const destination = DESTINATIONS.find((x) => x.airport === dest.code);
  const peak = destination?.bestMonths.includes(month) ? 1.18 : 0.95;
  const weekdayFactor = [1.12, 0.97, 0.88, 0.9, 1.0, 1.15, 1.05][weekday];
  const daysOut = (d.getTime() - parseDate(today()).getTime()) / 86_400_000;
  const leadTime = daysOut < 7 ? 1.45 : daysOut < 21 ? 1.15 : 1.0;
  const noise = 0.85 + rand() * 0.35;
  const events = eventFareFactor(dest.code, date, touchesIndia(origin, dest));
  return baseFareUsd(origin, dest) * peak * weekdayFactor * leadTime * events * noise;
}

function touchesIndia(origin: Airport, dest: Airport) {
  return origin.country === "India" || dest.country === "India";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(date: string) {
  return parseDate(date).getUTCDay();
}

/** Pricing and event insights for a route and month, computed from the fare data. */
function monthInsights(origin: Airport, dest: Airport, month: string, days: { date: string; price: number | null }[]) {
  const priced = days.filter((d): d is { date: string; price: number } => d.price !== null);
  const byWeekday = WEEKDAYS.map((name, i) => {
    const prices = priced.filter((d) => weekdayOf(d.date) === i).map((d) => d.price);
    return { name, avg: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : NaN };
  }).filter((w) => !Number.isNaN(w.avg));
  const cheapestDay = byWeekday.reduce((a, b) => (b.avg < a.avg ? b : a));
  const dearestDay = byWeekday.reduce((a, b) => (b.avg > a.avg ? b : a));
  const events = eventsInMonth(dest.code, month, touchesIndia(origin, dest)).map(describeEvent);
  const daysOutToFirst = (parseDate(priced[0]?.date ?? `${month}-01`).getTime() - parseDate(today()).getTime()) / 86_400_000;
  return {
    cheapestWeekday: cheapestDay.name,
    priciestWeekday: dearestDay.name,
    weekdaySaving: `${Math.round((1 - cheapestDay.avg / dearestDay.avg) * 100)}% cheaper on ${cheapestDay.name}s than ${dearestDay.name}s on average`,
    events,
    bookingTip:
      daysOutToFirst < 21
        ? "Fares within 3 weeks of departure run 15-45% higher; book now if dates are fixed."
        : "Prices usually rise inside 3 weeks of departure; booking 3-8 weeks ahead is the sweet spot.",
  };
}

function region(origin: Airport, dest: Airport): keyof typeof AIRLINES_BY_REGION {
  if (origin.country === dest.country && origin.country === "India") return "India";
  const km = distanceKm(origin, dest);
  if (km > 6500) return "Long";
  return ["France", "United Kingdom", "Italy", "Spain", "Portugal", "Netherlands", "Switzerland", "Türkiye"].includes(dest.country)
    ? "Europe"
    : "Asia";
}

// ── Public API used by the tools ─────────────────────────────────────────

export class TravelDataError extends Error {}

/** Resolve a city, airport name or IATA code; unknown places get suggestions, not a dead end. */
function requireAirport(input: string, label: string): Airport {
  const airport = resolveAirport(input);
  if (!airport) {
    const close = suggestAirports(input).map((a) => `${a.city} (${a.code})`);
    throw new TravelDataError(
      `No airport found for ${label} "${input}".${close.length ? ` Did you mean: ${close.join(", ")}?` : " Try the nearest city with an airport."}`,
    );
  }
  return airport;
}

function requireFutureDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parseDate(date).getTime())) {
    throw new TravelDataError(`Invalid date "${date}". Use YYYY-MM-DD.`);
  }
  if (date < today()) throw new TravelDataError(`${date} is in the past. Today is ${today()}.`);
}

// Regions (ISO country codes) for "flights to Europe"-style requests.
const REGIONS: Record<string, string[]> = {
  europe: ["FR", "GB", "IT", "ES", "PT", "NL", "CH", "DE", "TR", "GR", "AT", "CZ", "IE", "BE", "DK", "SE", "NO", "FI", "PL", "HU"],
  southeast_asia: ["TH", "SG", "ID", "MY", "VN", "PH", "KH", "LA", "MM"],
  east_asia: ["JP", "KR", "CN", "HK", "TW", "MO"],
  south_asia: ["IN", "LK", "NP", "MV", "BT", "BD"],
  middle_east: ["AE", "QA", "OM", "SA", "JO", "BH", "KW"],
  americas: ["US", "CA", "MX", "BR", "AR", "PE", "CO"],
  oceania: ["AU", "NZ", "FJ"],
  africa: ["ZA", "KE", "EG", "MA", "MU", "TZ", "SC"],
};
export const REGION_NAMES = Object.keys(REGIONS);

export function suggestDestinations(input: {
  origin: string;
  month?: number;
  interests?: string[];
  region?: string;
  maxFlightPrice?: number;
  currency: Currency;
  limit?: number;
}) {
  const origin = requireAirport(input.origin, "origin");
  const month = input.month;
  const interests = (input.interests ?? []).map((i) => i.toLowerCase());
  const travelDate = month ? nextDateInMonth(month) : addDays(today(), 30);

  const regionCountries = input.region ? REGIONS[input.region] : undefined;
  if (input.region && !regionCountries) {
    throw new TravelDataError(`Unknown region "${input.region}". Use one of: ${REGION_NAMES.join(", ")}.`);
  }

  const scored = DESTINATIONS.filter(
    (d) => d.airport !== origin.code && (!regionCountries || regionCountries.includes(airportByCode(d.airport)!.countryCode)),
  ).map((d) => {
    const airport = airportByCode(d.airport)!;
    const fare = convert(dailyFareUsd(origin, airport, travelDate), input.currency);
    const interestMatches = interests.filter((i) => d.interests.some((x) => x.includes(i) || i.includes(x)));
    const inSeason = month ? d.bestMonths.includes(month) : true;
    const score = interestMatches.length * 3 + (inSeason ? 2 : 0) - fare / convert(1000, input.currency);
    return {
      code: d.airport,
      city: airport.city,
      country: airport.country,
      tagline: d.tagline,
      interests: d.interests,
      bestMonths: d.bestMonths.map(monthName),
      inSeason,
      weather: month ? d.climate[season(month)] : undefined,
      flightHours: Math.round((distanceKm(origin, airport) / 780 + 0.6) * 10) / 10,
      fromPrice: fare,
      dailyBudget: convert(d.dailyBudgetUsd, input.currency),
      eventsInMonth: month
        ? eventsInMonth(airport.code, travelDate.slice(0, 7), true).map((e) => `${e.name} (${e.dates}, ${describeEvent(e).effect})`)
        : [],
      score,
    };
  });

  const results = scored
    .filter((d) => (input.maxFlightPrice ? d.fromPrice <= input.maxFlightPrice : true))
    .sort((a, b) => b.score - a.score)
    // A region request is a choice of entry point, so show every gateway we know there.
    .slice(0, input.limit ?? (regionCountries ? 8 : 6))
    .map(({ score: _score, ...rest }) => rest);

  return {
    origin: `${origin.city} (${origin.code})`,
    region: input.region ?? "any",
    month: month ? monthName(month) : "any",
    currency: input.currency,
    note: "fromPrice is an indicative one-way economy fare for one adult; dailyBudget is a rough mid-range spend per person per day.",
    destinations: results,
  };
}

function monthName(month: number): string {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function nextDateInMonth(month: number): string {
  const now = parseDate(today());
  let year = now.getUTCFullYear();
  if (month < now.getUTCMonth() + 1) year += 1;
  const candidate = `${year}-${String(month).padStart(2, "0")}-15`;
  return candidate < today() ? addDays(today(), 14) : candidate;
}

export function priceCalendar(input: {
  origin: string;
  destination: string;
  month: string; // YYYY-MM
  currency: Currency;
}) {
  const origin = requireAirport(input.origin, "origin");
  const dest = requireAirport(input.destination, "destination");
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new TravelDataError(`Invalid month "${input.month}". Use YYYY-MM.`);
  const [year, month] = input.month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = today();

  const days: { date: string; price: number | null }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${input.month}-${String(day).padStart(2, "0")}`;
    days.push({
      date,
      price: date < start ? null : convert(dailyFareUsd(origin, dest, date), input.currency),
    });
  }
  const priced = days.filter((d): d is { date: string; price: number } => d.price !== null);
  if (priced.length === 0) throw new TravelDataError(`${input.month} is entirely in the past.`);
  const cheapest = priced.reduce((a, b) => (b.price < a.price ? b : a));
  const average = Math.round(priced.reduce((s, d) => s + d.price, 0) / priced.length);

  return {
    origin: origin.code,
    originCity: origin.city,
    destination: dest.code,
    destinationCity: dest.city,
    month: input.month,
    currency: input.currency,
    cheapestDate: cheapest.date,
    cheapestPrice: cheapest.price,
    averagePrice: average,
    insights: monthInsights(origin, dest, input.month, days),
    days,
  };
}

/** The hand-written guide for a destination, if there is one (popular destinations only). */
function guideFor(code: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.airport === code);
}

/** Rough mid-range daily spend when there's no guide: cheaper in India and South/South-East Asia. */
function defaultDailyUsd(a: Airport) {
  if (a.countryCode === "IN") return 45;
  if (["NP", "LK", "BD", "VN", "KH", "LA", "ID", "PH", "MM", "PK"].includes(a.countryCode)) return 55;
  if (["TH", "MY", "TR", "EG", "MA", "GE", "AZ", "UZ", "KE"].includes(a.countryCode)) return 80;
  return 150;
}

function parseMonth(month: string): { year: number; month: number } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new TravelDataError(`Invalid month "${month}". Use YYYY-MM.`);
  const [year, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) throw new TravelDataError(`Invalid month "${month}".`);
  return { year, month: m };
}

export function destinationInfo(input: { code: string; month?: string; origin?: string; currency: Currency }) {
  const airport = requireAirport(input.code, "destination");
  const destination = guideFor(airport.code);
  const month = input.month ? parseMonth(input.month).month : undefined;
  const origin = input.origin ? requireAirport(input.origin, "origin") : undefined;
  return {
    code: airport.code,
    city: airport.city,
    country: airport.country,
    airport: airport.name,
    hasGuide: Boolean(destination),
    tagline: destination?.tagline,
    interests: destination?.interests,
    bestMonths: destination?.bestMonths.map(monthName),
    inSeason: month && destination ? destination.bestMonths.includes(month) : undefined,
    weather: destination ? (month ? destination.climate[season(month)] : destination.climate) : undefined,
    dailyBudgetMidRange: convert(destination?.dailyBudgetUsd ?? defaultDailyUsd(airport), input.currency),
    events: input.month
      ? eventsInMonth(airport.code, input.month, airport.country === "India" || origin?.country === "India").map(describeEvent)
      : [],
    flightHoursFromOrigin: origin
      ? Math.round((distanceKm(origin, airport) / 780 + 0.6) * 10) / 10
      : undefined,
    currency: input.currency,
  };
}

const STYLE_FACTOR = { budget: 0.6, mid: 1, luxury: 2.6 } as const;
export type TravelStyle = keyof typeof STYLE_FACTOR;

/**
 * Rough trip cost: return flights (the month's average fare each way) plus daily costs
 * split into stay, food, local transport and activities.
 */
export function estimateTripBudget(input: {
  origin: string;
  destination: string;
  month: string;
  nights: number;
  travellers: number;
  style: TravelStyle;
  currency: Currency;
}) {
  const origin = requireAirport(input.origin, "origin");
  const dest = requireAirport(input.destination, "destination");
  const destination = guideFor(dest.code);
  if (input.nights < 1 || input.nights > 60) throw new TravelDataError("Nights must be between 1 and 60.");
  if (input.travellers < 1 || input.travellers > 9) throw new TravelDataError("Travellers must be between 1 and 9.");
  parseMonth(input.month);

  const outbound = priceCalendar({ origin: origin.code, destination: dest.code, month: input.month, currency: input.currency });
  const inbound = priceCalendar({ origin: dest.code, destination: origin.code, month: input.month, currency: input.currency });
  const flights = (outbound.averagePrice + inbound.averagePrice) * input.travellers;

  const dailyUsd = (destination?.dailyBudgetUsd ?? defaultDailyUsd(dest)) * STYLE_FACTOR[input.style];
  const rooms = Math.ceil(input.travellers / 2);
  const stay = convert(dailyUsd * 0.45 * rooms * input.nights, input.currency);
  const food = convert(dailyUsd * 0.25 * input.travellers * (input.nights + 1), input.currency);
  const transport = convert(dailyUsd * 0.1 * input.travellers * (input.nights + 1), input.currency);
  const activities = convert(dailyUsd * 0.2 * input.travellers * input.nights, input.currency);
  const total = flights + stay + food + transport + activities;

  return {
    route: `${origin.city} (${origin.code}) ⇄ ${dest.city} (${dest.code})`,
    month: input.month,
    nights: input.nights,
    travellers: input.travellers,
    style: input.style,
    currency: input.currency,
    breakdown: [
      { category: "Flights (return)", amount: flights },
      { category: "Stay", amount: stay },
      { category: "Food", amount: food },
      { category: "Local transport", amount: transport },
      { category: "Activities", amount: activities },
    ],
    total,
    perPerson: Math.round(total / input.travellers),
    cheapestOutboundDate: outbound.cheapestDate,
    note: "Estimate only. Flights use the month's average one-way fare in each direction; stay assumes 2 people per room.",
  };
}

const CABIN_FACTOR: Record<Cabin, number> = { economy: 1, premium_economy: 1.7, business: 3.6 };

interface FlightSearch {
  origin: string;
  destination: string;
  date: string;
  adults: number;
  cabin: Cabin;
  currency: Currency;
}

function buildOffers(search: FlightSearch) {
  const origin = requireAirport(search.origin, "origin");
  const dest = requireAirport(search.destination, "destination");
  if (origin.code === dest.code) throw new TravelDataError("Origin and destination are the same.");
  requireFutureDate(search.date);
  if (search.adults < 1 || search.adults > 9) throw new TravelDataError("Adults must be between 1 and 9.");

  const rand = seeded(`offers-${origin.code}-${dest.code}-${search.date}`);
  const km = distanceKm(origin, dest);
  const airlines = AIRLINES_BY_REGION[region(origin, dest)];
  const baseUsd = dailyFareUsd(origin, dest, search.date);
  const directMinutes = Math.round((km / 780) * 60 + 35);
  const count = 5 + Math.floor(rand() * 3);

  const offers = Array.from({ length: count }, (_, i) => {
    // Smaller airports have fewer non-stop routes, especially long-haul.
    const sizeFactor = (a: Airport) => (a.size === "L" ? 1 : a.size === "M" ? 0.55 : 0.25);
    const nonstopChance =
      (km < 2500 ? 0.8 : km < 6000 ? 0.5 : 0.3) * Math.min(sizeFactor(origin), sizeFactor(dest));
    const stops = rand() < nonstopChance ? 0 : 1;
    const layover = stops ? 70 + Math.floor(rand() * 240) : 0;
    const duration = directMinutes + layover + Math.floor(rand() * 25);
    const rawDepart = 5 * 60 + Math.floor(rand() * 17 * 60);
    const departMinutes = rawDepart - (rawDepart % 5);
    const arriveTotal = departMinutes + duration; // local-time effects ignored in this mock
    const airline = airlines[Math.floor(rand() * airlines.length)];
    const perAdultUsd = baseUsd * CABIN_FACTOR[search.cabin] * (stops ? 0.86 : 1.06) * (0.9 + rand() * 0.3);
    const total = convert(perAdultUsd * search.adults, search.currency);
    const prefix = AIRLINE_CODES[airline];
    return {
      offerId: `OF-${origin.code}${dest.code}-${search.date.replaceAll("-", "")}-${search.cabin[0].toUpperCase()}${search.adults}${search.currency}-${i}`,
      airline,
      flightNumber: `${prefix} ${100 + Math.floor(rand() * 899)}`,
      origin: origin.code,
      destination: dest.code,
      date: search.date,
      departTime: clock(departMinutes),
      arriveTime: clock(arriveTotal) + (arriveTotal >= 24 * 60 ? " +1" : ""),
      durationMinutes: duration,
      stops,
      layoverCity: stops ? pickLayover(origin, dest, rand) : null,
      layoverMinutes: layover,
      cabin: search.cabin,
      adults: search.adults,
      totalPrice: total,
      currency: search.currency,
      seatsLeft: 1 + Math.floor(rand() * 9),
      refundable: rand() < 0.3,
      baggage: search.cabin === "economy" ? (rand() < 0.6 ? "15 kg checked" : "Cabin bag only") : "2 × 23 kg checked",
    };
  });
  return { origin, dest, offers: offers.sort((a, b) => a.totalPrice - b.totalPrice) };
}

function clock(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function pickLayover(origin: Airport, dest: Airport, rand: () => number): string {
  const hubs = ["DXB", "DOH", "IST", "SIN", "DEL", "BOM", "FRA"].filter((h) => h !== origin.code && h !== dest.code);
  return hubs[Math.floor(rand() * hubs.length)];
}

export function searchFlights(search: FlightSearch & { maxStops?: number }) {
  const { origin, dest, offers: all } = buildOffers(search);
  const offers = all.filter((o) => search.maxStops === undefined || o.stops <= search.maxStops);
  // Compare with nearby days (one-way, one adult, economy) to suggest a cheaper date.
  const nearby = [-3, -2, -1, 1, 2, 3]
    .map((delta) => addDays(search.date, delta))
    .filter((d) => d >= today())
    .map((d) => ({ date: d, fare: dailyFareUsd(origin, dest, d) }));
  const thisDay = dailyFareUsd(origin, dest, search.date);
  const best = nearby.reduce((a, b) => (b.fare < a.fare ? b : a), { date: search.date, fare: thisDay });
  const events = eventsOn(dest.code, search.date, touchesIndia(origin, dest)).map(describeEvent);
  const insights = {
    dayOfWeek: WEEKDAYS[weekdayOf(search.date)],
    cheaperNearbyDate:
      best.date !== search.date && best.fare < thisDay * 0.95
        ? { date: best.date, saving: `about ${Math.round((1 - best.fare / thisDay) * 100)}% cheaper` }
        : null,
    events,
    flightShape: flightShape(offers),
  };
  return {
    insights,
    route: `${origin.city} (${origin.code}) → ${dest.city} (${dest.code})`,
    date: search.date,
    adults: search.adults,
    cabin: search.cabin,
    currency: search.currency,
    note:
      offers.length < all.length
        ? `${all.length - offers.length} flights with more than ${search.maxStops} stop(s) hidden. totalPrice covers all adults, taxes included.`
        : "totalPrice covers all adults, taxes included. Times are local.",
    offers,
  };
}

/** What matters when choosing between these flights: non-stop vs connecting trade-offs. */
function flightShape(offers: { stops: number; totalPrice: number; durationMinutes: number; layoverMinutes: number; layoverCity: string | null; departTime: string }[]) {
  if (!offers.length) return null;
  const nonstop = offers.filter((o) => o.stops === 0);
  const connecting = offers.filter((o) => o.stops > 0);
  const cheapest = (list: typeof offers) => (list.length ? Math.min(...list.map((o) => o.totalPrice)) : null);
  const fastest = offers.reduce((a, b) => (b.durationMinutes < a.durationMinutes ? b : a));
  const layovers = connecting.map((o) => o.layoverMinutes);
  return {
    nonstopCount: nonstop.length,
    connectingCount: connecting.length,
    cheapestNonstop: cheapest(nonstop),
    cheapestConnecting: cheapest(connecting),
    fastestMinutes: fastest.durationMinutes,
    layoverRangeMinutes: layovers.length ? [Math.min(...layovers), Math.max(...layovers)] : null,
    layoverCities: [...new Set(connecting.map((o) => o.layoverCity).filter(Boolean))],
    departureTimes: offers.map((o) => o.departTime),
    decisionAxis:
      nonstop.length === 0
        ? "All flights connect: compare layover length, layover city, departure/arrival times and total duration."
        : connecting.length === 0
          ? "All flights are non-stop: compare departure/arrival times and price."
          : "Mix of non-stop and connecting: weigh the non-stop premium against the time a connection adds.",
  };
}

// ── Multi-leg trips: round trip, open-jaw, multi-city ──────────────────────

type Offer = ReturnType<typeof buildOffers>["offers"][number];

export interface Leg {
  origin: string;
  destination: string;
  date: string;
}

/** Name the trip shape from its legs. */
function tripType(legs: { origin: Airport; dest: Airport }[]) {
  if (legs.length === 1) return "one-way";
  if (legs.length === 2) {
    const [a, b] = legs;
    if (a.origin.code === b.dest.code && a.dest.code === b.origin.code) return "round trip";
    if (a.origin.code === b.dest.code || a.dest.code === b.origin.code) return "open-jaw";
  }
  return "multi-city";
}

const compactOffer = (o: Offer) => ({
  offerId: o.offerId,
  airline: o.airline,
  depart: o.departTime,
  arrive: o.arriveTime,
  stops: o.stops,
  via: o.layoverCity,
  durationMinutes: o.durationMinutes,
  totalPrice: o.totalPrice,
});

/** Search every leg of a trip (2-6 legs; dates must be in order). */
export function searchItinerary(input: {
  legs: Leg[];
  adults: number;
  cabin: Cabin;
  currency: Currency;
  maxStops?: number;
}) {
  if (input.legs.length < 1 || input.legs.length > 6) throw new TravelDataError("A trip has 1 to 6 legs.");
  const resolved = input.legs.map((l, i) => {
    if (i > 0 && l.date < input.legs[i - 1].date) {
      throw new TravelDataError(`Leg ${i + 1} (${l.date}) is before leg ${i} (${input.legs[i - 1].date}).`);
    }
    const { origin, dest, offers } = buildOffers({ origin: l.origin, destination: l.destination, date: l.date, adults: input.adults, cabin: input.cabin, currency: input.currency });
    const fitting = offers.filter((o) => input.maxStops === undefined || o.stops <= input.maxStops);
    return { origin, dest, date: l.date, offers: fitting };
  });
  const legs = resolved.map((l, i) => ({
    leg: i + 1,
    route: `${l.origin.city} (${l.origin.code}) → ${l.dest.city} (${l.dest.code})`,
    origin: l.origin.code,
    destination: l.dest.code,
    date: l.date,
    options: l.offers.length,
    cheapest: l.offers.slice(0, 3).map(compactOffer),
    events: eventsOn(l.dest.code, l.date, touchesIndia(l.origin, l.dest)).map((e) => describeEvent(e).name),
  }));
  const missing = legs.filter((l) => l.options === 0).map((l) => `leg ${l.leg}`);
  return {
    tripType: tripType(resolved),
    adults: input.adults,
    cabin: input.cabin,
    currency: input.currency,
    maxStops: input.maxStops ?? null,
    cheapestTotal: missing.length ? null : resolved.reduce((sum, l) => sum + l.offers[0].totalPrice, 0),
    note: missing.length
      ? `No flights within the stop limit on ${missing.join(", ")}; try other dates or allow more stops.`
      : "cheapestTotal adds the cheapest option on each leg for all adults.",
    legs,
  };
}

/**
 * Cheapest outbound/return date pairs for a stay of minNights–maxNights departing in a month.
 * The return can be from/to different airports (open-jaw): returnFrom defaults to the
 * destination, returnTo to the origin.
 */
export function findCheapestDates(input: {
  origin: string;
  destination: string;
  month: string;
  minNights: number;
  maxNights: number;
  returnFrom?: string;
  returnTo?: string;
  maxStops?: number;
  adults: number;
  cabin: Cabin;
  currency: Currency;
}) {
  parseMonth(input.month);
  const origin = requireAirport(input.origin, "origin");
  const dest = requireAirport(input.destination, "destination");
  const backFrom = input.returnFrom ? requireAirport(input.returnFrom, "return-from") : dest;
  const backTo = input.returnTo ? requireAirport(input.returnTo, "return-to") : origin;
  if (input.minNights < 1 || input.maxNights > 30 || input.minNights > input.maxNights) {
    throw new TravelDataError("Nights must be a range between 1 and 30.");
  }

  const cache = new Map<string, Offer | null>();
  const cheapest = (from: Airport, to: Airport, date: string) => {
    const key = `${from.code}-${to.code}-${date}`;
    if (!cache.has(key)) {
      const { offers } = buildOffers({ origin: from.code, destination: to.code, date, adults: input.adults, cabin: input.cabin, currency: input.currency });
      cache.set(key, offers.find((o) => input.maxStops === undefined || o.stops <= input.maxStops) ?? null);
    }
    return cache.get(key)!;
  };

  const [y, m] = input.month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const options: { depart: string; return: string; nights: number; total: number; outbound: Offer; inbound: Offer }[] = [];
  for (let d = 1; d <= days; d++) {
    const depart = `${input.month}-${String(d).padStart(2, "0")}`;
    if (depart < today()) continue;
    const out = cheapest(origin, dest, depart);
    if (!out) continue;
    for (let n = input.minNights; n <= input.maxNights; n++) {
      const back = addDays(depart, n);
      const ret = cheapest(backFrom, backTo, back);
      if (ret) options.push({ depart, return: back, nights: n, total: out.totalPrice + ret.totalPrice, outbound: out, inbound: ret });
    }
  }
  if (!options.length) {
    throw new TravelDataError("No date pairs fit those limits; allow more stops or widen the stay.");
  }
  options.sort((a, b) => a.total - b.total);
  const top = options.slice(0, 6);
  const average = Math.round(options.reduce((s, o) => s + o.total, 0) / options.length);
  return {
    tripType: backFrom.code === dest.code && backTo.code === origin.code ? "round trip" : "open-jaw",
    outbound: `${origin.city} (${origin.code}) → ${dest.city} (${dest.code})`,
    inbound: `${backFrom.city} (${backFrom.code}) → ${backTo.city} (${backTo.code})`,
    month: input.month,
    nights: `${input.minNights}-${input.maxNights}`,
    adults: input.adults,
    currency: input.currency,
    pairsChecked: options.length,
    averageTotal: average,
    best: top.map((o) => ({
      depart: o.depart,
      return: o.return,
      nights: o.nights,
      total: o.total,
      savingVsAverage: `${Math.round((1 - o.total / average) * 100)}%`,
      outbound: compactOffer(o.outbound),
      inbound: compactOffer(o.inbound),
    })),
    events: eventsInMonth(dest.code, input.month, touchesIndia(origin, dest)).map(describeEvent),
  };
}

/** Re-derive an offer from its id so the price can't be tampered with on the way to checkout. */
export function getOffer(offerId: string) {
  const m = /^OF-([A-Z]{3})([A-Z]{3})-(\d{8})-([EPB])(\d)(USD|INR|EUR)-(\d+)$/.exec(offerId);
  if (!m) throw new TravelDataError(`Unknown offer "${offerId}".`);
  const [, o, d, ymd, cabinCode, adults, currency, index] = m;
  const cabin: Cabin = cabinCode === "E" ? "economy" : cabinCode === "P" ? "premium_economy" : "business";
  const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  const { offers } = buildOffers({ origin: o, destination: d, date, adults: Number(adults), cabin, currency: currency as Currency });
  const offer = offers.find((x) => x.offerId === offerId);
  if (!offer) throw new TravelDataError(`Offer "${offerId}" is no longer available (index ${index}).`);
  return offer;
}
