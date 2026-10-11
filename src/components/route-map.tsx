"use client";

/**
 * Lightweight route map: country outlines (Natural Earth 1:110m via world-atlas, ~100 KB,
 * loaded once) drawn as SVG with d3-geo, plus airport pins and great-circle arcs. No map tiles,
 * no WebGL, nothing to time out; it follows the chat theme through CSS variables.
 */

import { geoMercator, geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, LineString, Point } from "geojson";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { loadAirportCoords, type Coords } from "@/lib/airport-coords";

export interface MapPoint {
  code: string;
  role: "origin" | "destination" | "stop";
  /** Short text next to the code, e.g. a price. */
  badge?: string;
}

export interface MapRoute {
  from: string;
  to: string;
  via?: string | null;
}

interface World {
  land: Feature<Geometry, GeoJsonProperties>[];
  borders: Geometry;
}

// Loaded once per page and shared by every map.
let worldPromise: Promise<World> | null = null;
function loadWorld() {
  worldPromise ??= import("world-atlas/countries-110m.json").then((mod) => {
    const topo = ((mod as { default?: unknown }).default ?? mod) as unknown as Topology<{ countries: GeometryCollection }>;
    return {
      land: (feature(topo, topo.objects.countries) as FeatureCollection).features,
      borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
    };
  });
  return worldPromise;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function RouteMap({
  points,
  routes,
  selected,
  onSelect,
  height = 240,
  label,
}: {
  points: MapPoint[];
  routes: MapRoute[];
  selected?: string | null;
  onSelect?: (code: string) => void;
  height?: number;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [world, setWorld] = useState<World | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    let alive = true;
    loadWorld()
      .then((w) => alive && setWorld(w))
      .catch((error) => console.warn("[map] could not load outlines", error));
    loadAirportCoords()
      .then((c) => alive && setCoords(c))
      .catch((error) => console.warn("[map] could not load airports", error));
    return () => {
      alive = false;
    };
  }, []);

  // Names the model passed instead of codes ("Surat") are resolved once via /api/airports.
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const names = [...points.map((p) => p.code), ...routes.flatMap((r) => [r.from, r.to, r.via ?? ""])].filter(Boolean);
  const unknown = coords ? [...new Set(names.filter((n) => !coords[n.toUpperCase()] && !(n in aliases)))] : [];
  const unknownKey = unknown.join("|");
  useEffect(() => {
    if (!unknownKey) return;
    let alive = true;
    const qs = unknownKey.split("|").map((n) => `q=${encodeURIComponent(n)}`).join("&");
    fetch(`/api/airports?${qs}`)
      .then((r) => r.json())
      .then((found: Record<string, string | null>) => {
        if (!alive) return;
        setAliases((a) => ({ ...a, ...Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v ?? ""])) }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [unknownKey]);

  const codeOf = (name?: string | null) => (name ? (aliases[name] || name).toUpperCase() : "");
  const has = (code?: string | null) => Boolean(code && coords?.[codeOf(code)]);
  const seen = new Set<string>();
  const known = points.filter((p) => {
    const code = codeOf(p.code);
    if (!has(p.code) || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
  const pointsKey = JSON.stringify(known);
  const routesKey = JSON.stringify(routes);

  const layout = useMemo(() => {
    if (!width || !coords || !known.length) return null;
    const coord = (code: string) => {
      const [lat, lon] = coords[codeOf(code)];
      return [lon, lat] as [number, number];
    };
    const arcs: { feature: Feature<LineString>; active: boolean }[] = routes.flatMap((r) => {
      const legs = r.via && has(r.via) ? [[r.from, r.via], [r.via, r.to]] : [[r.from, r.to]];
      return legs
        .filter(([a, b]) => has(a) && has(b))
        .map(([a, b]) => ({
          feature: {
            type: "Feature" as const,
            properties: {},
            geometry: { type: "LineString" as const, coordinates: [coord(a), coord(b)] },
          },
          active: !selected || selected === r.to,
        }));
    });

    // Frame every point and arc, with a minimum span so short hops aren't over-zoomed.
    const lons = known.map((p) => coord(p.code)[0]);
    const lats = known.map((p) => coord(p.code)[1]);
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2;
    const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
    const span = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats));
    const minHalf = 7;
    const framing: Feature<Point>[] = [
      [cx - minHalf, cy - minHalf],
      [cx + minHalf, cy + minHalf],
    ].map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } }));
    const fitTo: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        ...framing,
        ...known.map((p) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: coord(p.code) },
        })),
        ...arcs.map((a) => a.feature),
      ],
    };
    // Mercator reads naturally for regional trips; long-haul routes need a world projection.
    const projection: GeoProjection = (span > 70 ? geoNaturalEarth1() : geoMercator())
      .fitExtent(
        [
          [28, 34],
          [width - 28, height - 14],
        ],
        fitTo,
      )
      .clipExtent([
        [0, 0],
        [width, height],
      ]);
    const path = geoPath(projection);
    const labels: { left: number; top: number; width: number }[] = [];
    const pins = known.map((p) => {
      const [x, y] = projection(coord(p.code)) ?? [0, 0];
      const code = codeOf(p.code);
      const text = p.badge ? `${code} · ${p.badge}` : code;
      const labelWidth = Math.min(width - 12, text.length * 6.6 + 14);
      const labelX = Math.max(labelWidth / 2 + 6, Math.min(width - labelWidth / 2 - 6, x));
      const left = labelX - labelWidth / 2;
      const candidates = [-28, -52, 8, 32, -76].map((offset) => Math.max(6, Math.min(height - 26, y + offset)));
      const top = candidates.find((candidate) => labels.every((box) =>
        left + labelWidth + 4 <= box.left || box.left + box.width + 4 <= left ||
        candidate + 24 <= box.top || box.top + 24 <= candidate,
      )) ?? candidates[0];
      labels.push({ left, top, width: labelWidth });
      return { ...p, code, x, y, city: p.code, text, labelWidth, labelX: labelX - x, labelY: top - y };
    });
    return {
      path,
      arcs: arcs.map((a) => ({ d: path(a.feature) ?? "", active: a.active })),
      pins,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, coords, aliases, pointsKey, routesKey, selected]);

  return (
    <div ref={ref} className="tc-map" style={{ height }} role="group" aria-label={label}>
      {layout ? (
        <svg width={width} height={height} className="tc-map__svg">
          {world ? (
            <g aria-hidden>
              {world.land.map((f, i) => (
                <path key={i} d={layout.path(f) ?? ""} className="tc-map__land" />
              ))}
              <path d={layout.path(world.borders) ?? ""} className="tc-map__borders" />
            </g>
          ) : null}
          {layout.arcs.map((a, i) => (
            <path key={i} d={a.d} className={`tc-map__arc${a.active ? " tc-map__arc--active" : ""}`} aria-hidden />
          ))}
          {layout.pins.map((p) => {
            const clickable = p.role === "destination" && Boolean(onSelect);
            const className = `tc-pin tc-pin--${p.role}${selected === p.code ? " tc-pin--selected" : ""}`;
            const name = `${p.city} (${p.code})${p.badge ? `, ${p.badge}` : ""}`;
            return (
              <g
                key={p.code}
                transform={`translate(${p.x},${p.y})`}
                className={className}
                role={clickable ? "button" : "img"}
                tabIndex={clickable ? 0 : undefined}
                aria-label={name}
                aria-pressed={clickable ? selected === p.code : undefined}
                onClick={clickable ? () => onSelect!(p.code) : undefined}
                onKeyDown={
                  clickable
                    ? (e: KeyboardEvent<SVGGElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect!(p.code);
                        }
                      }
                    : undefined
                }
              >
                <line x1={0} y1={0} x2={p.labelX} y2={p.labelY < 0 ? p.labelY + 20 : p.labelY} className="tc-pin__leader" aria-hidden />
                <circle r={3.5} className="tc-pin__dot" />
                <rect x={p.labelX - p.labelWidth / 2} y={p.labelY} width={p.labelWidth} height={20} rx={6} className="tc-pin__label" />
                <text x={p.labelX} y={p.labelY + 13.5} textAnchor="middle" className="tc-pin__text">
                  {p.text}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
      <span className="tc-map__credit">Natural Earth</span>
    </div>
  );
}
