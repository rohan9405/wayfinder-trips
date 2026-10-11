import { getOffer, TravelDataError } from "@/lib/travel-data";

/**
 * Mock checkout. The model never reaches this route; only the FlightReview button does.
 * The offer is re-derived from its id on the server, so the price can't be altered in the
 * browser or by the model. Replace with your provider's order/hold API and a payment step.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { offerId?: string; offerIds?: string[] };
  // One offer (one-way) or one per leg (round trip, open-jaw, multi-city).
  const ids = body.offerIds?.length ? body.offerIds.slice(0, 6) : body.offerId ? [body.offerId] : [];
  if (!ids.length) return Response.json({ error: "offerId or offerIds is required" }, { status: 400 });
  try {
    const offers = ids.map((id) => getOffer(id));
    const reference = `WF${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const total = offers.reduce((sum, o) => sum + o.totalPrice, 0);
    return Response.json({ reference, offer: offers[0], offers, total, status: "held", paymentTaken: false });
  } catch (error) {
    if (error instanceof TravelDataError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
