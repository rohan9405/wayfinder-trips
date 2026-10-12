import { z } from "zod";
import {
  type Currency,
  destinationInfo,
  estimateTripBudget,
  findCheapestDates,
  getOffer,
  priceCalendar,
  REGION_NAMES,
  searchFlights,
  searchItinerary,
  suggestDestinations,
  TravelDataError,
} from "./travel-data";

// Optional: when the model leaves it out, runTool picks one from the origin (INR for India).
const currency = z.enum(["USD", "INR", "EUR"]).optional();
// Any city, airport name or IATA code; the travel data resolves it (no extra model call).
const airportCode = z.string().min(2).max(80);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const cabin = z.enum(["economy", "premium_economy", "business"]).default("economy");
const maxStops = z.number().int().min(0).max(2).optional();
const month = z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM");

const schemas = {
  suggest_destinations: z.object({
    origin: airportCode,
    month: z.number().int().min(1).max(12).optional(),
    interests: z.array(z.string()).optional(),
    regions: z.array(z.enum(REGION_NAMES as [string, ...string[]])).optional(),
    countries: z.array(z.string().regex(/^[A-Za-z]{2}$/, "ISO country code")).optional(),
    visa: z.enum(["visa_free", "easy"]).optional(),
    max_flight_price: z.number().positive().optional(),
    currency,
  }),
  get_destination_info: z.object({
    code: airportCode,
    month: month.optional(),
    origin: airportCode.optional(),
    currency,
  }),
  get_price_calendar: z.object({
    origin: airportCode,
    destination: airportCode,
    month,
    currency,
  }),
  search_flights: z.object({
    origin: airportCode,
    destination: airportCode,
    date,
    adults: z.number().int().min(1).max(9).default(1),
    cabin,
    maxStops,
    currency,
  }),
  search_itinerary: z.object({
    legs: z.array(z.object({ origin: airportCode, destination: airportCode, date })).min(1).max(6),
    adults: z.number().int().min(1).max(9).default(1),
    cabin,
    maxStops,
    currency,
  }),
  find_cheapest_dates: z.object({
    origin: airportCode,
    destination: airportCode,
    month,
    minNights: z.number().int().min(1).max(30),
    maxNights: z.number().int().min(1).max(30),
    returnFrom: airportCode.optional(),
    returnTo: airportCode.optional(),
    adults: z.number().int().min(1).max(9).default(1),
    cabin,
    maxStops,
    currency,
  }),
  get_offer: z.object({ offer_id: z.string() }),
  estimate_trip_budget: z.object({
    origin: airportCode,
    destination: airportCode,
    month,
    nights: z.number().int().min(1).max(60),
    travellers: z.number().int().min(1).max(9).default(1),
    style: z.enum(["budget", "mid", "luxury"]).default("mid"),
    currency,
  }),
};

type ToolName = keyof typeof schemas;

const currencyProp = {
  type: "string",
  enum: ["USD", "INR", "EUR"],
  description: "Always INR unless the user explicitly asked for another currency.",
};

