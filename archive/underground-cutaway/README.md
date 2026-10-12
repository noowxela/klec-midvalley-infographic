# Underground road cutaway (05 Connections): archived WIP

**Status: work in progress, not released.** Built 2026-10-12 as commit `22fa64a` on top of `1a5d0cc`. That commit is kept in git history but was undone on main by the archive commit. Alex reviewed it: a good start, but not ready to release.

## What it does
In chapter 05 Connections:
- **Tunnels:** the 48 OSM highway ways tagged `tunnel=yes` or `layer<0` (about 2.9 km) are drawn below ground, coloured by kind:
  - KL Eco City lower tier (inside the OSM landuse area "KL Eco City");
  - Mid Valley City basement access (inside the OSM area "Mid Valley City", including the ways OSM names "Parking Zone A/B/C");
  - Federal Highway motorcycle-lane underpasses (OSM name "Lorong Motosikal Lebuhraya Persekutuan");
  - other tunnels and below-ground roads.
- **Fade and cut edge:** the ground, roads, water and parks turn translucent, on top of the existing X-ray buildings. A translucent earth wall with an outline runs along the study-area edge, down to just below the deepest mapped road.
- **Cars:** an illustrative car flow (InstancedMesh). The cars stand still under prefers-reduced-motion and follow the top-bar trains on/off toggle.
- **Panel:** a section "Underground roads (cutaway)" with toggles for the cutaway and the cars, one legend row per kind (OSM way count and metres), and the depth note. Two map labels: "KL Eco City lower tier" and "Mid Valley basement access". Everything is in EN/zh/ms.
- **Default:** the cutaway is on in 05 and off in every other chapter.
- **Check:** `scripts/cutaway-check.mjs` (92 checks; all passed at 22fa64a, as did the other 9 checks).

## Depth caveat
No public depth figures were found. Depths are **estimates**: 4.5 m per OSM layer step below ground (layer 0 tunnels count as -1). OSM gives the order of levels, not depths. The labels round to "≈5 m" while the note says 4.5 m per step; this is a known inconsistency.

## Known gaps before release
- Tunnels read faintly under the translucent ground at the default camera angle.
- On 390×844 mobile only the KL Eco City label shows.
- The "≈5 m" vs 4.5 m wording above.
- The side panel in 05 gets long.

## Sources
- **OpenStreetMap** © OpenStreetMap contributors: highway ways tagged `tunnel=yes` or `layer<0`, and the landuse areas "KL Eco City" and "Mid Valley City".
- **S P Setia, "KL Eco City" project page** (spsetia.com/property/kl-eco-city/, fetched 2026-10-12): a two-tier (upper/lower) internal road system, and 6 dedicated bridges and ramps to Federal Highway, NPE, Jalan Maarof and Jalan Bangsar.
- **Malaysia Property News, "SP Setia plans rail hub in KL Eco City"** (April 2012): two dedicated Federal Highway ramps.

## Contents
| Path | What it is |
|---|---|
| `0001-05-Connections-underground-road-cutaway-OSM-tunnels-.patch` | `git format-patch -1 22fa64a` |
| `src/…`, `scripts/cutaway-check.mjs` | The new and changed files exactly as they are in 22fa64a, at their repo paths |
| `repo-README.md` | The repo's root README.md as it was in 22fa64a (renamed so it doesn't clash with this file) |
| `screenshots/` | 05 EN light and dark, zh, 390×844 mobile, and EN with the cutaway toggled off |

These files are not built or run: tsconfig only includes `src/`, Vite only bundles what `index.html` imports, and the checks list their pages explicitly.

## Restore
On an up-to-date main:
```sh
git am archive/underground-cutaway/0001-05-Connections-underground-road-cutaway-OSM-tunnels-.patch   # or: git cherry-pick 22fa64a
# if main has moved on and the patch no longer applies cleanly:
git am -3 archive/underground-cutaway/0001-05-Connections-underground-road-cutaway-OSM-tunnels-.patch   # or: git apply --3way archive/underground-cutaway/0001-05-Connections-underground-road-cutaway-OSM-tunnels-.patch
```
Then run `npm run build`, start the preview server, and run the checks, including `node scripts/cutaway-check.mjs`.
