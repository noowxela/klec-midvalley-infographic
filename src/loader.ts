// Typed access to the inline loader in index.html (window.__loader).
export type LoaderStep = 'app' | 'data' | 'scene' | 'fonts' | 'frame';
interface LoaderApi {
  step(id: LoaderStep, state: 'active' | 'done'): void;
  /** the app is truly ready; the loader hides at max(this, its minimum duration) */
  ready(): void;
  /** called once the loader has started fading out (immediately if it already has) */
  onReveal(cb: () => void): void;
  error(kind: 'webgl' | 'init', detail?: string): void;
  isReady: boolean; failed: boolean;
}
const noop: LoaderApi = { step() {}, ready() {}, onReveal(cb) { cb(); }, error() {}, isReady: true, failed: false };
export const loader: LoaderApi = (window as unknown as { __loader?: LoaderApi }).__loader ?? noop;
