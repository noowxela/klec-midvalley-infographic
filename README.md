# Mid Valley – Abdullah Hukum transit hub · 3D site analysis (demo 0.1)

An interactive, chaptered 3D infographic of the rail-and-mall cluster around
Abdullah Hukum LRT, KL Eco City, The Gardens Mall, Mid Valley Megamall and
Mid Valley KTM in Kuala Lumpur. All geometry comes from OpenStreetMap; the
model is **illustrative block massing**, not a survey.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173/
npm run build      # type-check (tsc) + production build into dist/
npm run preview    # serve dist/ on http://127.0.0.1:4173/
```

Deep links: `?chapter=0|1|3|5`, `?theme=dark`.
Keys: → / ↓ / Space next chapter, ← / ↑ previous, Home cover, F fullscreen
(ignored while a slider or input has focus). Drag to rotate, scroll to zoom,
right-drag to pan, RESET VIEW returns to the chapter camera.

## Stack

Vite + vanilla TypeScript + Three.js (OrbitControls, BufferGeometryUtils).
IBM Plex Sans / Mono bundled via @fontsource (no external requests).
A fixed 1920×1080 stage is scaled to fit the window.

## Data

| file | what |
| --- | --- |
| `scripts/config.mjs` | study-area centre (3.1180 N, 101.6758 E) and 1 km × 1 km bbox |
| `scripts/fetch-osm.mjs` | Overpass query (saved to `raw/overpass-query.overpassql`), raw result in `raw/overpass.json` |
| `scripts/process-osm.mjs` | projects to a local metric frame (x east, y north, metres), builds `src/data/*.json`, computes heights, pedestrian routes and stats |

Re-pull: `npm run data:fetch && npm run data:process`.

Heights: OSM `height` → `heightSource: "osm"`; else `building:levels × 3.5 m`
→ `"levels"`; else a placeholder (5 m roofs, 9 m commercial/industrial/religious,
7 m otherwise, or the parent outline's levels for untagged building parts)
→ `"estimate"` (with `heightNote` when inherited).

Routes: Dijkstra over OSM footway/steps/corridor/path ways (roads only as a
1.8× costlier fallback, unused in the current result), endpoints snapped to the
nearest pedestrian node. Walking time = distance ÷ 80 m/min.

Map data © OpenStreetMap contributors, ODbL.

## Screenshots

`npm run build && npx vite preview --port 4173 &` then `npm run shots`
(uses local Google Chrome via puppeteer-core; also checks console errors and
keyboard handling). Output in `shots/` (git-ignored).
