/**
 * Festivals, holidays and big events that change prices or crowds. Demo data with approximate
 * windows (month-day, recurring yearly); swap for a real events feed later. The fare model in
 * travel-data.ts uses `fareImpact`, so insights and prices stay consistent.
 */

export interface TravelEvent {
  name: string;
  /** Destination IATA code, or "IN" for holidays that move fares on routes touching India. */
  where: string;
  /** Inclusive MM-DD window; may wrap the year end (e.g. 12-20 → 01-02). */
  start: string;
  end: string;
  /** Multiplier applied to fares on dates inside the window (1 = no effect). */
  fareImpact: number;
  crowds: "very busy" | "busy" | "quieter";
  note: string;
}

export const EVENTS: TravelEvent[] = [
  // Indian holidays that move fares on any route touching India
  { name: "Diwali holidays", where: "IN", start: "10-28", end: "11-12", fareImpact: 1.35, crowds: "very busy", note: "Domestic and short-haul fares jump around Diwali week; book early." },
  { name: "Christmas–New Year holidays", where: "IN", start: "12-20", end: "01-02", fareImpact: 1.3, crowds: "very busy", note: "Peak family travel; fares and hotel rates are at their highest." },
  { name: "Summer school holidays", where: "IN", start: "05-10", end: "06-15", fareImpact: 1.15, crowds: "busy", note: "Family travel peak out of Indian cities." },
  { name: "Holi long weekend", where: "IN", start: "03-01", end: "03-25", fareImpact: 1.08, crowds: "busy", note: "Short-break demand rises around Holi (date varies, usually March)." },

  // Goa
  { name: "Sunburn Festival", where: "GOI", start: "12-27", end: "12-30", fareImpact: 1.25, crowds: "very busy", note: "Asia's big EDM festival; North Goa hotels sell out." },
  { name: "Goa Carnival", where: "GOI", start: "02-05", end: "02-12", fareImpact: 1.1, crowds: "busy", note: "Parades in Panjim and Margao before Lent (dates shift yearly)." },
  { name: "Monsoon low season", where: "GOI", start: "06-10", end: "09-15", fareImpact: 0.8, crowds: "quieter", note: "Many beach shacks close, but hotels discount heavily." },
  // Leh
  { name: "Hemis Festival", where: "IXL", start: "06-20", end: "07-10", fareImpact: 1.1, crowds: "busy", note: "Masked dances at Hemis Monastery (lunar calendar)." },
  { name: "Ladakh Festival", where: "IXL", start: "09-20", end: "09-26", fareImpact: 1.05, crowds: "busy", note: "Cultural week in Leh as the season winds down." },
  // Jaipur
  { name: "Jaipur Literature Festival", where: "JAI", start: "01-22", end: "01-27", fareImpact: 1.15, crowds: "very busy", note: "Hotels near the venue book out months ahead." },
  { name: "Teej festival", where: "JAI", start: "07-25", end: "08-10", fareImpact: 1.0, crowds: "busy", note: "Processions in the old city during the monsoon." },
  // Kochi
  { name: "Kochi-Muziris Biennale", where: "COK", start: "12-12", end: "03-31", fareImpact: 1.05, crowds: "busy", note: "Contemporary art across Fort Kochi (runs in alternate years)." },
  { name: "Onam", where: "COK", start: "08-25", end: "09-10", fareImpact: 1.15, crowds: "busy", note: "Kerala's harvest festival: boat races and sadya feasts." },
  // Dubai
  { name: "Dubai Shopping Festival", where: "DXB", start: "12-15", end: "01-29", fareImpact: 1.15, crowds: "very busy", note: "City-wide sales and fireworks; hotels pricier on weekends." },
  { name: "Summer low season", where: "DXB", start: "06-15", end: "08-31", fareImpact: 0.82, crowds: "quieter", note: "40°C+ heat, but the lowest hotel rates of the year." },
  // Singapore
  { name: "Singapore Grand Prix", where: "SIN", start: "09-25", end: "10-05", fareImpact: 1.25, crowds: "very busy", note: "Night-race weekend: hotel prices can triple." },
  { name: "Chinese New Year", where: "SIN", start: "01-28", end: "02-12", fareImpact: 1.15, crowds: "busy", note: "Chinatown light-ups; some shops close for 2-3 days." },
  // Bangkok / Phuket
  { name: "Songkran water festival", where: "BKK", start: "04-12", end: "04-16", fareImpact: 1.25, crowds: "very busy", note: "Thai New Year street water fights; book well ahead." },
  { name: "Loy Krathong", where: "BKK", start: "11-10", end: "11-20", fareImpact: 1.08, crowds: "busy", note: "Floating lanterns on the full moon of November." },
  { name: "Songkran water festival", where: "HKT", start: "04-12", end: "04-16", fareImpact: 1.2, crowds: "very busy", note: "Patong gets packed; ferries book out." },
  { name: "Phuket Vegetarian Festival", where: "HKT", start: "10-08", end: "10-18", fareImpact: 1.05, crowds: "busy", note: "Street processions in Phuket Town (lunar calendar)." },
  // Bali
  { name: "Nyepi (Day of Silence)", where: "DPS", start: "03-08", end: "03-10", fareImpact: 1.0, crowds: "quieter", note: "Bali airport closes for 24 hours and everyone stays indoors (date varies)." },
  { name: "Bali Arts Festival", where: "DPS", start: "06-13", end: "07-12", fareImpact: 1.1, crowds: "busy", note: "Month of dance and music in Denpasar; peak dry season." },
  // Maldives / Sri Lanka / Nepal
  { name: "Festive peak", where: "MLE", start: "12-18", end: "01-08", fareImpact: 1.3, crowds: "very busy", note: "Resorts charge peak rates with minimum stays." },
  { name: "Sinhala & Tamil New Year", where: "CMB", start: "04-12", end: "04-15", fareImpact: 1.1, crowds: "busy", note: "Many locals travel home; some businesses close." },
  { name: "Kandy Esala Perahera", where: "CMB", start: "07-28", end: "08-10", fareImpact: 1.12, crowds: "very busy", note: "Ten nights of torch-lit processions in Kandy." },
  { name: "Dashain & Tihar", where: "KTM", start: "10-01", end: "11-05", fareImpact: 1.15, crowds: "very busy", note: "Nepal's biggest festivals overlap peak trekking season." },
  // Japan / Korea
  { name: "Cherry blossom season", where: "HND", start: "03-22", end: "04-10", fareImpact: 1.3, crowds: "very busy", note: "Hotels in Tokyo and Kyoto sell out; book 2-3 months ahead." },
  { name: "Golden Week", where: "HND", start: "04-28", end: "05-06", fareImpact: 1.35, crowds: "very busy", note: "Japan's biggest holiday week: avoid if you can." },
  { name: "Autumn foliage", where: "HND", start: "11-05", end: "11-30", fareImpact: 1.1, crowds: "busy", note: "Momiji season in Tokyo's parks and nearby Nikko." },
  { name: "Chuseok", where: "ICN", start: "09-23", end: "09-28", fareImpact: 1.15, crowds: "busy", note: "Korean harvest holiday: domestic travel peaks, some shops close." },
  { name: "Cherry blossoms", where: "ICN", start: "04-01", end: "04-12", fareImpact: 1.1, crowds: "busy", note: "Yeouido and Seokchon Lake festivals." },
  // Europe
  { name: "Istanbul Tulip Festival", where: "IST", start: "04-01", end: "04-30", fareImpact: 1.05, crowds: "busy", note: "Millions of tulips in Emirgan Park." },
  { name: "Paris Fashion Week", where: "CDG", start: "09-26", end: "10-06", fareImpact: 1.15, crowds: "busy", note: "Hotel rates rise across central Paris." },
  { name: "Christmas markets", where: "CDG", start: "11-25", end: "12-31", fareImpact: 1.1, crowds: "busy", note: "Festive markets; short days and cold." },
  { name: "Wimbledon", where: "LHR", start: "06-29", end: "07-12", fareImpact: 1.1, crowds: "busy", note: "Hotels in south-west London fill up." },
  { name: "Notting Hill Carnival", where: "LHR", start: "08-29", end: "08-31", fareImpact: 1.05, crowds: "very busy", note: "Europe's biggest street party, bank-holiday weekend." },
  { name: "Easter", where: "FCO", start: "03-28", end: "04-08", fareImpact: 1.2, crowds: "very busy", note: "Vatican crowds peak around Holy Week (date varies)." },
  { name: "Mobile World Congress", where: "BCN", start: "03-01", end: "03-05", fareImpact: 1.3, crowds: "very busy", note: "Hotel prices can triple during the congress." },
  { name: "La Mercè festival", where: "BCN", start: "09-20", end: "09-25", fareImpact: 1.08, crowds: "busy", note: "Barcelona's city festival: human towers and fireworks." },
  { name: "Santo António festivities", where: "LIS", start: "06-10", end: "06-14", fareImpact: 1.12, crowds: "very busy", note: "Sardines and street parties in Alfama." },
  { name: "Web Summit", where: "LIS", start: "11-09", end: "11-13", fareImpact: 1.2, crowds: "busy", note: "Tech conference fills Lisbon's hotels." },
  { name: "Ski season peak", where: "ZRH", start: "12-20", end: "01-06", fareImpact: 1.25, crowds: "very busy", note: "Alpine resorts at peak rates." },
  // Americas / Oceania / Africa
  { name: "Thanksgiving", where: "JFK", start: "11-24", end: "11-30", fareImpact: 1.2, crowds: "very busy", note: "Macy's parade; US domestic travel peaks." },
  { name: "Holiday season", where: "JFK", start: "12-15", end: "01-02", fareImpact: 1.25, crowds: "very busy", note: "Rockefeller tree and Times Square New Year; hotels at peak." },
  { name: "New Year's Eve fireworks", where: "SYD", start: "12-26", end: "01-02", fareImpact: 1.3, crowds: "very busy", note: "Harbour fireworks: harbour-view rooms book a year out." },
  { name: "Vivid Sydney", where: "SYD", start: "05-22", end: "06-14", fareImpact: 1.05, crowds: "busy", note: "Light installations around the harbour." },
  { name: "Summer holidays", where: "CPT", start: "12-15", end: "01-15", fareImpact: 1.2, crowds: "very busy", note: "South African school holidays: beaches and wine farms busy." },
];

