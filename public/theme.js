'use strict';
/* Loaded in <head> before first paint so there is no light flash. Settings live in this browser only (localStorage "den.prefs"). */
(() => {
  const KEY = 'den.prefs', DEF = { theme: 'auto', reduceMotion: false, popups: true };
  const mq = matchMedia('(prefers-color-scheme: dark)'), mm = matchMedia('(prefers-reduced-motion: reduce)');
  let prefs = { ...DEF };
  try { prefs = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* storage blocked: defaults */ }
  function apply() {
    const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && mq.matches);
    const r = document.documentElement;
    r.setAttribute('data-theme', dark ? 'dark' : 'light');
    r.setAttribute('data-motion', prefs.reduceMotion || mm.matches ? 'reduce' : 'full');
  }
  const onChange = () => apply();
  mq.addEventListener ? (mq.addEventListener('change', onChange), mm.addEventListener('change', onChange)) : 0;
  window.DenTheme = {
    get: () => ({ ...prefs }),
    set(patch) { prefs = { ...prefs, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } apply(); },
    reduced: () => document.documentElement.getAttribute('data-motion') === 'reduce',
  };
  apply();
})();
