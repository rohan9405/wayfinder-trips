"use client";

/**
 * Travel components for the OpenUI library.
 *
 * Interaction rule: anything the component can show itself (other months, another day,
 * sorting, filters, flight details, booking review, budget tweaks) happens IN PLACE by
 * loading data straight from /api/tools. Only actions that need the assistant to produce
 * something new (a new itinerary, a new plan) send a chat message; those buttons use
 * <AskButton>, marked with a sparkle, so people can tell the two apart.
 */

import { defineComponent, useIsStreaming, useTriggerAction } from "@openuidev/react-lang";
import { Button } from "@openuidev/react-ui";
import {
  CalendarDays,
  CloudSun,
  Lightbulb,
  PartyPopper,
  TrendingDown,
  Users as UsersIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Luggage,
  Minus,
  Plane,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { z } from "zod/v4";
import { RouteMap } from "./route-map";
import { formatDuration, formatPrice, useToolData } from "./use-tool-data";

const currency = z.enum(["USD", "INR", "EUR"]);
const cabin = z.enum(["economy", "premium_economy", "business"]);
type Cabin = z.infer<typeof cabin>;

// ── Shared building blocks ───────────────────────────────────────────────

/** A button that sends a new message to the assistant. Visually marked with a sparkle. */
function AskButton({ prompt, children }: { prompt: string; children: ReactNode }) {
  const triggerAction = useTriggerAction();
  const isStreaming = useIsStreaming();
  return (
    <Button
      size="small"
      variant="tertiary"
      className="tc-ask"
      disabled={isStreaming}
      iconLeft={<Sparkles size={14} />}
      title="Asks Wayfinder in the chat"
      onClick={() => triggerAction(prompt)}
    >
      {children}
    </Button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="tc-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className="tc-seg__btn"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="tc-stepper">
      <span className="tc-muted tc-small">{label}</span>
      <div className="tc-stepper__ctrl">
        <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={14} />
        </button>
        <span className="tc-strong">{value}</span>
        <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function Loading({ children }: { children: ReactNode }) {
  return <div className="tc-panel tc-skeleton">{children}</div>;
}

function ErrorBox({ message }: { message: string }) {
  return <div className="tc-panel tc-error">{message}</div>;
}

// ── Fare calendar (month switcher → day → flights → review) ──────────────

interface CalendarData {
  originCity: string;
  destinationCity: string;
  currency: string;
  cheapestDate: string;
  cheapestPrice: number;
  averagePrice: number;
  days: { date: string; price: number | null }[];
}

function CalendarPanel({
  origin,
  destination,
  initialMonth,
  currency: cur,
  adults = 1,
  cabin: cabinClass = "economy",
  showMap = true,
}: {
  origin: string;
  destination: string;
  initialMonth: string;
  currency: string;
  adults?: number;
  cabin?: Cabin;
  showMap?: boolean;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [selected, setSelected] = useState<string | null>(null);
  const valid = Boolean(origin && destination && /^\d{4}-\d{2}$/.test(month ?? ""));
  const state = useToolData<CalendarData>(
    "get_price_calendar",
    { origin, destination, month, currency: cur },
    valid,
  );
  const thisMonth = new Date().toISOString().slice(0, 7);

  const header = (
    <div className="tc-panel__head">
      <div>
        <div className="tc-panel__title">
          {state.status === "ready" ? `${state.data.originCity} → ${state.data.destinationCity}` : `${origin} → ${destination}`}
        </div>
        <div className="tc-muted">
          One-way, 1 adult
          {state.status === "ready" ? ` · avg ${formatPrice(state.data.averagePrice, state.data.currency)}` : ""}
          {" · pick a day to see flights"}
        </div>
      </div>
      <div className="tc-monthnav">
        <button
          type="button"
          aria-label="Previous month"
          disabled={month <= thisMonth}
          onClick={() => {
            setMonth(shiftMonth(month, -1));
            setSelected(null);
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="tc-strong">{monthLabel(month)}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => {
            setMonth(shiftMonth(month, 1));
            setSelected(null);
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  let body: ReactNode;
  if (state.status === "loading") body = <div className="tc-skeleton tc-cal-placeholder">Loading fares…</div>;
  else if (state.status === "error") body = <div className="tc-error-text">{state.message}</div>;
  else {
    const { days, cheapestPrice } = state.data;
    const prices = days.flatMap((d) => (d.price === null ? [] : [d.price]));
    const max = Math.max(...prices);
    const firstWeekday = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
    body = (
      <>
        <div className="tc-legend">
          <span className="tc-chip tc-chip--cheap">Cheapest {formatPrice(cheapestPrice, state.data.currency)}</span>
          <span className="tc-chip tc-chip--pricey">Priciest {formatPrice(max, state.data.currency)}</span>
        </div>
        <div className="tc-cal">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="tc-cal__dow">
              {d}
            </div>
          ))}
          {Array.from({ length: firstWeekday }, (_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.map((day) => {
            const dayNum = Number(day.date.slice(8));
            if (day.price === null) {
              return (
                <div key={day.date} className="tc-cal__day tc-cal__day--past">
                  <span>{dayNum}</span>
                </div>
              );
            }
            const t = max === cheapestPrice ? 0 : (day.price - cheapestPrice) / (max - cheapestPrice);
            const classes = ["tc-cal__day"];
            if (day.price === cheapestPrice) classes.push("tc-cal__day--best");
            if (day.date === selected) classes.push("tc-cal__day--selected");
            return (
              <button
                key={day.date}
                type="button"
                className={classes.join(" ")}
                style={{ background: heat(t) }}
                aria-pressed={day.date === selected}
                onClick={() => setSelected(day.date === selected ? null : day.date)}
                title={`${day.date}: ${formatPrice(day.price, state.data.currency)}`}
              >
                <span>{dayNum}</span>
                <span className="tc-cal__price">{compactPrice(day.price, state.data.currency)}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="tc-panel">
      {header}
      {showMap ? (
        <RouteMap
          label={`Route map ${origin} to ${destination}`}
          height={180}
          points={[
            { code: origin, role: "origin" },
            {
              code: destination,
              role: "destination",
              badge: state.status === "ready" ? `from ${compactPrice(state.data.cheapestPrice, state.data.currency)}` : undefined,
            },
          ]}
          routes={[{ from: origin, to: destination }]}
        />
      ) : null}
      {body}
      {selected ? (
        <FlightList
          key={selected}
          origin={origin}
          destination={destination}
          date={selected}
          adults={adults}
          cabin={cabinClass}
          currency={cur}
          nested
        />
      ) : null}
    </div>
  );
}

export const PriceCalendar = defineComponent({
  name: "PriceCalendar",
  description:
    "Interactive fare calendar for a route. It loads prices itself; pass only the route and starting month. Users can switch months, click a day to see that day's flights, pick a flight and review it, all inside the component.",
  props: z.object({
    origin: z.string(),
    destination: z.string(),
    month: z.string(),
    currency,
    adults: z.number().optional(),
    cabin: cabin.optional(),
  }),
  component: ({ props }) =>
    props.origin && props.destination && props.month ? (
      <CalendarPanel
        key={`${props.origin}-${props.destination}-${props.month}`}
        origin={props.origin}
        destination={props.destination}
        initialMonth={props.month}
        currency={props.currency ?? "USD"}
        adults={props.adults}
        cabin={props.cabin}
      />
    ) : (
      <Loading>Loading fares…</Loading>
    ),
});

// ── Flights (sort / filter / shift day / details → review → checkout) ────

interface Offer {
  offerId: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  date: string;
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  stops: number;
  layoverCity: string | null;
  cabin: string;
  adults: number;
  totalPrice: number;
  currency: string;
  seatsLeft: number;
  refundable: boolean;
  baggage: string;
}

interface FlightSearchData {
  route: string;
  offers: Offer[];
}

type SortBy = "price" | "duration" | "departure";

function FlightList(props: {
  origin: string;
  destination: string;
  date: string;
  adults: number;
  cabin: Cabin;
  currency: string;
  sortBy?: SortBy;
  maxStops?: number;
  nested?: boolean;
  /** Inside a multi-leg trip: picking a flight hands it back instead of opening checkout. */
  onPick?: (offer: Offer) => void;
}) {
  const [date, setDate] = useState(props.date);
  const [sort, setSort] = useState<SortBy>(props.sortBy ?? "price");
  const [nonstop, setNonstop] = useState(props.maxStops === 0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const state = useToolData<FlightSearchData>("search_flights", {
    origin: props.origin,
    destination: props.destination,
    date,
    adults: props.adults,
    cabin: props.cabin,
    currency: props.currency,
  });
  const todayIso = new Date().toISOString().slice(0, 10);

  if (selected) {
    return <ReviewPanel offerId={selected} onBack={() => setSelected(null)} nested={props.nested} />;
  }

  const controls = (
    <div className="tc-toolbar">
      <div className="tc-monthnav">
        <button type="button" aria-label="Previous day" disabled={date <= todayIso} onClick={() => setDate(shiftDay(date, -1))}>
          <ChevronLeft size={16} />
        </button>
        <span className="tc-strong">{formatDate(date)}</span>
        <button type="button" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>
      <Segmented<SortBy>
        label="Sort flights"
        value={sort}
        onChange={setSort}
        options={[
          { value: "price", label: "Cheapest" },
          { value: "duration", label: "Fastest" },
          { value: "departure", label: "Earliest" },
        ]}
      />
      <label className="tc-toggle">
        <input type="checkbox" checked={nonstop} onChange={(e) => setNonstop(e.target.checked)} />
        Non-stop only
      </label>
    </div>
  );

  // The expanded flight's layover is drawn on the map.
  const layover =
    state.status === "ready" ? (state.data.offers.find((o) => o.offerId === expanded)?.layoverCity ?? null) : null;

  const wrap = (content: ReactNode) => (
    <div className={props.nested ? "tc-nested" : "tc-panel"}>
      <div className="tc-panel__head">
        <div>
          <div className="tc-panel__title">
            {state.status === "ready" ? state.data.route : `${props.origin} → ${props.destination}`}
          </div>
          <div className="tc-muted">
            {props.adults} adult{props.adults > 1 ? "s" : ""} · {props.cabin.replace("_", " ")}
          </div>
        </div>
      </div>
      {controls}
      {!props.nested ? (
        <RouteMap
          label={`Route map ${props.origin} to ${props.destination}`}
          height={180}
          points={[
            { code: props.origin, role: "origin" },
            ...(layover ? [{ code: layover, role: "stop" as const, badge: "layover" }] : []),
            { code: props.destination, role: "destination" },
          ]}
          routes={[{ from: props.origin, to: props.destination, via: layover }]}
        />
      ) : null}
      {content}
    </div>
  );

  if (state.status === "loading") return wrap(<div className="tc-skeleton">Searching flights…</div>);
  if (state.status === "error") return wrap(<div className="tc-error-text">{state.message}</div>);

  const all = state.data.offers;
  const offers = all
    .filter((o) => !nonstop || o.stops === 0)
    .sort((a, b) =>
      sort === "duration"
        ? a.durationMinutes - b.durationMinutes
        : sort === "departure"
          ? a.departTime.localeCompare(b.departTime)
          : a.totalPrice - b.totalPrice,
    );
  const cheapest = Math.min(...all.map((o) => o.totalPrice));
  const fastest = Math.min(...all.map((o) => o.durationMinutes));

  return wrap(
    <>
      <div className="tc-muted tc-small">
        {offers.length} of {all.length} flights{nonstop ? " (non-stop)" : ""}
      </div>
      {offers.length === 0 ? (
        <div className="tc-muted">No non-stop flights on this day. Try another day or include 1-stop flights.</div>
      ) : null}
      <div className="tc-flights">
        {offers.map((o) => {
          const open = expanded === o.offerId;
          return (
            <div key={o.offerId} className={`tc-flight${open ? " tc-flight--open" : ""}`}>
              <button
                type="button"
                className="tc-flight__main"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : o.offerId)}
              >
                <span className="tc-flight__airline">
                  <Plane size={16} />
                  <span>
                    <span className="tc-strong tc-block">{o.airline}</span>
                    <span className="tc-muted tc-small">{o.flightNumber}</span>
                  </span>
                </span>
                <span className="tc-flight__times">
                  <span className="tc-strong tc-block">
                    {o.departTime} → {o.arriveTime}
                  </span>
                  <span className="tc-muted tc-small">
                    {formatDuration(o.durationMinutes)} · {o.stops === 0 ? "Non-stop" : `1 stop (${o.layoverCity})`}
                  </span>
                </span>
                <span className="tc-flight__tags">
                  {o.totalPrice === cheapest ? <span className="tc-chip tc-chip--cheap">Cheapest</span> : null}
                  {o.durationMinutes === fastest ? <span className="tc-chip tc-chip--fast">Fastest</span> : null}
                  {o.seatsLeft <= 3 ? <span className="tc-chip tc-chip--warn">{o.seatsLeft} left</span> : null}
                </span>
                <span className="tc-price">{formatPrice(o.totalPrice, o.currency)}</span>
                <ChevronDown size={16} className="tc-flight__chev" />
              </button>
              {open ? (
                <div className="tc-flight__details">
                  <span>
                    <Luggage size={14} /> {o.baggage}
                  </span>
                  <span>{o.refundable ? "Refundable" : "Non-refundable"}</span>
                  <span>
                    {o.seatsLeft} seat{o.seatsLeft > 1 ? "s" : ""} left at this price
                  </span>
                  {o.stops ? <span>Layover in {o.layoverCity}</span> : null}
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => (props.onPick ? props.onPick(o) : setSelected(o.offerId))}
                  >
                    {props.onPick ? "Choose for this leg" : "Select this flight"}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>,
  );
}

export const FlightResults = defineComponent({
  name: "FlightResults",
  description:
    "Interactive list of bookable one-way flights for a route and date. It loads offers itself; pass only the search. Users can shift the day, sort, filter non-stop, expand details, select a flight, review it and check out, all inside the component. sortBy: 'price' (default), 'duration' or 'departure'; maxStops 0 starts with non-stop only.",
  props: z.object({
    origin: z.string(),
    destination: z.string(),
    date: z.string(),
    adults: z.number(),
    cabin,
    currency,
    sortBy: z.enum(["price", "duration", "departure"]).optional(),
    maxStops: z.number().optional(),
  }),
  component: ({ props }) =>
    props.origin && props.destination && /^\d{4}-\d{2}-\d{2}$/.test(props.date ?? "") ? (
      <FlightList
        key={`${props.origin}-${props.destination}-${props.date}-${props.adults}-${props.cabin}`}
        origin={props.origin}
        destination={props.destination}
        date={props.date}
        adults={props.adults ?? 1}
        cabin={props.cabin ?? "economy"}
        currency={props.currency ?? "USD"}
        sortBy={props.sortBy}
        maxStops={props.maxStops}
      />
    ) : (
      <Loading>Searching flights…</Loading>
    ),
});

// ── Booking review & checkout ────────────────────────────────────────────

function ReviewPanel({ offerId, onBack, nested }: { offerId: string; onBack?: () => void; nested?: boolean }) {
  const state = useToolData<Offer>("get_offer", { offer_id: offerId }, Boolean(offerId));
  const [checkout, setCheckout] = useState<
    | { status: "idle" }
    | { status: "pending" }
    | { status: "done"; reference: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  if (state.status === "loading") return <Loading>Checking the fare…</Loading>;
  if (state.status === "error") return <ErrorBox message={state.message} />;
  const o = state.data;

  async function startCheckout() {
    setCheckout({ status: "pending" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: o.offerId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Checkout failed");
      setCheckout({ status: "done", reference: body.reference });
    } catch (error) {
      setCheckout({ status: "error", message: (error as Error).message });
    }
  }

  return (
    <div className={nested ? "tc-nested" : "tc-panel"}>
      <div className="tc-panel__head">
        <div className="tc-panel__title">Review your flight</div>
        {onBack && checkout.status !== "done" ? (
          <button type="button" className="tc-link" onClick={onBack}>
            <ChevronLeft size={14} /> Back to flights
          </button>
        ) : null}
      </div>
      <div className="tc-review">
        <Row icon={<Plane size={15} />} label="Flight" value={`${o.airline} ${o.flightNumber} · ${o.origin} → ${o.destination}`} />
        <Row icon={<CalendarDays size={15} />} label="Date" value={`${formatDate(o.date)} · ${o.departTime} → ${o.arriveTime}`} />
        <Row icon={<Clock size={15} />} label="Duration" value={`${formatDuration(o.durationMinutes)} · ${o.stops === 0 ? "Non-stop" : `1 stop via ${o.layoverCity}`}`} />
        <Row icon={<Luggage size={15} />} label="Fare" value={`${o.cabin.replace("_", " ")} · ${o.baggage} · ${o.refundable ? "Refundable" : "Non-refundable"}`} />
        <Row icon={<ShieldCheck size={15} />} label="Travellers" value={`${o.adults} adult${o.adults > 1 ? "s" : ""}`} />
      </div>
      <div className="tc-review__total">
        <span>Total</span>
        <span className="tc-price">{formatPrice(o.totalPrice, o.currency)}</span>
      </div>
      {checkout.status === "done" ? (
        <div className="tc-success">
          Demo booking held · reference <strong>{checkout.reference}</strong>. No payment was taken.
        </div>
      ) : (
        <div className="tc-row">
          <Button variant="primary" disabled={checkout.status === "pending"} onClick={startCheckout}>
            {checkout.status === "pending" ? "Holding seat…" : "Continue to checkout"}
          </Button>
          {checkout.status === "error" ? <span className="tc-error-text">{checkout.message}</span> : null}
        </div>
      )}
      <div className="tc-muted tc-small">Prices are re-checked when you continue. Demo data, no real booking.</div>
    </div>
  );
}

export const FlightReview = defineComponent({
  name: "FlightReview",
  description:
    "Booking review for one offer, re-checked live, with a checkout button handled by the app (not by you). Pass the offerId exactly as returned by search_flights or get_offer. Only needed when the user names an offer in chat; FlightResults and PriceCalendar already include review and checkout.",
  props: z.object({ offerId: z.string() }),
  component: ({ props }) =>
    props.offerId ? <ReviewPanel key={props.offerId} offerId={props.offerId} /> : <Loading>Checking the fare…</Loading>,
});

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="tc-review__row">
      <span className="tc-review__label">
        {icon}
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

// ── Destination discovery (cards → detail panel with overview / fares) ───

interface CardInfo {
  code: string;
  city: string;
  country: string;
  currency: string;
}

const GridContext = createContext<{
  origin?: string;
  selected: string | null;
  toggle: (card: CardInfo) => void;
} | null>(null);

export const DestinationCard = defineComponent({
  name: "DestinationCard",
  description:
    "One destination idea inside a DestinationGrid. Copy code, city, country, fromPrice and bestMonths exactly from suggest_destinations; tagline may be your own one-line pitch; weather is optional. The card opens its own details, fare calendar and flights in place.",
  props: z.object({
    code: z.string(),
    city: z.string(),
    country: z.string(),
    tagline: z.string(),
    fromPrice: z.number(),
    currency,
    bestMonths: z.string(),
    weather: z.string().optional(),
  }),
  component: ({ props }) => {
    const grid = useContext(GridContext);
    const isSelected = grid?.selected === props.code;
    return (
      <div className={`tc-dest${isSelected ? " tc-dest--selected" : ""}`}>
        <div className="tc-dest__banner" style={{ background: gradientFor(props.code) }}>
          <span className="tc-dest__code">{props.code}</span>
        </div>
        <div className="tc-dest__body">
          <div className="tc-dest__title">
            {props.city}
            <span className="tc-muted">, {props.country}</span>
          </div>
          <p className="tc-dest__tagline">{props.tagline}</p>
          <div className="tc-dest__meta">
            {typeof props.fromPrice === "number" ? (
              <span>
                Flights from <strong>{formatPrice(props.fromPrice, props.currency ?? "USD")}</strong>
              </span>
            ) : null}
            <span className="tc-muted">Best: {props.bestMonths}</span>
            {props.weather ? <span className="tc-muted">{props.weather}</span> : null}
          </div>
          <div className="tc-row">
            <Button
              size="small"
              variant={isSelected ? "secondary" : "primary"}
              aria-expanded={isSelected}
              onClick={() =>
                grid?.toggle({ code: props.code, city: props.city, country: props.country, currency: props.currency ?? "USD" })
              }
            >
              {isSelected ? "Hide details" : "Details & fares"}
            </Button>
          </div>
        </div>
      </div>
    );
  },
});

export const DestinationGrid = defineComponent({
  name: "DestinationGrid",
  description:
    "A grid of 2-6 DestinationCards. origin is the traveller's IATA airport; month (YYYY-MM, optional) is the travel month. Clicking a card opens a panel below the grid with weather, best months, daily budget, a fare calendar, flights and booking, without a new message.",
  props: z.object({
    origin: z.string(),
    destinations: z.array(DestinationCard.ref),
    month: z.string().optional(),
  }),
  component: ({ props, renderNode }) => {
    const [selected, setSelected] = useState<CardInfo | null>(null);
    return (
      <GridContext.Provider
        value={{
          origin: props.origin,
          selected: selected?.code ?? null,
          toggle: (card) => setSelected((cur) => (cur?.code === card.code ? null : card)),
        }}
      >
        <div className="tc-gridwrap">
          <DestinationsMap
            origin={props.origin}
            nodes={props.destinations as unknown[]}
            selected={selected?.code ?? null}
            onSelect={(card) => setSelected((cur) => (cur?.code === card.code ? null : card))}
          />
          <div className="tc-grid">{renderNode(props.destinations)}</div>
          {selected ? (
            <DestinationDetail
              key={selected.code}
              card={selected}
              origin={props.origin}
              month={props.month}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </div>
      </GridContext.Provider>
    );
  },
});

/** Map above the destination cards: origin, every destination with its fare, and the routes. */
function DestinationsMap({
  origin,
  nodes,
  selected,
  onSelect,
}: {
  origin: string;
  nodes: unknown[];
  selected: string | null;
  onSelect: (card: CardInfo) => void;
}) {
  const cards = (nodes ?? []).flatMap((n) => {
    const p = (n as { props?: Record<string, unknown> } | null)?.props;
    return p && typeof p.code === "string"
      ? [
          {
            code: p.code,
            city: String(p.city ?? p.code),
            country: String(p.country ?? ""),
            currency: String(p.currency ?? "USD"),
            fromPrice: typeof p.fromPrice === "number" ? p.fromPrice : undefined,
          },
        ]
      : [];
  });
  if (!origin || cards.length === 0) return null;
  return (
    <RouteMap
      label={`Map of destinations from ${origin}`}
      height={260}
      selected={selected}
      onSelect={(code) => {
        const card = cards.find((c) => c.code === code);
        if (card) onSelect(card);
      }}
      points={[
        { code: origin, role: "origin" },
        ...cards.map((c) => ({
          code: c.code,
          role: "destination" as const,
          badge: c.fromPrice !== undefined ? compactPrice(c.fromPrice, c.currency) : undefined,
        })),
      ]}
      routes={cards.map((c) => ({ from: origin, to: c.code }))}
    />
  );
}

interface DestinationInfoData {
  city: string;
  country: string;
  interests: string[];
  bestMonths: string[];
  inSeason?: boolean;
  weather: string | Record<string, string>;
  dailyBudgetMidRange: number;
  flightHoursFromOrigin?: number;
  currency: string;
}

function DestinationDetail({
  card,
  origin,
  month,
  onClose,
}: {
  card: CardInfo;
  origin?: string;
  month?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "fares">("overview");
  const validMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : nextMonth();
  const info = useToolData<DestinationInfoData>("get_destination_info", {
    code: card.code,
    month: validMonth,
    origin: origin || undefined,
    currency: card.currency,
  });

  return (
    <div className="tc-panel tc-detail">
      <div className="tc-panel__head">
        <div>
          <div className="tc-panel__title">
            {card.city}, {card.country}
          </div>
          <div className="tc-muted">{monthLabel(validMonth)}</div>
        </div>
        <div className="tc-row">
          <Segmented
            label="Destination view"
            value={tab}
            onChange={setTab}
            options={[
              { value: "overview", label: "Overview" },
              ...(origin ? [{ value: "fares" as const, label: "Fares & flights" }] : []),
            ]}
          />
          <button type="button" className="tc-link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {tab === "overview" ? (
        info.status === "loading" ? (
          <div className="tc-skeleton">Loading details…</div>
        ) : info.status === "error" ? (
          <div className="tc-error-text">{info.message}</div>
        ) : (
          <div className="tc-facts">
            <Fact label={`Weather in ${monthLabel(validMonth).split(" ")[0]}`}>
              {typeof info.data.weather === "string" ? info.data.weather : "See best months"}
              {info.data.inSeason !== undefined ? (
                <span className={`tc-chip ${info.data.inSeason ? "tc-chip--cheap" : "tc-chip--warn"}`}>
                  {info.data.inSeason ? "In season" : "Off season"}
                </span>
              ) : null}
            </Fact>
            <Fact label="Best months">{info.data.bestMonths.join(", ")}</Fact>
            <Fact label="Good for">{info.data.interests.join(", ")}</Fact>
            <Fact label="Daily spend (mid-range)">
              {formatPrice(info.data.dailyBudgetMidRange, info.data.currency)} per person
            </Fact>
            {info.data.flightHoursFromOrigin ? (
              <Fact label={`Flight from ${origin}`}>about {info.data.flightHoursFromOrigin} h</Fact>
            ) : null}
          </div>
        )
      ) : origin ? (
        <CalendarPanel
          origin={origin}
          destination={card.code}
          initialMonth={validMonth}
          currency={card.currency}
          showMap={false}
        />
      ) : null}

      <div className="tc-row">
        {origin && tab === "overview" ? (
          <Button size="small" variant="secondary" onClick={() => setTab("fares")}>
            See fares & flights
          </Button>
        ) : null}
        <AskButton prompt={`Plan a trip to ${card.city} (${card.code}) from ${origin ?? "my city"} in ${monthLabel(validMonth)} with an itinerary and budget`}>
          Plan a trip here
        </AskButton>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tc-fact">
      <div className="tc-muted tc-small">{label}</div>
      <div className="tc-fact__value">{children}</div>
    </div>
  );
}

// ── Trip budget (live recalculation) ─────────────────────────────────────

interface BudgetData {
  route: string;
  currency: string;
  breakdown: { category: string; amount: number }[];
  total: number;
  perPerson: number;
  cheapestOutboundDate: string;
  note: string;
}

type Style = "budget" | "mid" | "luxury";

function BudgetPanel(props: {
  origin: string;
  destination: string;
  month: string;
  nights: number;
  travellers: number;
  style: Style;
  currency: string;
}) {
  const [nights, setNights] = useState(props.nights);
  const [travellers, setTravellers] = useState(props.travellers);
  const [style, setStyle] = useState<Style>(props.style);
  const [showFares, setShowFares] = useState(false);
  const state = useToolData<BudgetData>("estimate_trip_budget", {
    origin: props.origin,
    destination: props.destination,
    month: props.month,
    nights,
    travellers,
    style,
    currency: props.currency,
  });

  return (
    <div className="tc-panel">
      <div className="tc-panel__head">
        <div>
          <div className="tc-panel__title">Estimated budget</div>
          <div className="tc-muted">
            {state.status === "ready" ? state.data.route : `${props.origin} ⇄ ${props.destination}`} · {monthLabel(props.month)}
          </div>
        </div>
        {state.status === "ready" ? (
          <div className="tc-budget__total">
            <div className="tc-price tc-price--lg">{formatPrice(state.data.total, state.data.currency)}</div>
            <div className="tc-muted tc-small">{formatPrice(state.data.perPerson, state.data.currency)} per person</div>
          </div>
        ) : null}
      </div>

      <RouteMap
        label={`Route map ${props.origin} to ${props.destination}`}
        height={160}
        points={[
          { code: props.origin, role: "origin" },
          { code: props.destination, role: "destination" },
        ]}
        routes={[{ from: props.origin, to: props.destination }]}
      />

      <div className="tc-toolbar">
        <Stepper label="Nights" value={nights} min={1} max={30} onChange={setNights} />
        <Stepper label="Travellers" value={travellers} min={1} max={9} onChange={setTravellers} />
        <Segmented<Style>
          label="Travel style"
          value={style}
          onChange={setStyle}
          options={[
            { value: "budget", label: "Budget" },
            { value: "mid", label: "Mid-range" },
            { value: "luxury", label: "Luxury" },
          ]}
        />
      </div>

      {state.status === "loading" ? (
        <div className="tc-skeleton">Calculating…</div>
      ) : state.status === "error" ? (
        <div className="tc-error-text">{state.message}</div>
      ) : (
        <>
          <div className="tc-stack" role="img" aria-label="Budget breakdown">
            {state.data.breakdown.map((b, i) => (
              <span
                key={b.category}
                className={`tc-stack__seg tc-c${i + 1}`}
                style={{ flexGrow: b.amount }}
                title={`${b.category}: ${formatPrice(b.amount, state.data.currency)}`}
              />
            ))}
          </div>
          <ul className="tc-budget__list">
            {state.data.breakdown.map((b, i) => (
              <li key={b.category}>
                <span className={`tc-dot tc-c${i + 1}`} />
                <span>{b.category}</span>
                <span className="tc-muted tc-small">{Math.round((b.amount / state.data.total) * 100)}%</span>
                <span className="tc-strong">{formatPrice(b.amount, state.data.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="tc-muted tc-small">{state.data.note}</div>
        </>
      )}

      <div className="tc-row">
        <Button size="small" variant="secondary" aria-expanded={showFares} onClick={() => setShowFares((v) => !v)}>
          {showFares ? "Hide fares" : "See flight fares"}
        </Button>
      </div>
      {showFares ? (
        <CalendarPanel
          origin={props.origin}
          destination={props.destination}
          initialMonth={props.month}
          currency={props.currency}
          adults={travellers}
          showMap={false}
        />
      ) : null}
    </div>
  );
}

export const TripBudget = defineComponent({
  name: "TripBudget",
  description:
    "Interactive trip cost estimate (return flights, stay, food, transport, activities) with total and per-person cost. It calculates itself; pass the trip parameters. Users can change nights, travellers and style and open the fare calendar in place.",
  props: z.object({
    origin: z.string(),
    destination: z.string(),
    month: z.string(),
    nights: z.number(),
    travellers: z.number(),
    style: z.enum(["budget", "mid", "luxury"]),
    currency,
  }),
  component: ({ props }) =>
    props.origin && props.destination && /^\d{4}-\d{2}$/.test(props.month ?? "") && props.nights ? (
      <BudgetPanel
        key={`${props.origin}-${props.destination}-${props.month}`}
        origin={props.origin}
        destination={props.destination}
        month={props.month}
        nights={props.nights}
        travellers={props.travellers ?? 1}
        style={props.style ?? "mid"}
        currency={props.currency ?? "USD"}
      />
    ) : (
      <Loading>Calculating budget…</Loading>
    ),
});

// ── Multi-leg trips: round trip, open-jaw, multi-city ───────────────────

interface LegInput {
  origin: string;
  destination: string;
  date: string;
}

/** Pick one flight per leg, then review the whole trip and check out once. */
function ItineraryPanel({
  legs,
  adults,
  cabin: cabinClass,
  currency: cur,
  maxStops,
  nested,
  title,
}: {
  legs: LegInput[];
  adults: number;
  cabin: Cabin;
  currency: string;
  maxStops?: number;
  nested?: boolean;
  title?: string;
}) {
  const [picked, setPicked] = useState<(Offer | null)[]>(() => legs.map(() => null));
  const [open, setOpen] = useState(0);
  const [checkout, setCheckout] = useState<
    { status: "idle" } | { status: "pending" } | { status: "done"; reference: string } | { status: "error"; message: string }
  >({ status: "idle" });
  const total = picked.reduce((sum, o) => sum + (o?.totalPrice ?? 0), 0);
  const allPicked = picked.every(Boolean);

  async function startCheckout() {
    setCheckout({ status: "pending" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerIds: picked.map((o) => o!.offerId) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Checkout failed");
      setCheckout({ status: "done", reference: body.reference });
    } catch (error) {
      setCheckout({ status: "error", message: (error as Error).message });
    }
  }

  return (
    <div className={nested ? "tc-nested" : "tc-panel"}>
      {title ? <div className="tc-panel__title">{title}</div> : null}
      {!nested ? (
        <RouteMap
          label="Trip route map"
          height={200}
          points={legs.flatMap((l, i) => [
            ...(i === 0 ? [{ code: l.origin, role: "origin" as const }] : []),
            { code: l.destination, role: (i === legs.length - 1 ? "destination" : "stop") as "destination" | "stop" },
            ...(i > 0 && l.origin !== legs[i - 1].destination ? [{ code: l.origin, role: "stop" as const }] : []),
          ])}
          routes={legs.map((l) => ({ from: l.origin, to: l.destination }))}
        />
      ) : null}
      <ol className="tc-legs">
        {legs.map((leg, i) => {
          const choice = picked[i];
          return (
            <li key={`${leg.origin}-${leg.destination}-${leg.date}-${i}`} className="tc-leg">
              <button type="button" className="tc-leg__head" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                <span className="tc-day__badge">Leg {i + 1}</span>
                <span className="tc-strong">
                  {leg.origin} → {leg.destination}
                </span>
                <span className="tc-muted tc-small">{formatDate(choice?.date ?? leg.date)}</span>
                <span className="tc-leg__pick">
                  {choice ? (
                    <>
                      {choice.airline} {choice.departTime} · {choice.stops === 0 ? "non-stop" : `1 stop`} ·{" "}
                      <strong>{formatPrice(choice.totalPrice, choice.currency)}</strong>
                    </>
                  ) : (
                    <span className="tc-muted">Choose a flight</span>
                  )}
                </span>
                <ChevronDown size={16} className="tc-day__chev" />
              </button>
              {open === i ? (
                <FlightList
                  origin={leg.origin}
                  destination={leg.destination}
                  date={leg.date}
                  adults={adults}
                  cabin={cabinClass}
                  currency={cur}
                  maxStops={maxStops}
                  nested
                  onPick={(o) => {
                    setPicked((p) => p.map((x, j) => (j === i ? o : x)));
                    const next = picked.findIndex((x, j) => j > i && !x);
                    setOpen(next);
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="tc-review__total">
        <span>
          Trip total{" "}
          <span className="tc-muted tc-small">
            ({picked.filter(Boolean).length} of {legs.length} legs chosen · {adults} adult{adults > 1 ? "s" : ""})
          </span>
        </span>
        <span className="tc-price">{total ? formatPrice(total, cur) : "—"}</span>
      </div>
      {checkout.status === "done" ? (
        <div className="tc-success">
          Demo booking held for all {legs.length} legs · reference <strong>{checkout.reference}</strong>. No payment was taken.
        </div>
      ) : (
        <div className="tc-row">
          <Button variant="primary" disabled={!allPicked || checkout.status === "pending"} onClick={startCheckout}>
            {checkout.status === "pending" ? "Holding seats…" : allPicked ? "Continue to checkout" : "Choose a flight for every leg"}
          </Button>
          {checkout.status === "error" ? <span className="tc-error-text">{checkout.message}</span> : null}
        </div>
      )}
    </div>
  );
}

const legSchema = z.object({ origin: z.string(), destination: z.string(), date: z.string() });

export const Itinerary = defineComponent({
  name: "Itinerary",
  description:
    "A trip with fixed dates and 2-6 legs in order: round trip, open-jaw or multi-city. Users pick a flight per leg (each leg loads live offers), see the running total and check out once, all in place. maxStops 0 = non-stop only, 1 = up to one stop.",
  props: z.object({
    legs: z.array(legSchema),
    adults: z.number(),
    cabin,
    currency,
    maxStops: z.number().optional(),
    title: z.string().optional(),
  }),
  component: ({ props }) => {
    const legs = (props.legs ?? []).filter((l) => l?.origin && l?.destination && /^\d{4}-\d{2}-\d{2}$/.test(l?.date ?? ""));
    return legs.length ? (
      <ItineraryPanel
        key={JSON.stringify(legs)}
        legs={legs}
        adults={props.adults ?? 1}
        cabin={props.cabin ?? "economy"}
        currency={props.currency ?? "INR"}
        maxStops={props.maxStops}
        title={props.title}
      />
    ) : (
      <Loading>Building your trip…</Loading>
    );
  },
});

interface DatePair {
  depart: string;
  return: string;
  nights: number;
  total: number;
  savingVsAverage: string;
  outbound: { airline: string; depart: string; stops: number; totalPrice: number };
  inbound: { airline: string; depart: string; stops: number; totalPrice: number };
}

interface CheapestDatesData {
  outbound: string;
  inbound: string;
  averageTotal: number;
  pairsChecked: number;
  best: DatePair[];
}

type StopsFilter = "any" | "1" | "0";

function TripDatesPanel(props: {
  origin: string;
  destination: string;
  month: string;
  minNights: number;
  maxNights: number;
  returnFrom?: string;
  returnTo?: string;
  adults: number;
  cabin: Cabin;
  currency: string;
  maxStops?: number;
}) {
  const [month, setMonth] = useState(props.month);
  const [stops, setStops] = useState<StopsFilter>(props.maxStops === undefined ? "any" : props.maxStops === 0 ? "0" : "1");
  const [chosen, setChosen] = useState<number | null>(null);
  const backFrom = props.returnFrom || props.destination;
  const backTo = props.returnTo || props.origin;
  const state = useToolData<CheapestDatesData>("find_cheapest_dates", {
    origin: props.origin,
    destination: props.destination,
    month,
    minNights: props.minNights,
    maxNights: props.maxNights,
    returnFrom: props.returnFrom || undefined,
    returnTo: props.returnTo || undefined,
    adults: props.adults,
    cabin: props.cabin,
    currency: props.currency,
    maxStops: stops === "any" ? undefined : Number(stops),
  });
  const thisMonth = new Date().toISOString().slice(0, 7);
  const openJaw = backFrom !== props.destination || backTo !== props.origin;

  return (
    <div className="tc-panel">
      <div className="tc-panel__head">
        <div>
          <div className="tc-panel__title">
            Cheapest dates: {props.origin} → {props.destination}
            {openJaw ? `, ${backFrom} → ${backTo}` : " and back"}
          </div>
          <div className="tc-muted">
            {props.minNights === props.maxNights ? `${props.minNights} nights` : `${props.minNights}–${props.maxNights} nights`} ·{" "}
            {props.adults} adult{props.adults > 1 ? "s" : ""} · {openJaw ? "open-jaw" : "round trip"}
          </div>
        </div>
        <div className="tc-monthnav">
          <button
            type="button"
            aria-label="Previous month"
            disabled={month <= thisMonth}
            onClick={() => {
              setMonth(shiftMonth(month, -1));
              setChosen(null);
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="tc-strong">{monthLabel(month)}</span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => {
              setMonth(shiftMonth(month, 1));
              setChosen(null);
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <RouteMap
        label="Trip route map"
        height={180}
        points={[
          { code: props.origin, role: "origin" },
          { code: props.destination, role: "destination" },
          ...(backFrom !== props.destination ? [{ code: backFrom, role: "stop" as const }] : []),
          ...(backTo !== props.origin ? [{ code: backTo, role: "stop" as const }] : []),
        ]}
        routes={[
          { from: props.origin, to: props.destination },
          { from: backFrom, to: backTo },
        ]}
      />
      <div className="tc-toolbar">
        <Segmented<StopsFilter>
          label="Stops"
          value={stops}
          onChange={(v) => {
            setStops(v);
            setChosen(null);
          }}
          options={[
            { value: "any", label: "Any stops" },
            { value: "1", label: "≤ 1 stop" },
            { value: "0", label: "Non-stop" },
          ]}
        />
        {state.status === "ready" ? (
          <span className="tc-muted tc-small">
            {state.data.pairsChecked} date pairs checked · average {formatPrice(state.data.averageTotal, props.currency)}
          </span>
        ) : null}
      </div>
      {state.status === "loading" ? (
        <div className="tc-skeleton">Comparing date pairs…</div>
      ) : state.status === "error" ? (
        <div className="tc-error-text">{state.message}</div>
      ) : (
        <div className="tc-flights">
          {state.data.best.map((p, i) => (
            <div key={`${p.depart}-${p.return}`} className={`tc-flight${chosen === i ? " tc-flight--open" : ""}`}>
              <button type="button" className="tc-flight__main tc-dates__row" aria-expanded={chosen === i} onClick={() => setChosen(chosen === i ? null : i)}>
                <span className="tc-dates__dates">
                  <span className="tc-strong tc-block">
                    {formatDate(p.depart)} → {formatDate(p.return)}
                  </span>
                  <span className="tc-muted tc-small">{p.nights} nights</span>
                </span>
                <span className="tc-dates__airlines tc-muted tc-small">
                  Out: {p.outbound.airline} {p.outbound.depart} · {p.outbound.stops ? "1 stop" : "non-stop"}
                  <br />
                  Back: {p.inbound.airline} {p.inbound.depart} · {p.inbound.stops ? "1 stop" : "non-stop"}
                </span>
                <span className="tc-flight__tags">
                  {i === 0 ? <span className="tc-chip tc-chip--cheap">Cheapest</span> : null}
                  {parseInt(p.savingVsAverage) > 0 ? <span className="tc-chip tc-chip--fast">{p.savingVsAverage} below avg</span> : null}
                </span>
                <span className="tc-price">{formatPrice(p.total, props.currency)}</span>
                <ChevronDown size={16} className="tc-flight__chev" />
              </button>
              {chosen === i ? (
                <ItineraryPanel
                  key={`${p.depart}-${p.return}-${stops}`}
                  nested
                  legs={[
                    { origin: props.origin, destination: props.destination, date: p.depart },
                    { origin: backFrom, destination: backTo, date: p.return },
                  ]}
                  adults={props.adults}
                  cabin={props.cabin}
                  currency={props.currency}
                  maxStops={stops === "any" ? undefined : Number(stops)}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const TripDates = defineComponent({
  name: "TripDates",
  description:
    "Cheapest departure/return date pairs for a round trip or open-jaw trip in a month with a stay of minNights–maxNights. Loads prices itself. Users switch months, filter stops, open a date pair and pick both flights, all in place. For open-jaw set returnFrom/returnTo.",
  props: z.object({
    origin: z.string(),
    destination: z.string(),
    month: z.string(),
    minNights: z.number(),
    maxNights: z.number(),
    currency,
    adults: z.number().optional(),
    cabin: cabin.optional(),
    maxStops: z.number().optional(),
    returnFrom: z.string().optional(),
    returnTo: z.string().optional(),
  }),
  component: ({ props }) =>
    props.origin && props.destination && /^\d{4}-\d{2}$/.test(props.month ?? "") && props.minNights && props.maxNights ? (
      <TripDatesPanel
        key={`${props.origin}-${props.destination}-${props.month}-${props.minNights}-${props.maxNights}`}
        origin={props.origin}
        destination={props.destination}
        month={props.month}
        minNights={props.minNights}
        maxNights={props.maxNights}
        returnFrom={props.returnFrom}
        returnTo={props.returnTo}
        adults={props.adults ?? 1}
        cabin={props.cabin ?? "economy"}
        currency={props.currency ?? "INR"}
        maxStops={props.maxStops}
      />
    ) : (
      <Loading>Comparing date pairs…</Loading>
    ),
});

// ── Insights ─────────────────────────────────────────────────────────────

const INSIGHT_ICONS = {
  festival: PartyPopper,
  price: TrendingDown,
  crowd: UsersIcon,
  weather: CloudSun,
  tip: Lightbulb,
} as const;

export const TravelInsights = defineComponent({
  name: "TravelInsights",
  description:
    "2-4 short, grounded travel insights. kind: festival (events from tool `events`), price (cheapest weekday, cheaper nearby date, festival surcharge), crowd, weather, tip (booking window). title ≤ 6 words; detail one sentence with the specific dates or numbers from the tools.",
  props: z.object({
    items: z.array(
      z.object({
        kind: z.enum(["festival", "price", "crowd", "weather", "tip"]),
        title: z.string(),
        detail: z.string(),
      }),
    ),
  }),
  component: ({ props }) => (
    <div className="tc-insights" role="list" aria-label="Good to know">
      {(props.items ?? []).map((item, i) => {
        const Icon = INSIGHT_ICONS[item?.kind as keyof typeof INSIGHT_ICONS] ?? Lightbulb;
        return (
          <div key={i} className={`tc-insight tc-insight--${item?.kind ?? "tip"}`} role="listitem">
            <Icon size={16} aria-hidden />
            <div>
              <div className="tc-strong">{item?.title}</div>
              <div className="tc-muted tc-small">{item?.detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  ),
});

// ── Itinerary ────────────────────────────────────────────────────────────

export const DayPlan = defineComponent({
  name: "DayPlan",
  description:
    "One day of an itinerary: a short theme plus what to do in the morning, afternoon and evening, and an optional local tip.",
  props: z.object({
    day: z.number(),
    title: z.string(),
    morning: z.string(),
    afternoon: z.string(),
    evening: z.string(),
    tip: z.string().optional(),
  }),
  component: ({ props }) => {
    const [open, setOpen] = useState(true);
    return (
      <li className="tc-day">
        <button type="button" className="tc-day__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="tc-day__badge">Day {props.day}</span>
          <span className="tc-strong">{props.title}</span>
          <ChevronDown size={16} className="tc-day__chev" />
        </button>
        {open ? (
          <div className="tc-day__body">
            <dl className="tc-day__slots">
              <dt>Morning</dt>
              <dd>{props.morning}</dd>
              <dt>Afternoon</dt>
              <dd>{props.afternoon}</dd>
              <dt>Evening</dt>
              <dd>{props.evening}</dd>
            </dl>
            {props.tip ? <div className="tc-day__tip">Tip: {props.tip}</div> : null}
          </div>
        ) : null}
      </li>
    );
  },
});

export const TripItinerary = defineComponent({
  name: "TripItinerary",
  description:
    "A day-by-day trip plan; users can collapse and expand days. Define each DayPlan as its own reference so days stream in one at a time.",
  props: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    days: z.array(DayPlan.ref),
  }),
  component: ({ props, renderNode }) => (
    <div className="tc-panel">
      <div>
        <div className="tc-panel__title">{props.title}</div>
        {props.subtitle ? <div className="tc-muted">{props.subtitle}</div> : null}
      </div>
      <ol className="tc-days">{renderNode(props.days)}</ol>
      <div className="tc-row">
        <AskButton prompt={`Rework this itinerary at a slower, more relaxed pace: ${props.title}`}>Slower pace</AskButton>
        <AskButton prompt={`Rework this itinerary to cost less: ${props.title}`}>Cheaper version</AskButton>
      </div>
    </div>
  ),
});

// ── Helpers ──────────────────────────────────────────────────────────────

function gradientFor(code: string) {
  let h = 0;
  for (const c of code ?? "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 50) % 360} 75% 45%))`;
}

function heat(t: number) {
  // green (cheap) → amber → red (expensive), kept light so text stays readable
  const hue = 140 - t * 130;
  return `hsl(${hue} 70% 50% / 0.22)`;
}

function compactPrice(value: number, currency: string) {
  const symbol = currency === "INR" ? "₹" : currency === "EUR" ? "€" : "$";
  return value >= 10000 ? `${symbol}${Math.round(value / 1000)}k` : `${symbol}${value}`;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function monthLabel(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month ?? "")) return "";
  return new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function shiftDay(date: string, delta: number) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + delta * 86_400_000).toISOString().slice(0, 10);
}

function nextMonth() {
  return shiftMonth(new Date().toISOString().slice(0, 7), 1);
}
