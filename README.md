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

Deep links: `?chapter=0|1|2|4|6|7|8|9`, `?theme=dark`.
Keys: → / ↓ / Space next chapter, ← / ↑ previous, Home overview, F fullscreen, M map only (hide both panels)
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

Attribution in the app: one persistent credit, `© OpenStreetMap contributors`, sits in the bottom-right corner of
the map view and links to https://www.openstreetmap.org/copyright. It is the same text in every language, with a translated aria-label. It
lives outside the scaled 1920×1080 stage so it stays legible at any window size; on narrow or letterboxed windows it moves just
below the stage. The full wording (ODbL licence link, Overpass API fetch date, how heights are sourced) is in the
"Data" note in the 00 Overview side panel. Chapter source lines no longer repeat the OSM line; they keep only their own
method notes and non-OSM sources.

## Screenshots

`npm run build && npx vite preview --port 4173 &` then `npm run shots`
(uses local Google Chrome via puppeteer-core; also checks console errors and
keyboard handling). Output in `shots/` (git-ignored).

## v2 (demo 0.2)

- **Cited heights**: `scripts/height-sources.json` → applied in `scripts/process-osm.mjs` as `heightSource: "cited"` with a `heightRef` (value, unit, floors, storey height, publisher, URL, fetch date). Full table and limitations: `docs/height-sources.md`.
- **New chapters** (numbers as of v3): 07 Walking routes, 08 Sun & shade (NOAA solar position, real shadow map, raycast sidewalk shade), 09 Rain & monsoon (covered vs open-air pedestrian ways; climate normals from the cited WMO table in `src/data/climate.json`).
- **Languages**: English, 简体中文 (zh-Hans, Malaysia), Bahasa Malaysia. Switch in the top bar, `?lang=en|zh|ms`, remembered in localStorage (`mv-lang`).

### Adding or changing a UI string

1. Add the key to `src/i18n/en.ts` (this file defines the `Dict` type). Use a function when the text contains a computed number, e.g. `statFoo: (m: number) => \`${n(m)} m of footway\``; never type numbers into the text.
2. Add the same key to `src/i18n/zh.ts` and `src/i18n/ms.ts`. TypeScript (`npm run typecheck`) fails until every locale has it.
3. Use it via `t().section.key` (chapters are rebuilt on language change, so read `t()` inside `buildChapters()` or a panel, not at module load).
4. Static page chrome (top bar, credit, reset button) is set in `applyStaticText()` in `src/main.ts`.

Chinese glyphs come from `@fontsource/noto-sans-sc` (Simplified Chinese subset), imported dynamically only when `zh` is active; IBM Plex stays first in the stack so Latin text and digits keep the Plex look.

## v3 (demo 0.3)

Chapter numbering (plan numbers; unbuilt chapters are skipped in the tab bar, `?chapter=` takes these numbers):

| # | Chapter | Status |
|---|---|---|
| 00 | Overview: three precincts | built |
| 01 | Transit hub (cover) | built |
| 02 | Location | built |
| 03 | Timeline | planned |
| 04 | Massing | built |
| 05 | Uses | planned |
| 06 | Connections | built |
| 07 | Walking routes | built |
| 08 | Sun & shade | built |
| 09 | Rain & monsoon | built |

**Precinct rule (chapter 00)**, computed in `scripts/process-osm.mjs` (`zone` on each block, stats in `meta.zones`):
1. *The Gardens*: blocks named The Gardens Mall / North Tower / South Tower / St. Giles The Gardens Residences / The Gardens Hotel, or parts of an outline with one of those names (the towers are mapped as parts of the "The Gardens Mall" outline). The Gardens Hotel has no named OSM footprint.
2. *KL Eco City*: other blocks whose centroid is inside the OSM landuse polygon "KL Eco City".
3. *Mid Valley*: other blocks whose centroid is inside the OSM landuse polygon "Mid Valley City" (The Gardens lies inside it and is split out by rule 1).
Footprint per precinct = union of block footprints on a 1 m grid.

**Panels**: the text panel and side panel collapse with the chevron tabs on their inner edges; the top-bar button or **M** hides both. State is saved in localStorage (`mv-panels`) and kept across chapters; the 3D view recentres on the free space.

## v4: trains and landmark mosques

**Trains (`src/trains.ts`)**
- What runs: LRT Kelana Jaya trains only, on the two OSM track ways through the study area. The ways are chained into one continuous track per direction, resampled every metre and smoothed (plan ±4 m, deck height ramped over about 30 m, so there is no step where the deck goes from 9 m to 10.5 m).
- Map edges: each track is extended 160 m in a straight line past the map edge. Trains enter and leave there and are clipped at the study frame.
- Trainsets: repeating per track, 4-2-4 cars on track 1 and 2-4-4 cars on track 2. Cars are separate instances placed by their two bogie points on the track, so a train bends through curves.
- Car proportions (illustrative): 17 m car, 0.8 m gap, 2.65 m wide, 3.3 m tall, floor 0.45 m above the deck.
- Motion: cruise at 16 m/s (≈58 km/h), brake at 1.0 m/s², stop with the train centred on KJ17, dwell 15 s, accelerate at 1.0 m/s².
- Headway: 48 s per track, with track 2 offset by half a headway. This is compressed for the visual and is not a timetable.
- Spacing: every train on a track follows the same run profile shifted by the headway, so trains cannot overlap. The check script measured a minimum gap of about 200 m.
- Rendering: 4 instanced meshes (cab and middle bodies, window band, accent stripe) plus one dynamic LineSegments for the outlines. Nothing is allocated per frame, and an update takes about 0.005 ms.
- Theme colours: `--train-body`, `--train-window`, `--train-accent`.
- Clock: advances only while the page is visible, clamped to 0.1 s per frame.
- prefers-reduced-motion: trains are shown static, with one 4-car train standing at KJ17.
- Toggle: the top-bar trains button (aria-pressed), persisted in localStorage `mv-trains`. Trains are on by default and are hidden in chapters that hide the LRT line.
- Other lines: `chainWays` / `buildTrack` are generic and could take KTM/ERL chains. That is not enabled.
- Checks: `scripts/trains-check.mjs`.

