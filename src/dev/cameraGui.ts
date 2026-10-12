// Dev-only dat.GUI for the live camera. Loaded from main.ts only when import.meta.env.DEV.
import { GUI, type GUIController } from 'dat.gui';
import type { World } from '../scene';

const round = (n: number, d = 2) => { const p = 10 ** d; return Math.round(n * p) / p; };

export function attachCameraGui(world: World) {
  const state = {
    targetX: 0, targetY: 0, targetZ: 0,
    azimuth: 0, polar: 0.7, distance: 2200,
    orbit: false,
    period: world.turnPeriodS,
    direction: world.turnSign < 0 ? 'anti-clockwise' : 'clockwise',
  };
  let dragging = false;
  let writing = false;

  const apply = () => {
    if (writing) return;
    world.turnPeriodS = Math.max(4, state.period);
    world.turnSign = state.direction === 'clockwise' ? 1 : -1;
    if (world.turntableOn !== state.orbit) world.setTurntable(state.orbit);
    world.flyTo({
      target: [state.targetX, state.targetY, state.targetZ],
      azimuth: state.azimuth,
      polar: state.polar,
      distance: state.distance,
    }, true);
  };

  const pull = () => {
    const v = world.currentView();
    writing = true;
    state.targetX = round(v.target[0]);
    state.targetY = round(v.target[1]);
    state.targetZ = round(v.target[2]);
    state.azimuth = round(v.azimuth, 3);
    state.polar = round(v.polar, 3);
    state.distance = round(v.distance, 1);
    state.orbit = world.turntableOn;
    state.period = world.turnPeriodS;
    state.direction = world.turnSign < 0 ? 'anti-clockwise' : 'clockwise';
    gui.updateDisplay();
    writing = false;
  };

  const gui = new GUI({ width: 300 });
  const host = gui.domElement.parentElement ?? gui.domElement;
  host.style.top = '100px';
  host.style.zIndex = '30';
  const view = gui.addFolder('Camera');
  const changed = (c: GUIController) => {
    c.onChange(apply);
    c.domElement.addEventListener('pointerdown', () => { dragging = true; });
    return c;
  };
  changed(view.add(state, 'targetX', -800, 800, 1).name('target x'));
  changed(view.add(state, 'targetY', 0, 120, 1).name('target y'));
  changed(view.add(state, 'targetZ', -800, 800, 1).name('target z'));
  changed(view.add(state, 'azimuth', -Math.PI, Math.PI, 0.01).name('azimuth'));
  changed(view.add(state, 'polar', 0.12, 1.3, 0.01).name('polar'));
  changed(view.add(state, 'distance', 220, 3000, 10).name('distance'));
  view.open();

  const turn = gui.addFolder('Orbit');
  changed(turn.add(state, 'orbit').name('turntable'));
  changed(turn.add(state, 'period', 8, 180, 1).name('period (s)'));
  changed(turn.add(state, 'direction', ['clockwise', 'anti-clockwise']).name('from above'));
  turn.add({ copy() {
    const v = world.currentView();
    const line = `view: { target: [${round(v.target[0])}, ${round(v.target[1])}, ${round(v.target[2])}], azimuth: ${round(v.azimuth, 2)}, polar: ${round(v.polar, 2)}, distance: ${round(v.distance, 0)} },`;
    console.info(line);
    void navigator.clipboard?.writeText(line);
  } }, 'copy').name('copy view');
  turn.open();

  window.addEventListener('pointerup', () => {
    const active = document.activeElement;
    if (active && gui.domElement.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLSelectElement)) return;
    dragging = false;
  });
  gui.domElement.addEventListener('focusout', () => { dragging = false; });
  world.onFrame.push(() => { if (!dragging) pull(); });
  pull();
}
