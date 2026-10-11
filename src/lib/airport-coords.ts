/**
 * Browser-side airport coordinates for the maps: a light { IATA: [lat, lon] } file (~40 KB
 * gzipped), loaded on first use and shared by every map.
 */
export type Coords = Record<string, [number, number]>;

let coordsPromise: Promise<Coords> | null = null;

export function loadAirportCoords(): Promise<Coords> {
  coordsPromise ??= import("@/data/airport-coords.json").then(
    (mod) => ((mod as { default?: unknown }).default ?? mod) as Coords,
  );
  return coordsPromise;
}
