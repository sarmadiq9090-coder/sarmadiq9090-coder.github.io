/* FastKiwi game localization requests (games/requests/ and ar/games/requests/).
   - The list: same-origin fetch of data/game-requests.json (rebuilt every 6 hours by .github/workflows/game-requests.yml); every value is set with
     textContent, so a request can never inject markup or a link.
   - The form: on submit only, one POST (no-cors, urlencoded) to the FastKiwi Google Form. Nothing is loaded from Google when the page opens.
   - After a send the button stays off for 60 seconds (kept in localStorage when available). A hidden honeypot field catches bots: if it is filled,
     the page acts as if it sent, and sends nothing. */
(function () {
  'use strict';
  var ENDPOINT = 'https://docs.google.com/forms/d/e/1FAIpQLScE6PPBrCk_42sjPmX9vYK7bpqQAbBB9jLr2uaHspzhzkwnYg/formResponse';
  var F_NAME = 'entry.1768988093', F_NOTE = 'entry.731059280';
  var MAX_NAME = 80, MAX_NOTE = 300, COOLDOWN = 60000, KEY = 'fk-rq-last';
  var doc = document, ar = doc.documentElement.lang === 'ar';
  var T = ar ? {
    needName: 'اكتب اسم اللعبة من فضلك.', thanks: 'وصل طلبك، سيظهر في القائمة خلال ساعات.', wait: 'يمكنك إرسال طلب آخر بعد قليل.',
    fail: 'تعذّر الإرسال. تحقق من الاتصال وحاول مرة أخرى.', loadFail: 'تعذّر تحميل القائمة الآن.', empty: 'لا توجد طلبات بعد. كن أول من يطلب.',
    last: 'آخر طلب: ', notes: 'ملاحظات'
  } : {
    needName: 'Please write the game’s name.', thanks: 'Got your request. It will show in the list within a few hours.', wait: 'You can send another request in a moment.',
    fail: 'Could not send. Check your connection and try again.', loadFail: 'Could not load the list right now.', empty: 'No requests yet. Be the first to ask.',
    last: 'Last request: ', notes: 'Notes'
  };
  function people(n) {
    if (!ar) return n === 1 ? '1 person asked for it' : n + ' people asked for it';
    if (n === 1) return 'طلبه شخص واحد';
    if (n === 2) return 'طلبه شخصان';
    return n >= 3 && n <= 10 ? 'طلبه ' + n + ' أشخاص' : 'طلبه ' + n + ' شخصًا';
  }
  function fmtDate(iso) {
    try { return new Intl.DateTimeFormat(ar ? 'ar-u-nu-latn' : 'en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z')); } catch (e) { return iso; }
  }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---------- the list ---------- */
  var list = doc.getElementById('rq-list'), emptyEl = doc.getElementById('rq-empty');
  var TAPES = ['', 'pink', 'blue', 'lime'];
  function render(data) {
    list.textContent = '';
    var items = data && Array.isArray(data.requests) ? data.requests : [];
    emptyEl.hidden = items.length > 0; emptyEl.textContent = T.empty;
    items.forEach(function (r, i) {
      if (!r || typeof r.name !== 'string') return;
      var li = el('li', 'rq-item'); li.style.setProperty('--r', ((i % 3) - 1) * 0.9 + 'deg');
      li.appendChild(el('span', 'tape ' + TAPES[i % 4]));
      var n = +r.count || 1;
      var badge = el('span', 'rq-count', String(n)); badge.setAttribute('aria-hidden', 'true'); li.appendChild(badge);
      var body = el('div', 'rq-body');
      var h = el('h3', null, r.name); h.setAttribute('dir', 'auto'); body.appendChild(h);
      body.appendChild(el('p', 'rq-meta', people(n) + (typeof r.latest === 'string' ? ' · ' + T.last + fmtDate(r.latest) : '')));
      if (Array.isArray(r.notes) && r.notes.length) {
        var ul = el('ul', 'rq-notes'); ul.setAttribute('aria-label', T.notes);
        r.notes.forEach(function (t) { if (typeof t === 'string' && t) { var nl = el('li', null, t); nl.setAttribute('dir', 'auto'); ul.appendChild(nl); } });
        body.appendChild(ul);
      }
      li.appendChild(body); list.appendChild(li);
    });
  }
  if (list && emptyEl) {
    fetch(list.getAttribute('data-src'), { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(render).catch(function () { emptyEl.hidden = false; emptyEl.textContent = T.loadFail; });
  }

  /* ---------- the form ---------- */
  var form = doc.getElementById('rq-form');
  if (!form) return;
  var name = form.elements.name, note = form.elements.note, hp = form.elements.website, btn = form.querySelector('button[type=submit]');
  var msg = doc.getElementById('rq-msg'), timer = null;
  function say(text, bad) { msg.textContent = text; msg.className = 'rq-msg' + (text ? (bad ? ' bad' : ' good') : ''); }
  function lastSent() { try { return +localStorage.getItem(KEY) || 0; } catch (e) { return 0; } }
  function remember() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* private mode: the in-page timer still works */ } }
  function cool(ms) {
    if (ms <= 0) return;
    btn.disabled = true; clearTimeout(timer);
    timer = setTimeout(function () { btn.disabled = false; }, ms);
  }
  var left = COOLDOWN - (Date.now() - lastSent());
  if (left > 0 && left <= COOLDOWN) cool(left);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (btn.disabled) { say(T.wait, true); return; }
    var n = name.value.trim(), t = note.value.trim();
    if (!n) { say(T.needName, true); name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
    name.removeAttribute('aria-invalid');
    n = n.slice(0, MAX_NAME); t = t.slice(0, MAX_NOTE);
    var done = function () { remember(); cool(COOLDOWN); form.reset(); say(T.thanks, false); };
    if (hp && hp.value) { done(); return; } /* a bot filled the hidden field: look successful, send nothing */
    btn.disabled = true;
    var body = new URLSearchParams(); body.set(F_NAME, n); if (t) body.set(F_NOTE, t);
    fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
      .then(done, function () { btn.disabled = false; say(T.fail, true); });
  });
  name.addEventListener('input', function () { if (name.value.trim()) { name.removeAttribute('aria-invalid'); if (msg.classList.contains('bad')) say('', false); } });
})();
