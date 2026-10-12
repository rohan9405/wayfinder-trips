/**
 * Entry rules for Indian passport holders, by ISO country code, as of Oct 2026. Rules change
 * often, so answers say "check before booking" and the tools pass `checked` along.
 */
export type VisaKind = "domestic" | "none" | "visa_free" | "on_arrival" | "e_visa" | "required";

export const VISA_CHECKED = "Oct 2026";

const RULES: Record<string, { kind: VisaKind; note: string }> = {
  IN: { kind: "domestic", note: "Domestic trip" },
  NP: { kind: "none", note: "No visa needed for Indian citizens" },
  BT: { kind: "none", note: "No visa; entry permit and daily SDF fee" },
  TH: { kind: "visa_free", note: "Visa-free for tourism" },
  MY: { kind: "visa_free", note: "Visa-free up to 30 days" },
  MV: { kind: "visa_free", note: "Free 30-day visa on arrival for all nationalities" },
  LK: { kind: "visa_free", note: "Visa-free; apply for the free ETA online first" },
  MU: { kind: "visa_free", note: "Visa-free up to 90 days" },
  SC: { kind: "visa_free", note: "Visa-free; visitor permit on arrival" },
  KZ: { kind: "visa_free", note: "Visa-free up to 14 days" },
  PH: { kind: "visa_free", note: "Visa-free up to 14 days" },
  ID: { kind: "on_arrival", note: "Visa on arrival or e-VOA (paid, 30 days)" },
  KH: { kind: "on_arrival", note: "Visa on arrival or e-visa" },
  LA: { kind: "on_arrival", note: "Visa on arrival" },
  VN: { kind: "e_visa", note: "e-visa, apply online before travel" },
  JP: { kind: "e_visa", note: "e-visa, apply before travel" },
  TR: { kind: "required", note: "Visa needed (e-visa only with a valid US, UK or Schengen visa)" },
  AE: { kind: "required", note: "Visa needed (on arrival only with a valid US, UK or EU visa or residence)" },
  SG: { kind: "required", note: "Visa needed, via an authorised agent" },
  KR: { kind: "required", note: "Visa needed" },
  GB: { kind: "required", note: "UK visitor visa needed" },
  IE: { kind: "required", note: "Irish visa needed (separate from Schengen)" },
  US: { kind: "required", note: "US visitor visa needed" },
  AU: { kind: "required", note: "Visitor visa needed" },
  ZA: { kind: "required", note: "Visa needed" },
};
const SCHENGEN = ["FR", "IT", "ES", "PT", "NL", "CH", "DE", "GR", "AT", "CZ", "BE", "DK", "SE", "NO", "FI", "PL", "HU"];
for (const c of SCHENGEN) RULES[c] = { kind: "required", note: "Schengen visa needed" };

export function visaFor(countryCode: string) {
  return RULES[countryCode] ?? { kind: "required" as VisaKind, note: "Check visa rules" };
}

/** `visa_free` keeps trips with no visa to arrange; `easy` adds visa on arrival. */
export function visaMatches(kind: VisaKind, filter: "visa_free" | "easy") {
  const free = kind === "domestic" || kind === "none" || kind === "visa_free";
  return filter === "visa_free" ? free : free || kind === "on_arrival";
}