/** Provider-neutral tool declarations (name, description, JSON Schema parameters). */
export const toolDeclarations: { name: ToolName; description: string; parameters: Record<string, unknown> }[] = [
  {
    name: "suggest_destinations",
    description:
      "Suggest destinations reachable from an origin airport, ranked by the traveller's interests, season and fare. Use for open-ended discovery such as 'where should I go in March?' or 'cheap beach trips', with `regions` when the user names a region or country with several airports ('flights to Europe') to list the entry points to choose from, and with `visa` for visa constraints. Each result has visaForIndians.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Origin city, airport or IATA code, e.g. Surat or STV" },
        month: { type: "integer", description: "Travel month 1-12, if known" },
        interests: {
          type: "array",
          items: { type: "string" },
          description: "e.g. beach, mountains, food, culture, nightlife, budget, honeymoon, family",
        },
        regions: {
          type: "array",
          items: { type: "string", enum: REGION_NAMES },
          description:
            "Limit to these regions, e.g. [\"europe\"] for 'flights to Europe'. Loose terms cover neighbours people group together: 'Southeast Asia' or 'abroad nearby' → [\"southeast_asia\", \"south_asia\"] (adds Sri Lanka, Maldives, Nepal, Bhutan).",
        },
        countries: {
          type: "array",
          items: { type: "string" },
          description: "Limit to these countries as ISO codes, e.g. [\"JP\"] for 'flights to Japan' (lists its main airports)",
        },
        visa: {
          type: "string",
          enum: ["visa_free", "easy"],
          description:
            "Entry rules for Indian passports. visa_free: no visa to arrange. easy: also visa on arrival. For 'visa-free' requests use easy, and label which ones are on arrival.",
        },
        max_flight_price: { type: "number", description: "Max one-way fare per adult, in `currency`" },
        currency: currencyProp,
      },
      required: ["origin"],
    },
  },
  {
    name: "get_destination_info",
    description:
      "Facts about one destination: weather in a given month, best months, what it's good for, typical daily spend and flight time from an origin. Use for itineraries, comparisons and 'is X good in <month>?'.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Destination city, airport or IATA code" },
        month: { type: "string", description: "YYYY-MM, optional" },
        origin: { type: "string", description: "Origin city or IATA code, optional, for flight time" },
        currency: currencyProp,
      },
      required: ["code"],
    },
  },
  {
    name: "get_price_calendar",
    description:
      "Daily one-way economy fares for one adult for every day of a month on a route, plus the cheapest date and the average. Use when the user is flexible on dates or asks when it is cheapest to fly.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Origin city, airport or IATA code" },
        destination: { type: "string", description: "Destination city, airport or IATA code" },
        month: { type: "string", description: "YYYY-MM" },
        currency: currencyProp,
      },
      required: ["origin", "destination", "month"],
    },
  },
  {
    name: "search_flights",
    description:
      "Search one-way flight offers for a specific date. Returns offers with an offerId, times, stops and the total price for all adults. For a return trip, search each direction separately.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Origin city, airport or IATA code" },
        destination: { type: "string", description: "Destination city, airport or IATA code" },
        date: { type: "string", description: "Departure date, YYYY-MM-DD" },
        adults: { type: "integer" },
        cabin: { type: "string", enum: ["economy", "premium_economy", "business"] },
        maxStops: { type: "integer", description: "0 = non-stop only, 1 = up to one stop" },
        currency: currencyProp,
      },
      required: ["origin", "destination", "date"],
    },
  },
  {
    name: "search_itinerary",
    description:
      "Search a trip with fixed dates and 1-6 legs in date order: round trip (A→B, B→A), open-jaw (A→B, C→A or A→B, B→C) or multi-city (A→B, B→C, C→A…). Returns the cheapest options per leg and the cheapest total.",
    parameters: {
      type: "object",
      properties: {
        legs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              origin: { type: "string" },
              destination: { type: "string" },
              date: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["origin", "destination", "date"],
          },
        },
        adults: { type: "integer" },
        cabin: { type: "string", enum: ["economy", "premium_economy", "business"] },
        maxStops: { type: "integer", description: "0 = non-stop only, 1 = up to one stop" },
        currency: currencyProp,
      },
      required: ["legs"],
    },
  },
  {
    name: "find_cheapest_dates",
    description:
      "Cheapest departure/return date pairs for a round trip or open-jaw trip departing in a month with a stay of minNights–maxNights. For open-jaw, set returnFrom (fly home from another city) and/or returnTo.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string" },
        destination: { type: "string" },
        month: { type: "string", description: "YYYY-MM of departure" },
        minNights: { type: "integer" },
        maxNights: { type: "integer" },
        returnFrom: { type: "string", description: "Open-jaw: city the return flight leaves from" },
        returnTo: { type: "string", description: "Open-jaw: city the return flight lands in" },
        adults: { type: "integer" },
        cabin: { type: "string", enum: ["economy", "premium_economy", "business"] },
        maxStops: { type: "integer", description: "0 = non-stop only, 1 = up to one stop" },
        currency: currencyProp,
      },
      required: ["origin", "destination", "month", "minNights", "maxNights"],
    },
  },
  {
    name: "get_offer",
    description:
      "Re-check a flight offer by offerId before showing the booking review. Always call this when the user picks a flight.",
    parameters: {
      type: "object",
      properties: { offer_id: { type: "string" } },
      required: ["offer_id"],
    },
  },
  {
    name: "estimate_trip_budget",
    description:
      "Estimate the total cost of a trip: return flights plus stay, food, local transport and activities, with a per-person figure. Use for trip planning and for comparing destinations on cost.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Origin city, airport or IATA code" },
        destination: { type: "string", description: "Destination city, airport or IATA code" },
        month: { type: "string", description: "YYYY-MM" },
        nights: { type: "integer" },
        travellers: { type: "integer" },
        style: { type: "string", enum: ["budget", "mid", "luxury"] },
        currency: currencyProp,
      },
      required: ["origin", "destination", "month", "nights"],
    },
  },
];

