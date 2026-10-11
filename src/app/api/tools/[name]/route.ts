import { runTool } from "@/lib/tools";

// Read-only tools the UI components (and you, while debugging) may call directly.
const PUBLIC_TOOLS = new Set([
  "suggest_destinations",
  "get_destination_info",
  "get_price_calendar",
  "search_flights",
  "get_offer",
  "estimate_trip_budget",
  "search_itinerary",
  "find_cheapest_dates",
]);

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!PUBLIC_TOOLS.has(name)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const { result, isError } = await runTool(name, await req.json());
  return Response.json(result, { status: isError ? 400 : 200 });
}
