// 05 Connections cutaway: OSM below-ground roads (highway ways tagged tunnel=yes or layer<0), their kind and estimated depth.
import { lines, areas, type XY } from './data';

export const CUT_KINDS = ['klec', 'midvalley', 'moto', 'other'] as const;
export type CutKind = (typeof CUT_KINDS)[number];

/** Estimated depth below ground: 4.5 m per OSM layer step (layer 0 tunnels count as -1). OSM gives the level order, not the depth. */
export const cutDepth = (layer: number) => 4.5 * Math.max(1, Math.abs(Math.min(0, layer)));

const inRing = (m: XY, ring: XY[]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > m[1]) !== (yj > m[1]) && m[0] < ((xj - xi) * (m[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };

/** OSM name 'Lorong Motosikal …' (Federal Highway motorcycle lane), else the OSM landuse precinct its midpoint lies in (KL Eco City / Mid Valley City), else other. */
export function cutKind(r: { name: string | null; pts: XY[] }): CutKind {
  if (/^Lorong Motosikal/.test(r.name || '')) return 'moto';
  const m = r.pts[Math.floor(r.pts.length / 2)];
  const pr = (name: string) => areas.precincts.find((p) => p.name === name);
  const k = pr('KL Eco City'), v = pr('Mid Valley City');
  return k && inRing(m, k.ring) ? 'klec' : v && inRing(m, v.ring) ? 'midvalley' : 'other';
}

export const underRoads = lines.roads.filter((r) => r.tunnel || r.layer < 0);
export const wayLength = (pts: XY[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
