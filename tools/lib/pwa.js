/* FastKiwi Toolbox: offline + install. Registers /tools/sw.js (scope /tools/) and drives the "Install" card:
   a real Install button where the browser offers one (Chrome, Edge, Android), otherwise short instructions (iPhone/iPad, others). */

export function initPwa(card, t) {
  const btn = card.querySelector('[data-pwa-install]'), hint = card.querySelector('[data-pwa-hint]'), state = card.querySelector('[data-pwa-state]');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const say = (el, key) => { el.textContent = t(key); el.hidden = false; };
  let deferred = null;

  if (standalone) say(state, 'pwa_installed');
  else say(hint, ios ? 'pwa_hint_ios' : 'pwa_hint_other');

  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
    say(hint, 'pwa_hint_button');
  });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    deferred = null;
    btn.hidden = true;
  });
  addEventListener('appinstalled', () => { btn.hidden = true; hint.hidden = true; say(state, 'pwa_installed'); });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const sw = new URL('../sw.js', import.meta.url);
    navigator.serviceWorker.register(sw, { scope: new URL('./', sw).pathname })
      .then(() => navigator.serviceWorker.ready)
      .then(() => { if (!standalone) say(state, 'pwa_ready'); })
      .catch(e => console.warn('Offline mode unavailable:', e.message));
  }
}
