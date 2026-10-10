# klec-midvalley-infographic

A 3D scrollytelling infographic of the rail-and-mall cluster on both banks of the Klang River in Kuala Lumpur: KL Eco City, The Gardens Mall and Mid Valley Megamall, around Abdullah Hukum station (LRT Kelana Jaya Line and KTM) and Mid Valley KTM. Nine chapters walk through the site with a fixed 1920×1080 stage, a Three.js block model built from OpenStreetMap and short, sourced text in English, 简体中文 and Bahasa Malaysia. The layout and chapter rail are inspired by the [Banqiao Station infographic](https://a767thycode.github.io/banqiao-station-infographic/). The massing is illustrative, not a survey.

## Chapters

| # | Chapter | What it shows |
|---|---|---|
| 00 | Overview | Text-only intro over the full-width model, which slowly orbits |
| 01 | Landmarks | Three precincts coloured by block, the two landmark mosques, the car park under Masjid Jamek |
| 02 | Transit hub | The 1 km × 1 km study area and its three stations (cover) |
| 03 | Location | River, roads, LRT viaduct and both KTM lines around the cluster |
| 04 | Massing | Heights by source (cited, OSM, flagged estimate) and the tallest named towers |
| 05 | Connections | Shortest OSM pedestrian path from Abdullah Hukum LRT to Mid Valley KTM |
| 06 | Walking routes | Route set between stations, malls and towers, with bridge, indoor, covered and open-air shares |
| 07 | Sun & shade | Sun position by date and time, shadows cast from the model, sidewalk shade |
| 08 | Rain & monsoon | Monthly rainfall normals and covered vs open-air pedestrian ways |

Deep links: `?chapter=0` … `?chapter=8` or `#00` … `#08`; also `?lang=en|zh|ms`, `?theme=dark`, `?skipLoader=1`.

## Features

- **Languages:** EN / zh / ms switcher in the top bar (or `?lang=`), remembered in localStorage.
- **00 orbit:** the camera turns 360° every 75 s on 00. It pauses on drag or zoom and while the tab is hidden, resumes 3 s after you stop, and ends when you leave 00.
- **Collapsible panels:** chevron tabs on the text and side panels; **M** or the top-bar button hides both (map only).
- **Animated LRT trains** on both Kelana Jaya Line tracks, stopping at Abdullah Hukum; on/off toggle in the top bar.
- **Line pills and public stop numbers:** pills for KTM Line 1 (blue), KTM Line 2 (red) and LRT Line 5. Stations are shown as KTM · 10 (Mid Valley) and KTM · 16 (Abdullah Hukum); the official codes (KB01, KD01) appear only in source notes. KJ17 is shown as is.
- **Bottom bar** in the style of the Banqiao rail: equal segments, 3 px current bar that fills during autoplay, ← / → buttons.
- **Compass + Reset view:** the compass turns with the camera; Reset view appears only after you move the camera off the chapter preset.
- **Credit / scale strip:** a persistent `© OpenStreetMap contributors` corner credit plus a scale bar.
- **Loader:** shows for at least 3 s (1.5 s with reduced motion) with real progress steps; `?skipLoader=1` skips the minimum.
- **Also:** light/dark theme, autoplay (10 s per chapter), optional chime, fullscreen.
- **Keyboard:** → / ↓ / PgDn / Space next · ← / ↑ / PgUp previous · Home overview · F fullscreen · M map only. Mouse: drag to rotate, scroll to zoom, right-drag to pan.
- **Reduced motion:** no orbit, trains stand still (one train at KJ17), and fades and flights are instant.

## Data and sources

- **OpenStreetMap** via the Overpass API, pulled 2026-10-10 (`src/data/meta.json`, `fetchedAt`). © OpenStreetMap contributors, ODbL.
- **Attribution rules:** the full line ("Map data © OpenStreetMap contributors (ODbL), Overpass API pull …") appears on 00 only. The corner credit linking to openstreetmap.org/copyright is on every chapter. Other chapters' source lines list only their own methods and non-OSM sources.
- **Heights:** cited values from `scripts/height-sources.json` (table and limitations in [`docs/height-sources.md`](docs/height-sources.md)). Otherwise the OSM `height` tag, or `building:levels` × 3.5 m. Anything else is a placeholder flagged as an estimate (≈ in the UI).
- **Rail:** line colours and station codes from Wikipedia ("Klang Valley Integrated Transit System" and the station and line articles, fetched 2026-10-10). KTM line per track comes from OSM route relations (`raw/ktm-routes.json`).
- **Climate:** the cited WMO 1991–2020 normals in `src/data/climate.json`. Sun position uses the NOAA formulas.
- **Estimates are flagged.** No figure is typed in by hand: every number comes from data or a cited source.

## Tech stack

Vite 8, TypeScript 7 (vanilla, no framework), Three.js 0.186 (OrbitControls, BufferGeometryUtils). IBM Plex Sans/Mono and Noto Sans SC (zh only, loaded on demand) are bundled via @fontsource, so the page makes no external font requests. Checks use puppeteer-core with the local Google Chrome.

## Getting started

```bash
npm install
npm run dev          # http://127.0.0.1:5173/
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ on http://127.0.0.1:4173/
```

Data (only needed to re-pull OSM):

```bash
npm run data:fetch     # scripts/fetch-osm.mjs   -> raw/overpass.json
npm run data:process   # scripts/process-osm.mjs -> src/data/*.json
```

The study area (centre and 1 km bbox) is set in `scripts/config.mjs`.

## Checks

Start a production preview first, then run any check. Screenshots go to git-ignored `shots*/` folders.

```bash
npm run build && npx vite preview --port 4173 --strictPort &
npm run shots                       # screenshots.mjs: every chapter × language, console errors, text fit, keyboard
node scripts/rail-check.mjs         # line colours, pills, public stop numbers, label overlap
node scripts/bar-check.mjs          # bottom bar: labels, current bar, arrows, autoplay, mobile
node scripts/compass-check.mjs      # compass + Reset view visibility and overlap
node scripts/credit-check.mjs       # OSM credit placement; OSM line on 00 only
node scripts/orbit-check.mjs        # 00 turntable
node scripts/trains-check.mjs       # LRT trains: track, stop, spacing, toggle, reduced motion
node scripts/v7-check.mjs           # loader minimum + mosque/car-park shots
node scripts/firstload.mjs <outDir> [query] [rm|nowebgl]   # cold throttled first-load frames
```

Each check takes an optional base URL argument (default `http://127.0.0.1:4173/`); firstload reads it from `BASE`.

## Chapter numbers: old to new

Since v16 the chapters are numbered 00–08 in a row. Links made earlier open the chapter that now has that number.

| Now | Chapter | v14–v15 | before v14 |
|---|---|---|---|
| 00 | Overview | 00 | 00 |
| 01 | Landmarks | 01 | — |
| 02 | Transit hub | 02 | 01 |
| 03 | Location | 03 | 02 |
| 04 | Massing | 05 | 04 |
| 05 | Connections | 07 | 06 |
| 06 | Walking routes | 08 | 07 |
| 07 | Sun & shade | 09 | 08 |
| 08 | Rain & monsoon | 10 | 09 |

## Known open items

- **Tower of Light / Residensi Vogue 1 heights:** both use the CTBUH value of 243 m. For Tower of Light this conflicts with OSM `building:levels=31` (≈108.5 m), and IGB's 59-storey Southpoint may be the same tower. Vogue 1 has no OSM height. Verify on site; the heights are left unchanged for now.
- **Masjid Jamek car park:** modelled as 5 levels (OSM). 2016 press reports (FMT, Bernama) say a seven-level podium.
- **Mall heights** (5 × 5 m) are applied uniformly to untagged mall parts; named parts stay estimates.
- **Not built yet:**
  - KL Eco City underground roads (in the data, not drawn) need a cutaway;
  - KTM trains are not animated;
  - KJ17 has no public stop number.
- **No git remote and no deployment yet.**

More detail (per-version design notes, precinct rule, trains, loader, rail codes, bottom bar, compass) is in [`docs/design-notes.md`](docs/design-notes.md).
