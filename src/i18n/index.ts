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
let cjkLoaded = false;

export const t = (): Dict => dicts[lang];
export const getLang = () => lang;
export const dictFor = (l: Lang) => dicts[l];
export const onLangChange = (f: () => void) => listeners.push(f);

function loadCjkFont() {
  // Noto Sans SC (Simplified Chinese subset, split by unicode-range) is only fetched for zh.
  if (cjkLoaded) return; cjkLoaded = true;
  void import('@fontsource/noto-sans-sc/chinese-simplified-400.css');
  void import('@fontsource/noto-sans-sc/chinese-simplified-600.css');
}

export function setLang(next: Lang, persist = true) {
  if (!LANGS.includes(next)) next = 'en';
  lang = next;
  document.documentElement.lang = HTML_LANG[next];
  document.documentElement.dataset.lang = next;
  if (next === 'zh') loadCjkFont();
  if (persist) localStorage.setItem('mv-lang', next);
  for (const f of listeners) f();
}

export function initialLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  const s = (q || localStorage.getItem('mv-lang') || 'en') as Lang;
  return LANGS.includes(s) ? s : 'en';
}
