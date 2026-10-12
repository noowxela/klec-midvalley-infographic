# Design notes and change log

Detailed implementation notes moved here from the README (version by version). Chapter numbers in older sections are the ones current when they were written; see the mapping table in the README.

These notes predate the 2026-10-12 split into this repo and [map-assets](https://github.com/spacingouty09/map-assets). Paths below are the old ones: `src/data/` is now `map-assets/data/`, `scripts/process-osm.mjs`, `fetch-osm.mjs` and `config.mjs` are now under `map-assets/pipeline/`, `scripts/height-sources.json` and `src/data/climate.json` are now under `map-assets/sources/`, and the model half of `src/scene.ts` (plus `trains.ts`, `shade.ts` and `sun.ts`) is now in `map-assets/src/`.

An interactive, chaptered 3D infographic of the rail-and-mall cluster around
Abdullah Hukum LRT, KL Eco City, The Gardens Mall, Mid Valley Megamall and
Mid Valley KTM in Kuala Lumpur. All geometry comes from OpenStreetMap; the
model is **illustrative block massing**, not a survey.

### Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173/
npm run build      # type-check (tsc) + production build into dist/
npm run preview    # serve dist/ on http://127.0.0.1:4173/
```

Deep links: `?chapter=0` … `?chapter=8` (or `#00` … `#08`), `?theme=dark`. The numbers are the current (v16) chapter numbers below; links made before v16 open the chapter that now has that number.
Keys: → / ↓ / Space next chapter, ← / ↑ previous, Home overview, F fullscreen, M map only (hide both panels)
(ignored while a slider or input has focus). Drag to rotate, scroll to zoom,
right-drag to pan, RESET VIEW returns to the chapter camera.

### Stack

Vite + vanilla TypeScript + Three.js (OrbitControls, BufferGeometryUtils).
IBM Plex Sans / Mono bundled via @fontsource (no external requests).
A fixed 1920×1080 stage is scaled to fit the window.

### Data

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
below the stage. The 00 Overview source line is just the full credit ("Map data © OpenStreetMap contributors (ODbL), Overpass API pull <date>"), and
the "Data" note in the 01 Landmarks side panel adds the ODbL licence link and the order in which heights are sourced. The other chapters' source lines
do not repeat the OSM line; they keep only their own method notes and non-OSM sources.

### Screenshots

`npm run build && npx vite preview --port 4173 &` then `npm run shots`
(uses local Google Chrome via puppeteer-core; also checks console errors and
keyboard handling). Output in `shots/` (git-ignored).

### v2 (demo 0.2)

- **Cited heights**: `scripts/height-sources.json` → applied in `scripts/process-osm.mjs` as `heightSource: "cited"` with a `heightRef` (value, unit, floors, storey height, publisher, URL, fetch date). Full table and limitations: `docs/height-sources.md`.
- **New chapters** (numbers as of v3): 07 Walking routes, 08 Sun & shade (NOAA solar position, real shadow map, raycast sidewalk shade), 09 Rain & monsoon (covered vs open-air pedestrian ways; climate normals from the cited WMO table in `src/data/climate.json`).
- **Languages**: English, 简体中文 (zh-Hans, Malaysia), Bahasa Malaysia. Switch in the top bar, `?lang=en|zh|ms`, remembered in localStorage (`mv-lang`).

### Adding or changing a UI string

1. Add the key to `src/i18n/en.ts` (this file defines the `Dict` type). Use a function when the text contains a computed number, e.g. `statFoo: (m: number) => \`${n(m)} m of footway\``; never type numbers into the text.
2. Add the same key to `src/i18n/zh.ts` and `src/i18n/ms.ts`. TypeScript (`npm run typecheck`) fails until every locale has it.
3. Use it via `t().section.key` (chapters are rebuilt on language change, so read `t()` inside `buildChapters()` or a panel, not at module load).
4. Static page chrome (top bar, credit, reset button) is set in `applyStaticText()` in `src/main.ts`.

Chinese glyphs come from `@fontsource/noto-sans-sc` (Simplified Chinese subset), imported dynamically only when `zh` is active; IBM Plex stays first in the stack so Latin text and digits keep the Plex look.

### v3 (demo 0.3)

Chapter numbering (plan numbers; unbuilt chapters are skipped in the tab bar, `?chapter=` takes these numbers):

Since v16 the chapters are numbered consecutively 00–08 (unbuilt plan chapters are no longer reserved). Notes further down use the numbers that were current when they were written.

| # | Chapter | v14–v15 | before v14 |
|---|---|---|---|
| 00 | Overview (text panel only; model fills the area right of the text; slow turntable orbit) | 00 | 00 |
| 01 | Landmarks: precincts, landmark mosques, car park | 01 | — |
| 02 | Transit hub (cover) | 02 | 01 |
| 03 | Location | 03 | 02 |
| 04 | Massing | 05 | 04 |
| 05 | Connections | 07 | 06 |
| 06 | Walking routes | 08 | 07 |
| 07 | Sun & shade | 09 | 08 |
| 08 | Rain & monsoon | 10 | 09 |

**Precinct rule (chapter 01 Landmarks; chapter 00 before v14; rule 3 changed in v16)**, computed in `scripts/process-osm.mjs` (`zone` on each block, stats in `meta.zones`):
1. *The Gardens*: blocks named The Gardens Mall / North Tower / South Tower / St. Giles The Gardens Residences / The Gardens Hotel, or parts of an outline with one of those names (the towers are mapped as parts of the "The Gardens Mall" outline). The Gardens Hotel has no named OSM footprint.
2. *KL Eco City*: other blocks whose centroid is inside the OSM landuse polygon "KL Eco City".
3. *Mid Valley Megamall* (v16): the OSM building "Mid Valley Megamall" (way/922804567, building=mall) and the building:parts mapped inside that outline: 73 blocks, about 5.6 ha of footprint. Before v16 this precinct was every remaining block in the OSM landuse polygon "Mid Valley City" (97 blocks, about 7.7 ha, including the Boulevard offices, MidValley Tower of Light, Cititel, South Point and Northpoint).
Footprint per precinct = union of block footprints on a 1 m grid.

**Panels**: the text panel and side panel collapse with the chevron tabs on their inner edges; the top-bar button or **M** hides both. State is saved in localStorage (`mv-panels`) and kept across chapters; the 3D view recentres on the free space.

### v4: trains and landmark mosques

**Trains (`src/trains.ts`)**
- What runs (v4): LRT Kelana Jaya trains, on the two OSM track ways through the study area. The ways are chained into one continuous track per direction, resampled every metre and smoothed (plan ±4 m, deck height ramped over about 30 m, so there is no step where the deck goes from 9 m to 10.5 m).
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
- Checks: `scripts/trains-check.mjs`.

**KTM Komuter trains (v14, `src/trains.ts` `KTM_TRAIN`)**
- What runs: KTM Komuter sets on both tracks of both KTM lines: Line 1 Batu Caves–Pulau Sebang (east tracks, stripe `--c-ktm1` #3C5A9F) and Line 2 Tanjung Malim–Port Klang (west tracks, stripe `--c-ktm2` #DC2420). Per line, the OSM main-track ways (route from the OSM route relations; crossovers and the two ways with an inferred route left out) are chained regardless of their drawn direction (`chainWaysAnyDir`) into one track per direction, oriented for left-hand running (`orientLeftHand`).
- Height: at grade (0.35 m, the drawn KTM track height). The drawn 6 m bridge decks keep their height and are approached on 4 % ramps (schematic, like the viaduct heights); the KTM track ribbons and piers are now drawn from these same tracks, so trains and track agree. Line 1 passes through two OSM tunnel ways (≈115 m) south-east of Mid Valley: trains run through them but are not drawn there, and neither is the track.
- Stops: Line 1 at Mid Valley (KB01, shown as KTM · 10), Line 2 at Abdullah Hukum (KD01, KTM · 16), train centred on the station (track point 2–7 m from the OSM station position).
- Station roofs: OSM `building=roof` canopies over the KTM tracks (KB01, KD01 and one more at KD01) are drawn as a 0.6 m roof slab, and the KD01 `train_station` block over the tracks from a 5 m clearance up, so trains at the platforms stay visible. The blocks' heights in the data and the UI are unchanged.
- Cars: sized after the KTM Class 92 (Wikipedia "KTM Class 92", fetched 2026-10-12: 6-car set 138.6 m, cars 22.8–23.7 m, width 2.75 m, height 3.905 m, floor 1.1 m): 23.1 m cars, 0.9 m gap, 2.75 m wide, body 0.9–3.9 m above the rail, sloped cab nose. Class 92 sets are 6 cars; the 5-car sets are illustrative. Sets repeat 6-5 / 5-6 per track.
- Motion (illustrative, no timetable source): cruise 20 m/s (72 km/h; Class 92 service maximum is 120–125 km/h), brake and accelerate at 0.8 m/s², dwell 30 s. Headway 180 s per track (compressed: real Komuter headways are tens of minutes), opposite tracks half a headway apart; at most 4 KTM trains are on the map at once, and never two on one track.
- Rendering: one more `Trains` instance (4 instanced meshes + 1 LineSegments) for all four KTM tracks; the stripe takes the line colour as an instance colour. An update takes about 0.02 ms.
- Same integration as the LRT: trains toggle (`#btn-trains`, overflow menu on mobile), hidden where a chapter hides the KTM layer, clock paused while the tab is hidden, keeps running during the 00 orbit, and under reduced motion one KTM train stands at each KTM station. The page loads 20 s into the KTM cycle so trains are already moving.

**Landmark mosques (Overview)**
- Selection: OSM buildings named "Masjid Jamek Abdullah Hukum" (way/659511483) and "Masjid An Nur" (relation/12622827, alt_name "Balai Islam An-Nur TNB Bangsar"). Both are religion=muslim.
- An Nur: its footprint centroid is about 8 m west of the study square. It is drawn from its full OSM outline (already in the existing Overpass pull) but not counted in the study-area blocks, so all stats are unchanged.
- Masjid Jamek: OSM maps an unnamed 5-level building (way/594385371) whose outline encloses the mosque outline. On the Overview that building is drawn translucent so the mosque is visible.
- Colour: `--landmark` (warm charcoal in light theme, ivory in dark).
- Overview camera: turned (azimuth 0.2) so Masjid Jamek is not hidden behind the KL Eco City towers.

### v6: loading screen

- `index.html` carries an inline loader (critical CSS + markup + a small script) that paints before any bundle loads. Theme (`?theme`, then saved `mv-theme`, then `prefers-color-scheme`) and language (`?lang`, then `mv-lang`) are applied before first paint, so a saved dark theme or zh/ms never flashes light/English.
- The entry is `src/boot.ts`: it checks WebGL, then dynamically imports `main.ts`. Progress steps are real: application, map data (OSM JSON), 3D scene, fonts (Plex, and Noto Sans SC for zh), first frame.
- The loader hides only after fonts are ready (8 s cap), text is re-rendered and pins re-measured with the final fonts, stage scaling and the first camera are applied, and three frames have rendered. It then fades out over ~0.5 s (instant under `prefers-reduced-motion`).
- After 8 s (12 s since v7, `SLOW_MS`) a "taking longer than usual" note with a reload button appears. A missing WebGL or an init error (script load failure, uncaught error or rejection before ready) shows an error state with a reload button. All strings are in EN/zh/ms.
- Noto Sans SC now loads as unicode-range slices (`@fontsource/noto-sans-sc/400.css`, `600.css`) instead of one ~1.1 MB file.
- `scripts/firstload.mjs <outDir> [query] [dark|rm|nowebgl]` records a cold, throttled first load as frames (env: `VIEW`, `LAT`, `KBPS`, `CPU`, `STORE`, `BASE`).

### v7: mosque on its car park, minimum loader time

- **Masjid Jamek Abdullah Hukum on its car park.** The mosque sits on the roof of the car park "Parking Masjid Abdullah Hukum Bangsar" (local knowledge from the project owner). In OSM that is the unnamed building `way/594385371` (`building:levels=5`, no name/parking tags) whose outline encloses the mosque. The car park keeps its levels height, 5 × 3.5 m (the project-wide `LEVEL_H`) = 17.5 m. The mosque's base (`minHeight`) is that roof, and its own 9 m placeholder (still flagged as an estimate) sits on top, so its top is at 26.5 m. This is configured in `LANDMARK_PODIUMS` in `scripts/process-osm.mjs`; an OSM `name` on the car park would win over the local name. Press reports from 2016 (FMT, Bernama) describe "a two-storey mosque on top of a seven level car park podium". The model keeps the OSM level count; the conflict is flagged for the owner.
- Base elevation is general: buildings use `minHeight` and landmarks use `base`. The geometry is extruded from that base, so ch08 shadows, the shade raycasts and the pins (which use the absolute top) all follow it. On the Overview the car park is drawn as an opaque, tinted podium (`--podium`) instead of translucent.
- `meta.counts.heightInherited` now counts only inherited-estimate notes (unchanged at 3).
- **Loader minimum:** the loader hides at max(app ready, `MIN_LOADER_MS` = 3000 ms since navigation start; it was 6000 ms in v7). Under `prefers-reduced-motion` the minimum is 1500 ms (`MIN_LOADER_MS_REDUCED`, half the normal minimum as before) and the bar moves in whole steps with no animation. Progress is paced across the minimum (the bar fills smoothly over about 3 s, updated every 40 ms) and never runs ahead of the real steps. The slow note appears at 12 s (`SLOW_MS`). `?skipLoader=1` bypasses the minimum (used by `scripts/screenshots.mjs`, `trains-check.mjs` and `v7-check.mjs`). `window.__mv.ready` = app ready; `window.__mv.revealed` = loader gone.
- `scripts/v7-check.mjs`: loader timeline on an unthrottled load plus mid-load shots; mosque close-ups; Overview; ch08 shadows.

### Rail line colours and station codes

Checked against Wikipedia, [Klang Valley Integrated Transit System](https://en.wikipedia.org/wiki/Klang_Valley_Integrated_Transit_System) ("System network" table; the same hex values are in Module:Adjacent stations/KLRT), and the station articles. Fetched 2026-10-10.

| Shown | Code(s) | Line | Colour (CSS) |
|---|---|---|---|
| Abdullah Hukum LRT | KJ17 | 5 Kelana Jaya Line | `#E0115F` (`--c-lrt`, also `--train-accent`) |
| Abdullah Hukum KTM | KD01 (shown as "KTM · 16") | 2 Tanjung Malim–Port Klang Line | `#DC2420` (`--c-ktm2`) |
| Mid Valley KTM | KB01 (shown as "KTM · 10") | 1 Batu Caves–Pulau Sebang Line | `#3C5A9F` (`--c-ktm1`) |

- The official colours are used unchanged in both themes.
- KTM track line: the Overpass pull has no route relations, so `raw/ktm-routes.json` stores the KTM Komuter route relations of each KTM track way (OSM API, 2026-10-10). `process-osm.mjs` writes `route` (1 or 2) per KTM segment. Ways in no Komuter relation (one crossover, three short connectors) take the line of the nearest referenced segment and carry `routeInferred: true`. In the study area the west corridor (through KD01) is line 2 and the east corridor (through KB01) is line 1. OSM also puts the west corridor in the Skypark Link relation, a service Wikipedia lists as suspended since 15 February 2023, so it is not drawn.
- ERL tracks carry both KLIA Ekspres (`#8C238F`) and KLIA Transit (`#33A8B5`) and neither stops in the study area. They stay as neutral grey context (`--c-erl`).
- Station badges and station pins follow Wikipedia's Template:KLRT code: a line-coloured box with 3 px corners and the code in bold white.
- **KTM line pills** (`src/linePill.ts`): inline-SVG pills after the official KTM Komuter line icons: a fully rounded pill with the line number in bold white and the same white front-facing train glyph on both. Line 1 (Batu Caves–Pulau Sebang) is blue and Line 2 (Tanjung Malim–Port Klang) is red. The pills use the official line colours (`--c-ktm1` #3C5A9F, `--c-ktm2` #DC2420), so pill, track and legend match. The reference icons are darker (navy #0F2D92, crimson #AB2632). Each pill has `role="img"`, an `aria-label` and a `<title>` (EN "KTM Line 1, Batu Caves–Pulau Sebang Line"; zh "KTM 1 号线，芙蓉线"; ms "KTM Laluan 1, Laluan Batu Caves–Pulau Sebang").
- Where the pills appear:
  - on every KTM station pin (KB01, KD01), with a white ring because the tag is the same colour;
  - in the 01 legend;
  - on the 02 KTM layer toggle;
  - in the 02 station list next to the code badge.
  The code badges (KJ17, KD01, KB01) are unchanged: the pill identifies the line, the badge the station.
- **Line 5 pill** (LRT Kelana Jaya): the same pill in `--c-lrt` #E0115F with a bold white "5". Following the Rapid KL reference, it adds two thin lighter rings, one round the number and one round the train, overlapping in the middle. The reference is ruby #C52936. Its aria-label is "LRT Line 5, Kelana Jaya Line" (zh "LRT 5 号线，格拉那再也线"; ms "LRT Laluan 5, Laluan Kelana Jaya"). It is used on the KJ17 pin, in the 01 legend, on the 02 LRT toggle and in the station list.
- **Mid Valley shown as "KTM · 10".** Riders know Mid Valley as stop 10 on Line 1 counting from Batu Caves: KC05–KC01 and KA04–KA01, then Mid Valley (Wikipedia, "Batu Caves–Pulau Sebang Line", Stations table). The pins, station list, stats caption and chapter text show "KTM · 10" with the Line 1 pill. The official code KB01 appears only in the 02 source note ("Official station code KB01 (Wikipedia); shown as stop 10 from Batu Caves", in EN/zh/ms) and in these notes. `PUBLIC_CODE` in `src/chapters.ts` holds the mapping. rail-check fails if KB01 appears in any user-facing text, aria-label or title outside a source note. Abdullah Hukum KTM gets the same treatment and is shown as **"KTM · 16"** with the Line 2 pill. That is stop 16 from Tanjung Malim (KA15–KA01, then Abdullah Hukum), not counting the 2026 Segambut Utara infill (KA05A), as the project owner chose. KD01 appears only in the 03 Location source note (02 before v14) ("Official station code KD01 (Wikipedia); shown as stop 16 from Tanjung Malim", in EN/zh/ms) and in these notes. KJ17 is unchanged for now. For reference:
  - Abdullah Hukum KTM (KD01) is stop 17 from Tanjung Malim, counting the 2026 infill Segambut Utara (KA05A), or stop 19 from Port Klang.
  - Abdullah Hukum LRT (KJ17) is stop 17 from Gombak (KJ1) or stop 21 from Putra Heights (KJ37).
- The keyboard hint ("Press → or Space to begin · F fullscreen · M map only · drag to rotate", in EN/zh/ms) moved from 01 (the old cover) to the 00 Overview text panel, since 00 is now the first page. Its style is unchanged. It fits in all three languages; rail-check checks that it appears on 00 only and that the text panel does not overflow.
- 01 Transit hub labels all three stations, including KD01 (Tanjung Malim–Port Klang Line), using the same stacking that keeps pin labels apart. `scripts/rail-check.mjs` checks colours, pills (aria and fill) and that no visible pin labels overlap each other or the panels. It also writes pill close-ups to `shots-rail/`.

### Chapter rail (bottom bar)

The bottom bar follows the Banqiao Station infographic's `#rail`: equal-width segments 3 px apart, each with a 1 px
top hairline. The current chapter gets a 3 px ink bar, which fills with the autoplay progress while autoplay runs (this
replaced the separate progress line). Each tab is a mono 11.5 px number plus a 12 px label in muted grey, turning ink when
current or hovered; on hover the hairline becomes a 2 px accent. ← / → buttons sit at the right. The rail is 46 px tall
and its top sits 86 px above the stage bottom, as on Banqiao; the "Illustrative block massing" note and the corner OSM
credit sit below it. The bottom fade matches Banqiao's: solid, then 70 % at 64 px, then clear (ours is 20 px taller to
make room for the footer note). Check with `scripts/bar-check.mjs`.

### Compass and RESET VIEW

- **Compass.** An inline SVG dial with a hairline ring (`--hairline`), four subtle ticks (`--grey-2`) and a symmetric needle centred on the dial. The north half is solid ink and the south half is outlined (`--grey-1`), with a small hub. The "N" sits inside the dial, in line with the needle tip. The whole rose turns with the camera bearing (`world.northAngle()`). Strokes are non-scaling, so the dial stays crisp at any stage scale and in both themes. Clicking the compass does nothing, the same as before.
- **RESET VIEW.** The button sits immediately left of the compass and is vertically centred with it. It appears only after the user has moved the camera (OrbitControls `start`: drag, wheel or touch) and while the camera is away from the chapter's preset. "Away" means target more than 8 m, bearing or tilt more than about 2°, or distance more than 4 % (`World.isNear`).
- It hides again:
  - when clicked;
  - when the camera is back near the preset;
  - while a flight animates;
  - on chapter change.
- It fades and slides 8 px over 0.22 s, instantly under reduced motion. While hidden it has `visibility: hidden`, `tabindex=-1` and `aria-hidden`, so it is out of the tab order. Its translated label and title are unchanged.
- `scripts/compass-check.mjs` checks the button: hidden on load, after a chapter change and after a click; visible and focusable after a drag or zoom; centred with the compass. It also checks for overlap with the credit, bottom bar, side panel (open or collapsed) and scale bar at 1920×1080, 1440×900 and on mobile. Close-ups go to `shots-compass/`.

### v15: 00 turntable

- On 00 Overview the camera orbits the site centre continuously, 360° every 75 s (`World.TURN_PERIOD_S`), at the preset pitch and distance, starting from the preset bearing once the flight to 00 has landed.
- It pauses while the user drags or zooms (OrbitControls `start` / `end`) and resumes 3 s after they stop (`World.TURN_RESUME_MS`), pauses while the tab is hidden, and never runs under prefers-reduced-motion.
- RESET VIEW on 00 ignores the bearing: it appears only when pitch, zoom or target change.
- Leaving 00 stops the orbit; the next chapter's flight starts from the current bearing. The compass, pins and trains update every frame as before.
- `scripts/orbit-check.mjs` checks all of this and writes two 00 screenshots 4 s apart to `shots-orbit/`.

### v16: three precincts, consecutive chapter numbers

- The three precincts are KL Eco City, The Gardens and Mid Valley Megamall (zh 谷中城购物广场). The Mid Valley precinct now covers only the Megamall outline and its parts (rule 3 above), so the coloured area matches the name. On 01 the precinct pin carries the Megamall name, so the separate v13 Megamall label was removed (no duplicate).
- "Mid Valley City" no longer appears in user-facing text (precinct description, leads in 00 / 03 / 04, the 03 outline label; the 03 map draws only the KL Eco City outline). The OSM polygon name stays in the 01 source note. rail-check fails if it appears on screen outside a source note.
- Chapters renumbered 00–08 (table above): ids, tabs, hashes / `?chapter=`, cross-references in all three locales, comments and test scripts.
