// Entry: check WebGL, then load the app chunk. Failures show the loader's error state.
import { loader } from './loader';

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
if (!hasWebGL()) loader.error('webgl');
else import('./main').catch((e: unknown) => loader.error('init', e instanceof Error ? e.message : String(e)));