/** Validate the model's input, run the tool, and return a JSON-serialisable result. */
export async function runTool(
  name: string,
  input: unknown,
): Promise<{ result: unknown; isError: boolean }> {
  if (!(name in schemas)) return { result: { error: `Unknown tool ${name}` }, isError: true };
  const parsed = schemas[name as ToolName].safeParse(input ?? {});
  if (!parsed.success) {
    return { result: { error: "Invalid input", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, isError: true };
  }
  const data = parsed.data as { currency?: Currency; origin?: string; code?: string; month?: unknown };
  // Models sometimes pick last year for "February"; a month in the past means next year's.
  if (typeof data.month === "string" && /^\d{4}-\d{2}$/.test(data.month)) {
    const thisMonth = new Date().toISOString().slice(0, 7);
    let month: string = data.month;
    while (month < thisMonth) month = `${Number(month.slice(0, 4)) + 1}${month.slice(4)}`;
    data.month = month;
  }
  if ("currency" in schemas[name as ToolName].shape && !data.currency) {
    data.currency = defaultCurrency(data.origin ?? data.code);
  }
  try {
    return { result: execute(name as ToolName, data), isError: false };
  } catch (error) {
    if (error instanceof TravelDataError) return { result: { error: error.message }, isError: true };
    throw error;
  }
}

// House rule: prices are shown in Indian rupees unless the user explicitly asked otherwise.
function defaultCurrency(_airportCode?: string): Currency {
  return "INR";
}

// Callers fill in currency before execute(), so it is always set here.
type WithCurrency<T> = Omit<T, "currency"> & { currency: Currency };

function execute(name: ToolName, data: unknown) {
  switch (name) {
    case "suggest_destinations": {
      const d = data as WithCurrency<z.infer<typeof schemas.suggest_destinations>>;
      return suggestDestinations({
        origin: d.origin,
        month: d.month,
        interests: d.interests,
        regions: d.regions,
        countries: d.countries,
        visa: d.visa,
        maxFlightPrice: d.max_flight_price,
        currency: d.currency,
      });
    }
    case "get_destination_info":
      return destinationInfo(data as WithCurrency<z.infer<typeof schemas.get_destination_info>>);
    case "get_price_calendar":
      return priceCalendar(data as WithCurrency<z.infer<typeof schemas.get_price_calendar>>);
    case "search_flights":
      return searchFlights(data as WithCurrency<z.infer<typeof schemas.search_flights>>);
    case "get_offer":
      return getOffer((data as z.infer<typeof schemas.get_offer>).offer_id);
    case "search_itinerary":
      return searchItinerary(data as WithCurrency<z.infer<typeof schemas.search_itinerary>>);
    case "find_cheapest_dates":
      return findCheapestDates(data as WithCurrency<z.infer<typeof schemas.find_cheapest_dates>>);
    case "estimate_trip_budget":
      return estimateTripBudget(data as WithCurrency<z.infer<typeof schemas.estimate_trip_budget>>);
  }
}
