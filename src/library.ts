/**
 * The component library the model writes OpenUI Lang against.
 *
 * It is OpenUI's chat library plus four travel components. `npm run generate` bundles this
 * file and writes src/generated/spec.json, which the server turns into the system prompt;
 * the browser renders responses with the same `library`.
 */
import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";
import { z } from "zod/v4";
import {
  DayPlan,
  DestinationCard,
  DestinationGrid,
  FlightResults,
  FlightReview,
  Itinerary,
  OriginNote,
  PriceCalendar,
  TravelInsights,
  TripBudget,
  TripDates,
  TripItinerary,
} from "./components/travel";

const travelComponents = [
  OriginNote,
  DestinationGrid,
  DestinationCard,
  PriceCalendar,
  FlightResults,
  FlightReview,
  TripItinerary,
  DayPlan,
  TripBudget,
  TravelInsights,
  TripDates,
  Itinerary,
];

// The chat Card only accepts the components in its child union, so rebuild it with the
// travel components added and keep the original renderer.
const BaseCard = openuiChatLibrary.components.Card;
const baseChildren = (BaseCard.props.shape.children as z.ZodArray<z.ZodUnion>).element.options;
const Card = defineComponent({
  name: "Card",
  description: BaseCard.description,
  props: BaseCard.props.extend({
    children: z.array(
      z.union([
        ...baseChildren,
        DestinationGrid.ref,
        PriceCalendar.ref,
        FlightResults.ref,
        FlightReview.ref,
        TripItinerary.ref,
        TripBudget.ref,
        TravelInsights.ref,
        TripDates.ref,
        Itinerary.ref,
      ] as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]),
    ),
  }),
  component: BaseCard.component as never,
});

export const library = createLibrary({
  root: "Card",
  componentGroups: [
    {
      name: "Travel",
      components: travelComponents.map((c) => c.name),
      notes: [
        "- PriceCalendar, FlightResults, FlightReview, TripBudget and DestinationGrid's detail panel load live data themselves. Pass only parameters; never write prices into them.",
        "- These components are interactive in place: month and day switching, sorting, non-stop filter, flight details, selecting a flight, booking review, checkout, and budget tweaks all happen inside them without a new message. Don't offer FollowUpItems for things they already do.",
        "- DestinationGrid holds DestinationCards. Define each DestinationCard as its own reference so cards stream in one by one.",
      ],
    },
    ...(openuiChatLibrary.componentGroups ?? []),
  ],
  components: [...Object.values({ ...openuiChatLibrary.components, Card }), ...travelComponents],
});

export { promptOptions } from "./lib/prompt-options";
