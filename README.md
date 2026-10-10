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

## v2 (demo 0.2)

- **Cited heights**: `scripts/height-sources.json` → applied in `scripts/process-osm.mjs` as `heightSource: "cited"` with a `heightRef` (value, unit, floors, storey height, publisher, URL, fetch date). Full table and limitations: `docs/height-sources.md`.
- **New chapters**: 06 Walking routes, 07 Sun & shade (NOAA solar position, real shadow map, raycast sidewalk shade), 08 Rain & monsoon (covered vs open-air pedestrian ways; climate normals from the cited WMO table in `src/data/climate.json`).
- **Languages**: English, 简体中文 (zh-Hans, Malaysia), Bahasa Malaysia. Switch in the top bar, `?lang=en|zh|ms`, remembered in localStorage (`mv-lang`).

### Adding or changing a UI string

1. Add the key to `src/i18n/en.ts` (this file defines the `Dict` type). Use a function when the text contains a computed number, e.g. `statFoo: (m: number) => \`${n(m)} m of footway\``; never type numbers into the text.
2. Add the same key to `src/i18n/zh.ts` and `src/i18n/ms.ts`. TypeScript (`npm run typecheck`) fails until every locale has it.
3. Use it via `t().section.key` (chapters are rebuilt on language change, so read `t()` inside `buildChapters()` or a panel, not at module load).
4. Static page chrome (top bar, credit, reset button) is set in `applyStaticText()` in `src/main.ts`.

Chinese glyphs come from `@fontsource/noto-sans-sc` (Simplified Chinese subset), imported dynamically only when `zh` is active; IBM Plex stays first in the stack so Latin text and digits keep the Plex look.
