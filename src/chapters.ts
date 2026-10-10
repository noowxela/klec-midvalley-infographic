// Chapter definitions. Numbering follows the full plan; only built chapters are listed.
// Every figure is computed from the processed OSM data in ./data (see source lines).
import { buildings, lines, areas, routes, meta, stats, station, findPlace, fmt, heightLabel, type XY } from './data';
import type { SceneMode, View, World } from './scene';

export interface PinDef { id: string; title: string; value?: string; at: [number, number, number]; kind: 'station' | 'major' | 'minor'; color?: string }
export interface StatDef { fig: string; unit?: string; cap: string }
export interface Chapter {
  id: number; label: string; title: [string, string]; lead: string; stats: StatDef[]; hint?: string; source: string;
  view: View; mode: Partial<SceneMode>; pins: PinDef[]; panel?: (el: HTMLElement, world: World, ctx: PanelCtx) => void;
}
export interface PanelCtx { flyTo: (v: View) => void; chapterView: View }

const D = (n: XY, y = 0): [number, number, number] => [n[0], y, -n[1]];
const lineColor = { lrt: 'var(--c-lrt)', ktm: 'var(--c-ktm)', erl: 'var(--c-erl)' } as const;

// ---------- pins ----------
const stationPin = (ref: string, line: 'lrt' | 'ktm', title: string, value?: string): PinDef | null => {
  const s = station(ref); if (!s) return null;
  return { id: `st-${ref}`, title, value: value ?? `${ref} · OSM`, at: D(s.c, 13), kind: 'station', color: lineColor[line] };
};
const placePin = (name: string, title = name, value?: string, kind: PinDef['kind'] = 'major'): PinDef | null => {
  const p = findPlace(name); if (!p) return null;
  return { id: `pl-${name}`, title, value, at: D(p.c, p.height + 3), kind };
};
const longestNamed = <T extends { name: string | null; pts: XY[] }>(arr: T[], name: string) => {
  const cand = arr.filter((a) => a.name === name); if (!cand.length) return null;
  const L = (a: T) => a.pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - a.pts[i - 1][0], p[1] - a.pts[i - 1][1]) : 0), 0);
  const best = cand.sort((a, b) => L(b) - L(a))[0]; return best.pts[Math.floor(best.pts.length / 2)];
};
const textPin = (id: string, title: string, at: XY | null, y = 2, value?: string): PinDef | null => (at ? { id, title, value, at: D(at, y), kind: 'minor' } : null);
const centroid = (ring: XY[]): XY => { const s = ring.reduce((m, p) => [m[0] + p[0], m[1] + p[1]], [0, 0]); return [s[0] / ring.length, s[1] / ring.length]; };
const precinct = (name: string) => areas.precincts.find((p) => p.name === name);
const nn = <T,>(a: (T | null)[]) => a.filter((x): x is T => !!x);

const corePins = () => nn([
  stationPin('KJ17', 'lrt', 'Abdullah Hukum', 'LRT · KJ17'),
  placePin('Strata Office', 'KL Eco City', 'towers & podium', 'major'),
  placePin('The Gardens Mall', 'The Gardens Mall'),
  placePin('Mid Valley Megamall', 'Mid Valley Megamall'),
  stationPin('KB01', 'ktm', 'Mid Valley', 'KTM · KB01'),
]);

// ---------- small DOM helpers ----------
const h = (tag: string, attrs: Record<string, string> = {}, html = '') => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.innerHTML = html; return e; };
function toggle(parent: HTMLElement, label: string, checked: boolean, onChange: (v: boolean) => void, swatch?: string) {
  const l = h('label', { class: 'toggle' }); const i = h('input', { type: 'checkbox', role: 'switch' }) as HTMLInputElement; i.checked = checked;
  i.addEventListener('change', () => onChange(i.checked)); l.append(i);
  if (swatch) l.append(h('span', { class: 'swatch', style: `background:${swatch}` }));
  l.append(document.createTextNode(label)); parent.append(l); return i;
}