const md = (date: string) => date.slice(5, 10); // YYYY-MM-DD → MM-DD

function inWindow(mmdd: string, e: TravelEvent) {
  return e.start <= e.end ? mmdd >= e.start && mmdd <= e.end : mmdd >= e.start || mmdd <= e.end;
}

/** Events affecting a trip to `destination` on `date`; `india` adds Indian holidays. */
export function eventsOn(destination: string, date: string, india: boolean): TravelEvent[] {
  const mmdd = md(date);
  return EVENTS.filter((e) => (e.where === destination || (india && e.where === "IN")) && inWindow(mmdd, e));
}

/** Events overlapping a calendar month (YYYY-MM) for a destination. */
export function eventsInMonth(destination: string, month: string, india: boolean): (TravelEvent & { dates: string })[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = new Map<TravelEvent, string[]>();
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    for (const e of eventsOn(destination, date, india)) out.set(e, [...(out.get(e) ?? []), date]);
  }
  return [...out.entries()].map(([e, dates]) => ({ ...e, dates: `${fmt(dates[0])}–${fmt(dates[dates.length - 1])}` }));
}

const fmt = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** Strongest fare multiplier from events on a date (1 when none). */
export function eventFareFactor(destination: string, date: string, india: boolean) {
  const factors = eventsOn(destination, date, india).map((e) => e.fareImpact);
  if (!factors.length) return 1;
  // A peak event outweighs a low-season discount on the same day.
  return Math.max(...factors) > 1 ? Math.max(...factors) : Math.min(...factors);
}

/** Short, model-friendly description of an event's effect. */
export function describeEvent(e: TravelEvent & { dates?: string }) {
  const impact =
    e.fareImpact > 1.01
      ? `fares about ${Math.round((e.fareImpact - 1) * 100)}% higher`
      : e.fareImpact < 0.99
        ? `fares about ${Math.round((1 - e.fareImpact) * 100)}% lower`
        : "little effect on fares";
  return { name: e.name, dates: e.dates, crowds: e.crowds, effect: impact, note: e.note };
}
