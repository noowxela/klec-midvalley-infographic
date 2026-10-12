# map-infographic

A 3D scrollytelling infographic of the rail-and-mall cluster on both banks of the Klang River in Kuala Lumpur: KL Eco City, The Gardens Mall and Mid Valley Megamall, around Abdullah Hukum station (LRT Kelana Jaya Line and KTM) and Mid Valley KTM. Nine chapters walk through the site on a fixed 1920×1080 stage, with short, sourced text in English, 简体中文 and Bahasa Malaysia. The layout and chapter rail are inspired by the [Banqiao Station infographic](https://a767thycode.github.io/banqiao-station-infographic/). The massing is illustrative, not a survey.

**The map lives in its own repo.** The data, the OpenStreetMap pipeline and the Three.js model come from [map-assets](https://github.com/spacingouty09/map-assets), included here as a git submodule at `map-assets/`. This repo is the website: chapters, panels, i18n, camera, theme and checks. Both were split from [noowxela/klec-midvalley-infographic](https://github.com/noowxela/klec-midvalley-infographic) at `f26ec5c`, with history; Alex's original repo and site stay as they are.

- **AI tools** (Cursor, Grok, Claude Code…): read [AGENTS.md](AGENTS.md).
- **Changing the map** (data, heights, routes, the 3D model): [map-assets/CONTRIBUTING.md](https://github.com/spacingouty09/map-assets/blob/main/CONTRIBUTING.md).

## Set up

You need Node 22+, git, and access to this private repo (ask for an invite, then accept it on GitHub). The map, [map-assets](https://github.com/spacingouty09/map-assets), is public, so the submodule needs no extra access.

### Quick start with an AI agent

Copy this into your AI coding agent (Cursor, Grok, Claude Code, Codex…). It checks your access, clones the site with the map inside it, sets everything up, starts the site and explains how to contribute:

```text
Set me up to contribute to the KL Eco City – Mid Valley map project (private GitHub repo spacingouty09/map-infographic, with the public spacingouty09/map-assets as a submodule). 1) Check that I have git and Node 22+, and that git can reach the website repo: `git ls-remote https://github.com/spacingouty09/map-infographic.git`. If that fails, stop and tell me exactly what to do (usually: accept the map-infographic invite on GitHub, then run `gh auth login` and `gh auth setup-git`). 2) Ask me which folder to use, then run `git clone --recurse-submodules https://github.com/spacingouty09/map-infographic.git` there. 3) Open the map-infographic folder and follow the "First-time setup" section of its AGENTS.md. If you can't run commands yourself, give them to me one at a time and wait for the output. Don't commit, push or open pull requests without asking me.
```

### By hand

**1. Let git sign in to GitHub once.** Cloning this private repo needs it:

```bash
gh auth login        # GitHub CLI; choose HTTPS
gh auth setup-git    # lets git use that login
```

No GitHub CLI? Use a personal access token as the password when git asks.

**2. Clone with the submodule:**

```bash
git clone --recurse-submodules https://github.com/spacingouty09/map-infographic.git
cd map-infographic
git config submodule.recurse true   # pull / checkout keep map-assets/ in step from now on
npm ci
npm run doctor                      # checks the setup and prints the fix for anything wrong
npm run dev                         # http://127.0.0.1:5173/
```

Already cloned without `--recurse-submodules` (an empty `map-assets/` folder)? Run `git submodule update --init`.

**3. Day to day:**

| You want to… | Do this |
|---|---|
| Work on the website | see **Contributing to the website** below |
| Get the latest website changes | `git pull` (with `submodule.recurse` set, `map-assets/` follows the pointer) |
| Move to a newer map release | see **Updating the map** below |
| Change the map itself | see **Changing the map from here** below |
| Check your setup | `npm run doctor` |

### Contributing to the website

Edit `src/`, `index.html` or `scripts/` on a branch; `npm run build` type-checks the map code too. UI text goes in `src/i18n/` (en, zh and ms together).

```bash
git switch main && git pull
git switch -c feat/short-name
# edit, then:
npm run build                        # plus the checks that cover your change (see Checks)
git add -A && git commit -m "…"
git push -u origin feat/short-name   # open the pull request on map-infographic; CI must pass
```

### Updating the map

The website pins a map-assets **release tag**, so map changes never land here by surprise. To move to a newer one, pick it from [map-assets/CHANGELOG.md](https://github.com/spacingouty09/map-assets/blob/main/CHANGELOG.md) and use it in place of `vX.Y.Z`:

```bash
git -C map-assets fetch --tags
git -C map-assets checkout vX.Y.Z        # the release you want
npm run doctor && npm run build          # then the checks below
git add map-assets
git commit -m "map-assets vX.Y.Z"
git push
```

### Changing the map from here

`map-assets/` is a full clone of the [map repo](https://github.com/spacingouty09/map-assets). You can work in it, but treat it as **that** repo. It is public, so you can always fetch it; pushing to it needs write access there, which is separate from your access to this repo.

```bash
cd map-assets
git switch main && git pull              # it normally sits on a detached tag; get on a branch first
git switch -c data/my-change
# edit sources/ or pipeline/ (never data/ by hand), then:
npm run data:process && npm run data:check
git add -A && git commit -m "…"
git push -u origin data/my-change        # with write access to map-assets; then open the PR there
cd ..
```

No write access to map-assets? Push to your own fork instead (the GitHub CLI creates it and adds it as the `fork` remote) and open the pull request from it:

```bash
cd map-assets
gh repo fork --remote --remote-name fork
git push -u fork data/my-change
gh pr create --repo spacingouty09/map-assets   # or open the link that git push prints
cd ..
```

Once the PR is merged and released as a tag, move the pointer as in **Updating the map**. Until then, don't commit the website pointing at your branch: other people can't build a website that points at a commit they can't fetch (`npm run doctor` warns about it).

### Common mistakes

| Symptom | Cause and fix |
|---|---|
| Build fails with `Cannot find module '@map-assets'`, or `map-assets/` is empty | The submodule isn't checked out: `git submodule update --init` |
| `git status` shows `modified: map-assets (new commits)` | The submodule moved. To keep the recorded version: `git submodule update`. To adopt the new one on purpose: `git add map-assets` and commit. |
| Type errors about two different `three` types, or a "Multiple instances of Three.js" warning | Someone ran `npm install` inside `map-assets/`: `rm -rf map-assets/node_modules` |
| Edits in `map-assets/` vanished after `git pull` | It was on a detached HEAD. Always `git switch -c …` inside `map-assets/` before editing (see above) |
| `git clone` asks for a password or says "not found" | No access to map-infographic or not signed in: ask for an invite, then `gh auth login && gh auth setup-git` |
| `git push` inside `map-assets/` is refused (403, "Permission denied") | You have no write access to map-assets: push to a fork instead (see **Changing the map from here**) |

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
- **Animated trains:** LRT on both Kelana Jaya Line tracks (stopping at Abdullah Hukum, KJ17), and KTM Komuter 5- and 6-car sets on both tracks of both KTM lines, sized after the KTM Class 92 (cars ≈23 m × 2.75 m; Wikipedia), with the line colour as the livery stripe: Line 1 stops at Mid Valley (KTM · 10), Line 2 at Abdullah Hukum (KTM · 16). One on/off toggle in the top bar (overflow menu on mobile).
- **Airport lines (02 Transit hub):** the ERL tracks in the KLIA Transit colour (Line 7; it passes through without stopping, no ERL station in the study area per OSM; KLIA Ekspres shares the tracks but is not drawn separately) and the KL Sentral–Terminal Skypark Line (Line 10) as a thin dashed line beside the Line 2 track it uses, with no trains, because the service is suspended (since 15 February 2023).
- **Line pills and public stop numbers:** pills for KTM Line 1 (blue), KTM Line 2 (red) and LRT Line 5. Stations are shown as KTM · 10 (Mid Valley) and KTM · 16 (Abdullah Hukum); the official codes (KB01, KD01) appear only in source notes. KJ17 is shown as is.
- **Bottom bar** in the style of the Banqiao rail: equal segments, 3 px current bar that fills during autoplay, ← / → buttons.
- **Compass + Reset view:** the compass turns with the camera; Reset view appears only after you move the camera off the chapter preset.
- **Credit / scale strip:** a persistent `© OpenStreetMap contributors` corner credit plus a scale bar.
- **Loader:** shows for at least 3 s (1.5 s with reduced motion) with real progress steps; `?skipLoader=1` skips the minimum.
- **Also:** light/dark theme, autoplay (10 s per chapter), optional chime, fullscreen.
- **Keyboard:** → / ↓ / PgDn / Space next · ← / ↑ / PgUp previous · Home overview · F fullscreen · M map only. Mouse: drag to rotate, scroll to zoom, right-drag to pan.
- **Mobile layout** (≤ 768 px wide, or short landscape phones up to 1024 × 500): the map fills the screen at native size with portrait-aware camera framing. The chapter rail stays at the bottom as a scrollable row of 48 px tabs with ← / →, and the current tab is kept in view. Text and side-panel content share one bottom sheet that collapses to a peek (number + headline); tap or swipe up to expand it to ~60 % and scroll inside, and swipe left / right on the peek to change chapter. On landscape phones the sheet is a card at the bottom left. Less-used tools sit in a ⋯ menu. Safe-area insets and `dvh` units keep the browser bars off the rail.
- **Reduced motion:** no orbit, trains stand still (one LRT train at KJ17, one KTM train at each KTM station), and fades and flights are instant.

## Data and sources

All map data, cited heights, rail colours and climate normals come from map-assets; its [README](https://github.com/spacingouty09/map-assets#data-and-sources) lists the sources and open data questions. What this site adds:

- **Attribution:** the full line ("Map data © OpenStreetMap contributors (ODbL), Overpass API pull …") appears on 00 only. The corner credit linking to openstreetmap.org/copyright is on every chapter. Other chapters' source lines list only their own methods and non-OSM sources.
- **Estimates are flagged** (≈ in the UI). No figure is typed in by hand: every number comes from map-assets data or a cited source.

## Tech stack

Vite 8, TypeScript 7 (vanilla, no framework), Three.js 0.186 (OrbitControls). The 3D model is `MapModel` from map-assets; `src/scene.ts` wraps it with the renderer, camera flights, the 00 turntable and the theme (CSS variables → model palette). IBM Plex Sans/Mono and Noto Sans SC (zh only, loaded on demand) are bundled via @fontsource, so the page makes no external font requests. Checks use puppeteer-core with the local Google Chrome.

```bash
npm run dev          # http://127.0.0.1:5173/
npm run typecheck    # tsc --noEmit (includes the map-assets code)
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ on http://127.0.0.1:4173/
npm run doctor       # setup check
```

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
node scripts/mobile-check.mjs       # mobile layout at 360×640, 390×844, 430×932, 844×390, 768×1024 (+ 667×375)
node scripts/trains-check.mjs       # LRT + KTM trains: track, stops, 5/6 cars, spacing, toggle, reduced motion
node scripts/v7-check.mjs           # loader minimum + mosque/car-park shots
node scripts/firstload.mjs <outDir> [query] [rm|nowebgl]   # cold throttled first-load frames
```

Each check takes an optional base URL argument (default `http://127.0.0.1:4173/`); firstload reads it from `BASE`.

## CI and deployment

- **CI** (`.github/workflows/ci.yml`) builds every push and pull request, including the map-assets submodule. map-assets is public, so CI fetches it with no extra secret.
- **Deploy** (`.github/workflows/deploy.yml`) publishes `dist/` to GitHub Pages and is started by hand from the Actions tab. Pages for a private repo needs a paid GitHub plan (or a public repo). The relative Vite base (`./`) makes all assets resolve under any subpath.

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

- **Underground roads cutaway (05):** a WIP version is archived in [`archive/underground-cutaway/`](archive/underground-cutaway/README.md) (not released). It predates the split, so reviving it means moving its drawing code into map-assets `MapModel` and its panel into `src/chapters.ts`.
- Data questions (disputed heights, the Masjid Jamek car-park levels, mall heights) are listed in the map-assets README.

More detail (per-version design notes, precinct rule, trains, loader, rail codes, bottom bar, compass) is in [`docs/design-notes.md`](docs/design-notes.md).

## Licence

No licence yet: all rights reserved by the authors. Map data © OpenStreetMap contributors (ODbL), via map-assets.