**Landmark mosques (Overview)**
- Selection: OSM buildings named "Masjid Jamek Abdullah Hukum" (way/659511483) and "Masjid An Nur" (relation/12622827, alt_name "Balai Islam An-Nur TNB Bangsar"). Both are religion=muslim.
- An Nur: its footprint centroid is about 8 m west of the study square. It is drawn from its full OSM outline (already in the existing Overpass pull) but not counted in the study-area blocks, so all stats are unchanged.
- Masjid Jamek: OSM maps an unnamed 5-level building (way/594385371) whose outline encloses the mosque outline. On the Overview that building is drawn translucent so the mosque is visible.
- Colour: `--landmark` (warm charcoal in light theme, ivory in dark).
- Overview camera: turned (azimuth 0.2) so Masjid Jamek is not hidden behind the KL Eco City towers.

## v6: loading screen

- `index.html` carries an inline loader (critical CSS + markup + a small script) that paints before any bundle loads. Theme (`?theme`, then saved `mv-theme`, then `prefers-color-scheme`) and language (`?lang`, then `mv-lang`) are applied before first paint, so a saved dark theme or zh/ms never flashes light/English.
- The entry is `src/boot.ts`: it checks WebGL, then dynamically imports `main.ts`. Progress steps are real: application, map data (OSM JSON), 3D scene, fonts (Plex, and Noto Sans SC for zh), first frame.
- The loader hides only after fonts are ready (8 s cap), text is re-rendered and pins re-measured with the final fonts, stage scaling and the first camera are applied, and three frames have rendered. It then fades out over ~0.5 s (instant under `prefers-reduced-motion`).
- After 8 s a "taking longer than usual" note with a reload button appears. A missing WebGL or an init error (script load failure, uncaught error or rejection before ready) shows an error state with a reload button. All strings are in EN/zh/ms.
- Noto Sans SC now loads as unicode-range slices (`@fontsource/noto-sans-sc/400.css`, `600.css`) instead of one ~1.1 MB file.
- `scripts/firstload.mjs <outDir> [query] [dark|rm|nowebgl]` records a cold, throttled first load as frames (env: `VIEW`, `LAT`, `KBPS`, `CPU`, `STORE`, `BASE`).

## v7: mosque on its car park, minimum loader time

- **Masjid Jamek Abdullah Hukum on its car park.** The mosque sits on the roof of the car park "Parking Masjid Abdullah Hukum Bangsar" (local knowledge from the project owner). In OSM that is the unnamed building `way/594385371` (`building:levels=5`, no name/parking tags) whose outline encloses the mosque. The car park keeps its levels height, 5 × 3.5 m (the project-wide `LEVEL_H`) = 17.5 m. The mosque's base (`minHeight`) is that roof, and its own 9 m placeholder (still flagged as an estimate) sits on top, so its top is at 26.5 m. This is configured in `LANDMARK_PODIUMS` in `scripts/process-osm.mjs`; an OSM `name` on the car park would win over the local name. Press reports from 2016 (FMT, Bernama) describe "a two-storey mosque on top of a seven level car park podium". The model keeps the OSM level count; the conflict is flagged for the owner.
- Base elevation is general: buildings use `minHeight` and landmarks use `base`. The geometry is extruded from that base, so ch08 shadows, the shade raycasts and the pins (which use the absolute top) all follow it. On the Overview the car park is drawn as an opaque, tinted podium (`--podium`) instead of translucent.
- `meta.counts.heightInherited` now counts only inherited-estimate notes (unchanged at 3).
- **Loader minimum:** the loader hides at max(app ready, `MIN_LOADER_MS` = 6000 ms since navigation start). Under `prefers-reduced-motion` the minimum is 3000 ms (`MIN_LOADER_MS_REDUCED`) and the bar moves in whole steps with no animation. Progress is paced across the minimum and never runs ahead of the real steps. The slow note appears at 12 s (`SLOW_MS`). `?skipLoader=1` bypasses the minimum (used by `scripts/screenshots.mjs`, `trains-check.mjs` and `v7-check.mjs`). `window.__mv.ready` = app ready; `window.__mv.revealed` = loader gone.
- `scripts/v7-check.mjs`: loader timeline on an unthrottled load plus mid-load shots; mosque close-ups; Overview; ch08 shadows.