// ---------- derived figures ----------
const kj17 = station('KJ17'); const kb01 = station('KB01'); const kd01 = station('KD01');
const tallestNamed = (() => {
  const seen = new Set<string>(); const out: { name: string; height: number; src: 'osm' | 'levels' | 'estimate'; levels: number | null }[] = [];
  for (const b of [...buildings].filter((b) => b.name && b.heightSource !== 'estimate').sort((a, b) => b.height - a.height)) {
    if (seen.has(b.name!)) continue; seen.add(b.name!); out.push({ name: b.name!, height: b.height, src: b.heightSource, levels: b.levels });
  }
  return out.slice(0, 9);
})();
const routeBridgeEnclosed = routes[0]?.segments.find((s) => s.cls === 'bridge-enclosed');

const CLASS_TEXT: Record<string, string> = { 'bridge-enclosed': 'enclosed bridge', bridge: 'open/covered footbridge', indoor: 'indoor corridor', footway: 'footway', steps: 'steps', covered: 'covered walkway', road: 'roadside' };
const describeLeg = (r: (typeof routes)[number]) => {
  const parts = Object.entries(r.byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${fmt(v)} m ${CLASS_TEXT[k] || k}`);
  let s = parts.join(', ') + '.';
  if (r.withinEcoCityM > 0) s += ` ${fmt(r.withinEcoCityM)} m inside the KL Eco City precinct.`;
  if (r.overWaterM > 0) s += ` Crosses the Klang River (≈${fmt(r.overWaterM)} m over water).`;
  return s;
};
const legBounds = (i: number): View => {
  const pts = routes[i].segments.flatMap((s) => s.pts); const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return { target: [cx, 0, -cy], azimuth: 0.2, polar: 0.82, distance: Math.max(420, span * 1.9) };
};

const OSM_SRC = `Map data © OpenStreetMap contributors (ODbL), Overpass API pull ${stats.fetchedDate}.`;

export const chapters: Chapter[] = [
  {
    id: 0, label: 'Transit hub · Kuala Lumpur',
    title: ['Mid Valley –', 'Abdullah Hukum'],
    lead: 'A 1 km × 1 km look at the rail-and-mall cluster on both banks of the Klang River: Abdullah Hukum LRT, KL Eco City, The Gardens Mall, Mid Valley Megamall and Mid Valley KTM. Every block is drawn from OpenStreetMap; the massing is illustrative.',
    stats: [
      { fig: fmt(stats.buildingCount), unit: 'blocks', cap: 'building footprints & parts mapped in OSM in the study area' },
      ...(stats.osmTallest ? [{ fig: fmt(stats.osmTallest.height), unit: 'm', cap: `tallest OSM height tag (${stats.osmTallest.name})` }] : []),
      { fig: fmt(stats.routeTotalM), unit: 'm', cap: `LRT to KTM on foot along OSM ways, ≈${fmt(stats.routeMinutes)} min at 80 m/min` },
    ],
    hint: 'Press → or Space to begin · F fullscreen · drag to rotate',
    source: `${OSM_SRC} Heights from OSM height tags or building:levels × 3.5 m; blocks without either use a flagged placeholder. Walking distance measured on OSM pedestrian ways (see chapter 05).`,
    view: { target: [0, 0, -40], azimuth: -0.72, polar: 0.95, distance: 1950 },
    mode: { rails: { lrt: 'highlight', ktm: 'highlight', erl: 'context' }, footways: 'hidden', routes: false, xray: false, buildingStyle: 'default', precincts: false },
    pins: corePins(),
    panel: (el) => {
      const s1 = h('section'); s1.append(h('h3', {}, 'Study area'));
      s1.append(h('div', { class: 'small' }, `Centre ${meta.center.lat.toFixed(4)}° N, ${meta.center.lon.toFixed(4)}° E · ${fmt(meta.halfSizeM * 2)} m × ${fmt(meta.halfSizeM * 2)} m (dashed frame).<br/>BBox S ${meta.bbox.south} · W ${meta.bbox.west} · N ${meta.bbox.north} · E ${meta.bbox.east}`));
      const s2 = h('section'); s2.append(h('h3', {}, 'On the model'));
      for (const [sw, t] of [['var(--scene-building)', 'Building block (OSM footprint, extruded)'], ['var(--c-water)', 'Klang River & water'], ['var(--c-green)', 'Parks & grass'], ['var(--c-lrt)', 'LRT Kelana Jaya line (OSM)'], ['var(--c-ktm)', 'KTM tracks (OSM)']] as const)
        s2.append(h('div', { class: 'legend-row' }, `<span class="swatch box" style="background:${sw}"></span>${t}`));
      const s3 = h('section'); s3.append(h('h3', {}, 'Data quality'));
      s3.append(h('div', { class: 'small' }, `${fmt(stats.heightOsm)} blocks carry an OSM height, ${fmt(stats.heightLevels)} a level count; ${fmt(stats.heightEstimate)} have neither and use a placeholder (5–9 m, or the parent outline’s levels). See chapter 03.`));
      el.append(s1, s2, s3);
    },
  },
  {
    id: 1, label: 'Location',
    title: ['Where the LRT', 'meets the KTM'],
    lead: 'The hub straddles the Klang River: Abdullah Hukum and KL Eco City on the west bank, Mid Valley City on the east, with Jalan Bangsar to the west and the Federal Highway along the south. The Kelana Jaya LRT runs on a viaduct along the west edge; KTM tracks curve around both sides of the cluster.',
    stats: [
      { fig: fmt(stats.stationCount), unit: 'stations', cap: `railway=station in OSM: ${nn([kj17, kd01, kb01]).map((s) => s.ref).join(', ')}` },
      ...(stats.straightKJ17toKB01 ? [{ fig: fmt(stats.straightKJ17toKB01), unit: 'm', cap: 'straight line, Abdullah Hukum LRT ↔ Mid Valley KTM' }] : []),
      { fig: fmt(stats.railCorridors), unit: 'lines', cap: 'rail corridors mapped: LRT, KTM, ERL / KLIA Transit' },
    ],
    source: `${OSM_SRC} Station refs, names and track geometry as tagged in OSM; distances measured in a local metric frame. Viaduct height is drawn schematically.`,
    view: { target: [30, 0, -20], azimuth: -0.06, polar: 0.5, distance: 2250 },
    mode: { rails: { lrt: 'highlight', ktm: 'highlight', erl: 'context' }, footways: 'hidden', routes: false, xray: false, buildingStyle: 'default', precincts: true },
    pins: nn([
      stationPin('KJ17', 'lrt', 'Abdullah Hukum', 'LRT Kelana Jaya · KJ17'),
      stationPin('KD01', 'ktm', 'Abdullah Hukum', 'KTM · KD01'),
      stationPin('KB01', 'ktm', 'Mid Valley', 'KTM · KB01'),
      textPin('lbl-river', 'Klang River', longestNamed(lines.waterLines, 'Klang River'), 1),
      textPin('lbl-fed', 'Federal Highway', longestNamed(lines.roads, 'Lebuhraya Persekutuan'), 1, 'Lebuhraya Persekutuan'),
      textPin('lbl-bangsar', 'Jalan Bangsar', longestNamed(lines.roads, 'Jalan Bangsar'), 1),
      precinct('KL Eco City') ? textPin('lbl-eco', 'KL Eco City', centroid(precinct('KL Eco City')!.ring), 70, 'precinct (OSM landuse)') : null,
      precinct('Mid Valley City') ? textPin('lbl-mvc', 'Mid Valley City', centroid(precinct('Mid Valley City')!.ring), 120, 'precinct (OSM landuse)') : null,
    ]),
    panel: (el, world) => {
      const s1 = h('section'); s1.append(h('h3', {}, 'Layers'));
      toggle(s1, 'LRT Kelana Jaya line', true, (v) => world.setMode({ rails: { ...world.mode.rails, lrt: v ? 'highlight' : 'hidden' } }), 'var(--c-lrt)');
      toggle(s1, 'KTM tracks', true, (v) => world.setMode({ rails: { ...world.mode.rails, ktm: v ? 'highlight' : 'hidden' } }), 'var(--c-ktm)');
      toggle(s1, 'ERL / KLIA Transit (context)', true, (v) => world.setMode({ rails: { ...world.mode.rails, erl: v ? 'context' : 'hidden' } }), 'var(--c-erl)');
      toggle(s1, 'Precinct outlines (OSM landuse)', true, (v) => world.setMode({ precincts: v }));
      const s2 = h('section'); s2.append(h('h3', {}, 'Stations in OSM'));
      const ul = h('ul', { class: 'station-list' });
      for (const [s, line] of [[kj17, 'lrt'], [kd01, 'ktm'], [kb01, 'ktm']] as const) if (s)
        ul.append(h('li', {}, `<span class="badge" style="background:${lineColor[line]}">${s.ref ?? '—'}</span><div><div>${s.name}</div><div class="small">${s.operator ?? 'operator not tagged'}</div></div>`));
      s2.append(ul, h('div', { class: 'small' }, 'Names and operators exactly as tagged in OSM.'));
      el.append(s1, s2);
    },
  },
  {
    id: 3, label: 'Massing',
    title: ['Mall podiums,', 'office towers'],
    lead: 'Two precincts dominate the skyline: KL Eco City’s towers to the west and the Mid Valley City towers rising from The Gardens and Megamall podiums. Heights come from OSM: a height tag where one exists, otherwise levels × 3.5 m. Treat every figure as approximate.',
    stats: [
      ...(stats.osmTallest ? [{ fig: fmt(stats.osmTallest.height), unit: 'm', cap: `${stats.osmTallest.name}: the only tower with an OSM height tag` }] : []),
      { fig: fmt(stats.heightLevels), unit: 'blocks', cap: 'height from building:levels × 3.5 m' },
      { fig: fmt(stats.heightEstimate), unit: 'blocks', cap: 'no height data in OSM: placeholder, flagged' },
    ],
    source: `${OSM_SRC} Heights: OSM height and building:levels tags. The 3.5 m storey height and placeholders for untagged blocks are this study’s assumptions. Illustrative block massing, not a survey.`,
    view: { target: [-30, 45, -70], azimuth: -0.38, polar: 1.1, distance: 1250 },
    mode: { rails: { lrt: 'context', ktm: 'context', erl: 'hidden' }, footways: 'hidden', routes: false, xray: false, buildingStyle: 'default', precincts: false },
    pins: nn(tallestNamed.filter((t) => findPlace(t.name)?.building?.precinct).slice(0, 8).map((t) => placePin(t.name, t.name, heightLabel(t.height, t.src, t.levels)))),
    panel: (el, world) => {
      const s1 = h('section'); s1.append(h('h3', {}, 'Display'));
      const legend = h('div', { style: 'display:none; margin:6px 0 4px 46px' });
      for (const [k, t] of [['osm', `OSM height tag (${stats.heightOsm})`], ['levels', `levels × 3.5 m (${stats.heightLevels})`], ['estimate', `placeholder (${stats.heightEstimate})`]] as const)
        legend.append(h('div', { class: 'legend-row' }, `<span class="swatch box" style="background:var(--src-${k})"></span>${t}`));
      const slider = h('div', { class: 'slider', style: 'margin-top:14px' });
      slider.innerHTML = `<label for="thr">Highlight blocks ≥</label><output id="thr-out">off</output><input id="thr" type="range" min="0" max="150" step="5" value="0" aria-label="Highlight blocks taller than (metres)"/>`;
      const src = toggle(s1, 'Colour by height source', false, (v) => { legend.style.display = v ? 'block' : 'none'; if (v) { (slider.querySelector('input') as HTMLInputElement).value = '0'; slider.querySelector('output')!.textContent = 'off'; } world.setMode({ buildingStyle: v ? 'source' : 'default' }); });
      s1.append(legend, slider);
      const inp = slider.querySelector('input') as HTMLInputElement; const out = slider.querySelector('output')!;
      inp.addEventListener('input', () => {
        const v = +inp.value; out.textContent = v ? `${v} m · ${buildings.filter((b) => b.height >= v).length} blocks` : 'off';
        if (v) { src.checked = false; legend.style.display = 'none'; }
        world.setMode({ buildingStyle: v ? 'threshold' : 'default', threshold: v });
      });
      const s2 = h('section'); s2.append(h('h3', {}, 'Tallest named blocks (approx.)'));
      const max = tallestNamed[0]?.height || 1; const bars = h('div', { class: 'bars' });
      for (const t of tallestNamed) bars.append(h('span', { class: 'name', title: t.name }, t.name), h('span', {}, `<div class="bar ${t.src}" style="width:${(t.height / max) * 100}%"></div>`), h('span', { class: 'val' }, `${t.src === 'osm' ? '' : '≈'}${fmt(t.height)} m`));
      s2.append(bars, h('div', { class: 'small', style: 'margin-top:10px' }, 'Dark bar: OSM height tag. Grey: levels × 3.5 m.'));
      el.append(s1, s2);
    },
  },
  {
    id: 5, label: 'Connections',
    title: ['LRT to KTM', 'through the malls'],
    lead: `The shortest path on OSM-mapped pedestrian ways links Abdullah Hukum LRT to Mid Valley KTM in about ${fmt(stats.routeTotalM)} m: an enclosed bridge from the LRT station through KL Eco City and over the Klang River, corridors through The Gardens Mall and Megamall, then footbridges into the KTM station.`,
    stats: [
      { fig: fmt(stats.routeTotalM), unit: 'm', cap: 'measured along OSM footways, bridges and corridors' },
      { fig: `≈${fmt(stats.routeMinutes)}`, unit: 'min', cap: 'walking at 80 m/min, no waiting' },
      { fig: fmt(stats.routeBridgeShare), unit: '%', cap: `on OSM-tagged bridges (${fmt(stats.routeBridgeM)} m)` },
    ],
    source: `${OSM_SRC} Path: shortest route over OSM footway / steps / corridor ways (roads allowed only as a costlier fallback; none used), endpoints snapped to the nearest pedestrian node (≤ 25 m). Time = distance ÷ 80 m/min; escalators, lifts, crossings and opening hours are not modelled.`,
    view: { target: [8, 0, -70], azimuth: 0, polar: 0.62, distance: 1900 },
    mode: { rails: { lrt: 'context', ktm: 'context', erl: 'hidden' }, footways: 'faint', routes: true, routeFocus: null, xray: true, buildingStyle: 'default', precincts: false },
    pins: nn([
      stationPin('KJ17', 'lrt', 'Abdullah Hukum LRT', 'start · KJ17'),
      placePin('The Gardens Mall', 'The Gardens Mall', routes[0] ? `${fmt(routes[0].length)} m from LRT` : undefined),
      placePin('Mid Valley Megamall', 'Mid Valley Megamall', routes[1] ? `+${fmt(routes[1].length)} m` : undefined),
      stationPin('KB01', 'ktm', 'Mid Valley KTM', routes[2] ? `+${fmt(routes[2].length)} m · end` : 'end'),
      routeBridgeEnclosed ? textPin('lbl-bridge', 'Enclosed bridge', routeBridgeEnclosed.pts[Math.floor(routeBridgeEnclosed.pts.length / 2)], 12, `${fmt(routeBridgeEnclosed.length)} m · OSM bridge + indoor`) : null,
    ]),
    panel: (el, world, ctx) => {
      const s1 = h('section'); s1.append(h('h3', {}, 'Route, step by step'));
      const ol = h('ol', { class: 'step-list' });
      routes.forEach((r, i) => {
        const li = h('li', { tabindex: '0', role: 'button', 'aria-label': `Focus step ${i + 1}` }, `<span class="step-n">${i + 1}</span><div><div class="step-title">${r.fromLabel.replace(/ \(.*\)/, '')} → ${r.toLabel.replace(/ \(.*\)/, '')}</div><div class="step-meta">${fmt(r.length)} m · ≈${fmt(r.minutes, 1)} min</div><div class="step-desc">${describeLeg(r)}</div></div>`);
        const act = () => { const on = !li.classList.contains('active'); ol.querySelectorAll('li').forEach((x) => x.classList.remove('active')); if (on) li.classList.add('active'); world.setMode({ routeFocus: on ? i : null }); ctx.flyTo(on ? legBounds(i) : ctx.chapterView); };
        li.addEventListener('click', act); li.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') act(); });
        ol.append(li);
      });
      s1.append(ol);
      const s2 = h('section'); s2.append(h('h3', {}, 'Layers'));
      toggle(s2, 'All OSM footways & bridges', false, (v) => world.setMode({ footways: v ? 'show' : 'faint' }), 'var(--ink)');
      toggle(s2, 'X-ray buildings', true, (v) => world.setMode({ xray: v }));
      s2.append(h('div', { class: 'small', style: 'margin-top:8px' }, `${fmt(meta.counts.footbridges)} footbridge ways and ${fmt(meta.counts.indoorCorridors)} indoor corridor/steps ways are mapped in the study area; indoor links are only as complete as OSM.`));
      el.append(s1, s2);
    },
  },
];
