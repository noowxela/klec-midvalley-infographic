// Tiny i18n layer: three static dictionaries, a current language, and change listeners.
// Language: ?lang=en|zh|ms  >  localStorage 'mv-lang'  >  'en'.
import { en, type Dict } from './en';
import { zh } from './zh';
import { ms } from './ms';

export type Lang = 'en' | 'zh' | 'ms';
export const LANGS: Lang[] = ['en', 'zh', 'ms'];
const dicts: Record<Lang, Dict> = { en, zh, ms };
const HTML_LANG: Record<Lang, string> = { en: 'en', zh: 'zh-Hans-MY', ms: 'ms-MY' };

let lang: Lang = 'en';
const listeners: (() => void)[] = [];
let cjkPromise: Promise<unknown> | null = null;

export const t = (): Dict => dicts[lang];
export const getLang = () => lang;
export const dictFor = (l: Lang) => dicts[l];
export const onLangChange = (f: () => void) => listeners.push(f);

function loadCjkFont() {
  // Noto Sans SC is only fetched for zh; the 400/600 CSS is split into ~100 unicode-range slices, so only the slices for glyphs on screen download.
  cjkPromise ??= Promise.all([import('@fontsource/noto-sans-sc/400.css'), import('@fontsource/noto-sans-sc/600.css')]);
  return cjkPromise;
}
/** Resolves when the CJK @font-face rules are registered (immediately when zh was never used). */
export const cjkFontCss = () => cjkPromise ?? Promise.resolve();

export function setLang(next: Lang, persist = true) {
  if (!LANGS.includes(next)) next = 'en';
  lang = next;
  document.documentElement.lang = HTML_LANG[next];
  document.documentElement.dataset.lang = next;
  if (next === 'zh') void loadCjkFont();
  if (persist) localStorage.setItem('mv-lang', next);
  for (const f of listeners) f();
}

export function initialLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  const s = (q || localStorage.getItem('mv-lang') || 'en') as Lang;
  return LANGS.includes(s) ? s : 'en';
}
