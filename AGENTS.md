# AGENTS.md: klec-midvalley-infographic

Instructions for AI coding tools (Cursor, Grok, Claude Code, Codex and others) and a quick reference for people. The full guide is [README.md](README.md); the map has its own rules in [map-assets/AGENTS.md](map-assets/AGENTS.md).

## What this repo is

A 3D scrollytelling website about the Mid Valley – Abdullah Hukum transit hub. The map itself (data, pipeline and the Three.js model) is **not** in this repo: it is the `map-assets/` git submodule, imported as `@map-assets`. This repo owns the page: chapters, panels, i18n, camera, theme and the checks in `scripts/`.

Access: this repo (noowxela/klec-midvalley-infographic) and map-assets (spacingouty09/map-assets) are both public: anyone can clone them. Pushing needs write access to each repo separately; without it, pull requests come from a fork.

## First-time setup

When someone asks you to set them up (usually with the prompt in README, "Quick start with an AI agent"), do this in the repo root. If you can't run commands yourself, give them to the person one at a time and wait for the output.

1. `git config submodule.recurse true` (this repo only; keeps `map-assets/` in step on pull and checkout).
2. `npm ci`
3. `npm run doctor`. Fix every ✗ with the command it prints and run it again until it ends with "setup OK".
4. `npm run build`. It must pass.
5. Read [README.md](README.md) ("Set up", "Contributing to the website"), [map-assets/AGENTS.md](map-assets/AGENTS.md) and [map-assets/CONTRIBUTING.md](map-assets/CONTRIBUTING.md), and follow their rules from now on.
6. Start `npm run dev`, leave it running, and give the person http://127.0.0.1:5173/.
7. Tell them, in a few lines:
   - **klec-midvalley-infographic** is this website; **map-assets** (the `map-assets/` folder) is the shared map that other websites use too.
   - **Website change:** a branch here, edit, `npm run build` plus the checks that cover it, then a pull request on this repo (from a fork if they have no write access here).
   - **Map change:** inside `map-assets/`, `git switch main && git pull`, then a branch; edit `sources/` or `pipeline/` (never `data/`); `npm run data:process && npm run data:check`; a pull request on map-assets, from a fork if they have no write access there (README, "Changing the map from here"). After it is released as a tag, the website moves its pointer (README, "Updating the map").
   - Then ask what they want to work on.

Don't commit, push, open pull requests or change global git settings without asking.

## Rules

- **Map changes go to map-assets, not here.** Don't edit files under `map-assets/` as part of a website change. Make the change in the map-assets repo (its CONTRIBUTING.md), release a tag, then move the submodule pointer here.
- **Never commit the `map-assets` pointer to a commit that isn't on spacingouty09/map-assets.** A commit that is only local or only on a fork can't be fetched by anyone else. `npm run doctor` warns about it.
- **Don't run `npm install` inside `map-assets/`**: it creates a second copy of three.js.
- **All UI text goes through `src/i18n/`** (en, zh, ms). `en.ts` defines the keys; `zh.ts` and `ms.ts` must have the same keys (the type check enforces it).
- **Numbers shown in the UI** come from `@map-assets` data or a cited source; format them with `fmt` from `src/format.ts`.
- **Keep the checks passing.** They read `window.__mv.world` (`trains`, `ktmTrains`, `lrtTracks`, `ktmTracks`, `ktmTrackLine`, `controls`, `mode`, `setMode`, `flyTo`), so keep those on `World` in `src/scene.ts`.
- Do not commit `node_modules/`, `dist/`, `shots*/`, logs or `.env` files.

## Commands

| Command | What it does |
|---|---|
| `npm run doctor` | checks Node, the submodule, three.js and git settings; prints fixes |
| `npm run dev` | dev server at http://127.0.0.1:5173/ |
| `npm run build` | type check + production build into `dist/` |
| `npm run preview` | serve `dist/` at http://127.0.0.1:4173/ (the checks use it) |
| `node scripts/<name>-check.mjs` | one browser check (list in README, "Checks") |

## Before you finish a change

```bash
npm run doctor && npm run build
```

Then run the checks that cover what you touched, against `npm run preview`.
