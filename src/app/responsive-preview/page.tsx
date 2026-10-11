"use client";

// Temporary local layout fixture. Remove before the production build.
import { Renderer } from "@openuidev/react-lang";
import { ThemeProvider } from "@openuidev/react-ui";
import { library } from "@/library";
import { useState } from "react";

const cases = [
  ["Destinations", `root = Card([grid])
grid = DestinationGrid("BOM", [d1, d2, d3], "2026-11")
d1 = DestinationCard("SIN", "Singapore", "Singapore", "Hawker food, gardens and an easy first trip abroad", 25000, "INR", "February, March, April, July, August", "26–31°C, occasional showers")
d2 = DestinationCard("DPS", "Denpasar / Bali", "Indonesia", "Rice terraces, surf beaches and wellness retreats", 27000, "INR", "May, June, July, August, September")
d3 = DestinationCard("MLE", "Malé", "Maldives", "Overwater villas and clear water", 42000, "INR", "December, January, February, March, April")`],
  ["Calendar", `root = Card([cal])\ncal = PriceCalendar("BOM", "SIN", "2026-11", "INR")`],
  ["Flights", `root = Card([flights])\nflights = FlightResults("BOM", "SIN", "2026-11-17", 2, "economy", "INR")`],
  ["Date pairs", `root = Card([dates])\ndates = TripDates("BOM", "SIN", "2026-11", 5, 7, "INR", 2, "economy")`],
  ["Multi-city", `root = Card([trip])\ntrip = Itinerary([{origin: "BOM", destination: "SIN", date: "2026-11-17"}, {origin: "SIN", destination: "DPS", date: "2026-11-22"}, {origin: "DPS", destination: "BOM", date: "2026-11-27"}], 2, "economy", "INR", 1, "Mumbai → Singapore → Bali → Mumbai")`],
  ["Flight review", `root = Card([review])\nreview = FlightReview("OF-BOMSIN-20261117-E2INR-0")`],
  ["Budget", `root = Card([budget])\nbudget = TripBudget("BOM", "SIN", "2026-11", 6, 2, "mid", "INR")`],
  ["Day plan", `root = Card([plan, tips])
plan = TripItinerary("Singapore: gardens, neighbourhoods and food", "Six days for two travellers", [d1, d2])
d1 = DayPlan(1, "Gardens by the Bay and the waterfront", "Explore the conservatories and waterfront before lunch", "Visit Chinatown and the hawker centre", "Enjoy the light show by the Supertrees", "Bring water and take breaks during the hottest part of the day")
d2 = DayPlan(2, "Heritage neighbourhoods and local food", "Walk through Kampong Glam", "Explore Little India", "Try dinner at a hawker centre")
tips = TravelInsights([{kind: "tip", title: "Allow time between activities", detail: "Plan a relaxed lunch and use public transport between neighbourhoods."}, {kind: "weather", title: "Pack for tropical showers", detail: "Bring a small umbrella and lightweight clothes for warm, humid days."}])`],
  ["Charts and comparison table", `root = Card([header, bars, line, pie, area, horizontal, radar, radial, stack, table, next])
header = CardHeader("Compare destinations", "Sample display data for layout validation")
bars = BarChart(["Singapore", "Bali", "Maldives"], [series], "grouped", "Destination", "Estimated cost", 240)
line = LineChart(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], [fares], "linear", "Day", "Sample fare", 240)
pie = PieChart(["Flights", "Accommodation", "Food and activities"], [35000, 48000, 24000], "donut")
area = AreaChart(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], [fares], "linear", "Day", "Fare", 240)
horizontal = HorizontalBarChart(["Singapore", "Denpasar / Bali", "Malé, Maldives"], [series], "grouped", "Total budget", "Destination")
radar = RadarChart(["Beaches", "Culture", "Food", "Value", "Weather"], [scores])
scores = Series("Singapore", [2, 4, 5, 3, 4])
radial = RadialChart(["Flights", "Stay", "Activities"], [35, 48, 24])
stack = SingleStackedBarChart(["Flights", "Accommodation", "Food and activities"], [35000, 48000, 24000])
series = Series("Budget", [95000, 82000, 148000])
fares = Series("One-way fare", [23000, 21000, 21500, 22500, 27000, 26000, 24000])
table = Table([names, climate, costs])
names = Col("Destination", ["Singapore", "Denpasar / Bali", "Malé, Maldives"], "string")
climate = Col("Weather and travel notes", ["Warm, humid days with occasional tropical showers", "Beaches, rice terraces and mountain villages", "Warm tropical islands and clear water"], "string")
costs = Col("Total sample budget for two", [95000, 82000, 148000], "number")
next = FollowUpBlock([f1, f2])
f1 = FollowUpItem("Plan a relaxed six-day trip to Singapore with a budget")
f2 = FollowUpItem("Compare another destination for the same dates")`],
] as const;

export default function ResponsivePreview() {
  const [reader, setReader] = useState(false);
  return <ThemeProvider mode="dark"><main style={{ maxWidth: 800, margin: "0 auto", padding: 16, fontFamily: "var(--openui-font-body)", boxSizing: "border-box" }}>
    <h1 style={{ color: "var(--openui-text-neutral-primary)", fontSize: 22 }}>Local responsive fixtures</h1>
    <button onClick={() => setReader(true)}>Open sample read-only chat</button>
    {cases.map(([name, response]) => <section data-case={name} key={name} style={{ minWidth: 0, marginBottom: 32 }}>
      <h2 style={{ color: "var(--openui-text-neutral-primary)", fontSize: 18 }}>{name}</h2>
      <Renderer response={response} library={library} onAction={() => {}} />
    </section>)}
    {reader && <div className="wf-chat-overlay">
      <section className="wf-chat-reader" role="dialog" aria-label="Sample read-only chat">
        <header className="wf-chat-reader__header"><div><strong>A very long guest chat title about flights, dates and a six-day Singapore itinerary</strong><span>Guest A2DE26AB · Read only</span></div><button aria-label="Close chat" onClick={() => setReader(false)}>×</button></header>
        <div className="wf-chat-reader__messages"><div className="wf-chat-reader__message"><div className="wf-chat-reader__role">Wayfinder</div><div inert><Renderer response={cases[3][1]} library={library} onAction={() => {}} /></div></div></div>
      </section>
    </div>}
  </main></ThemeProvider>;
}
