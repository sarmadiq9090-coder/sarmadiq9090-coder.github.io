/* FastKiwi home page: live release info from the GitHub API (no tracking, cached for an hour),
   the on-site download & release-notes dialog, the hero app stage and gentle scroll reveals. */
(function () {
  window.FK = 1; /* tells the inline fallback in <head> that scroll reveals are handled */
  var OWNER = 'sarmadiq9090-coder', REPOS = ['arabic-file-search', 'Remember-Me', 'local-ai-chat', 'tafket'];
  /* the installer each download button points at; names follow each repo's release workflow */
  var INSTALLER = {
    'arabic-file-search': /^bahth\.exe$/,
    'Remember-Me': /^Remember-Me-Setup-.*\.exe$/i,
    'local-ai-chat': /^local-ai-chat\.exe$/,
    'tafket': /^InstaWords_[\d.]+_x64-setup\.exe$/
  };
  var ar = document.documentElement.lang === 'ar';
  var nf = new Intl.NumberFormat(ar ? 'ar' : 'en', { notation: 'compact', maximumFractionDigits: 1 });
  var df = new Intl.DateTimeFormat(ar ? 'ar' : 'en', { year: 'numeric', month: 'short', day: 'numeric' });
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var script = document.currentScript, base = script ? new URL('.', script.src).href : '';

  /* per-app details for the download dialog (hash slug, icon, name, Windows requirements, static fallback) */
  var APPS = {
    'arabic-file-search': { slug: 'instafind', icon: 'img/instafind.svg', name: ar ? 'InstaFind · بحث سريع' : 'InstaFind',
      req: ar ? 'ويندوز 10 أو 11 · x64 وARM64 وx86 · ملف واحد بلا تثبيت' : 'Windows 10 or 11 · x64, ARM64 or x86 · single file, no install',
      fallback: 'https://github.com/' + OWNER + '/arabic-file-search/releases/latest/download/bahth.exe' },
    'Remember-Me': { slug: 'remember-me', icon: 'img/remember-me.webp', name: ar ? 'ذكرني · Remember Me' : 'Remember Me',
      req: ar ? 'ويندوز 10 أو 11' : 'Windows 10 or 11', fallback: null },
    'local-ai-chat': { slug: 'lemon', icon: 'img/lemon.webp', name: ar ? 'Lemon · الذكاء المحلي' : 'Lemon',
      req: ar ? 'ويندوز 10 أو 11 · يحتاج Ollama لتشغيل النماذج' : 'Windows 10 or 11 · needs Ollama for the AI models',
      fallback: 'https://github.com/' + OWNER + '/local-ai-chat/releases/latest/download/local-ai-chat.exe' },
    'tafket': { slug: 'instawords', icon: 'img/instawords.svg', name: ar ? 'InstaWords · تفقيط' : 'InstaWords',
      req: ar ? 'ويندوز 10 أو 11 · تثبيت للمستخدم دون صلاحيات المدير' : 'Windows 10 or 11 · per-user install, no admin rights',
      fallback: 'https://github.com/' + OWNER + '/tafket/releases/download/v2.0.0/InstaWords_2.0.0_x64-setup.exe' }
  };
  var T = ar ? {
    title: 'التنزيل وملاحظات الإصدار', close: 'إغلاق', loading: 'جارٍ جلب آخر إصدار…', version: 'الإصدار', date: 'تاريخ النشر',
    size: 'الحجم', req: 'المتطلبات', sha: 'SHA-256', copy: 'نسخ', copied: 'تم النسخ', download: 'تنزيل', files: 'ملفات أخرى',
    notes: 'ما الجديد', noNotes: 'لا توجد ملاحظات لهذا الإصدار.', older: 'الإصدارات السابقة', showNotes: 'الملاحظات',
    offline: 'تعذّر الاتصال بـ GitHub لجلب معلومات آخر إصدار. جرّب لاحقاً، أو استخدم الرابط أدناه.',
    offlineDl: 'تنزيل آخر إصدار', ghRelease: 'افتح الإصدار على GitHub', ghFoot: 'الإصدار على GitHub', verify: 'تحقق من الملف بمقارنة بصمة SHA-256.'
  } : {
    title: 'Download & release notes', close: 'Close', loading: 'Getting the latest release…', version: 'Version', date: 'Released',
    size: 'Size', req: 'Requirements', sha: 'SHA-256', copy: 'Copy', copied: 'Copied', download: 'Download', files: 'Other files',
    notes: "What's new", noNotes: 'No notes for this release.', older: 'Earlier versions', showNotes: 'Notes',
    offline: "We couldn't reach GitHub to load the latest release. Try again later, or use the link below.",
    offlineDl: 'Download the latest version', ghRelease: 'Open the release on GitHub', ghFoot: 'Release on GitHub', verify: 'Check the file by comparing its SHA-256 fingerprint.'
  };

  var v = document.querySelector('video.demo');
  if (v && reduce) { v.removeAttribute('autoplay'); v.pause(); }

  /* ---------- GitHub data ---------- */
  function cached(url) {
    var key = 'fk:' + url, now = Date.now();
    try { var c = JSON.parse(localStorage.getItem(key)); if (c && now - c.t < 3600e3) return Promise.resolve(c.d); } catch (e) {}
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (d) {
      try { localStorage.setItem(key, JSON.stringify({ t: now, d: d })); } catch (e) {}
      return d;
    });
  }
  function slim(rels) {
    return rels.filter(function (r) { return !r.draft; }).map(function (r) {
      return { tag: r.tag_name, pre: r.prerelease, date: r.published_at, url: r.html_url, body: r.body || '',
        assets: (r.assets || []).map(function (a) { return { n: a.name, s: a.size, d: a.download_count, h: a.digest || '' }; }) };
    });
  }
  var store = {};
  function load(repo) {
    if (!store[repo]) {
      var b = 'https://api.github.com/repos/' + OWNER + '/' + repo;
      store[repo] = Promise.all([cached(b).catch(function () { return null; }),
        cached(b + '/releases?per_page=100').then(slim).catch(function () { return null; })])
        .then(function (x) { return { repo: repo, info: x[0], rels: x[1] }; });
    }
    return store[repo];
  }
  function size(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + (ar ? ' ميغابايت' : ' MB') : Math.round(b / 1024) + (ar ? ' كيلوبايت' : ' KB'); }
  function pick(assets) {
    return assets.filter(function (a) { return a.n === 'bahth.exe'; })[0] ||
      assets.filter(function (a) { return /setup.*\.exe$/i.test(a.n); })[0] ||
      assets.filter(function (a) { return /\.(exe|msi)$/i.test(a.n) && !/arm64|x86|setup.*\.blockmap/i.test(a.n); })[0] ||
      assets.filter(function (a) { return /\.(exe|msi|zip)$/i.test(a.n); })[0];
  }
  function assetUrl(repo, tag, name) {
    return 'https://github.com/' + OWNER + '/' + repo + '/releases/download/' + encodeURIComponent(tag) + '/' + encodeURIComponent(name);
  }
  function latestOf(d) { return d && d.rels && d.rels.filter(function (r) { return !r.pre; })[0]; }
  function installerOf(repo, rel) {
    return rel && (rel.assets.filter(function (x) { return INSTALLER[repo] && INSTALLER[repo].test(x.n); })[0] || null);
  }
  function verTag(tag) { return /^v/i.test(tag) ? tag : 'v' + tag; }

  Promise.all(REPOS.map(load)).then(function (all) {
    var stars = 0, dl = 0, rel = 0, okStars = false, okRel = false;
    all.forEach(function (a) {
      if (a.info) { stars += a.info.stargazers_count || 0; okStars = true; }
      if (!a.rels) return;
      okRel = true; rel += a.rels.length;
      a.rels.forEach(function (r) { r.assets.forEach(function (x) { dl += x.d; }); });
      var latest = latestOf(a);
      var el = document.querySelector('.rel[data-repo="' + a.repo + '"]');
      /* download buttons: direct link to the latest installer, with its version */
      var inst = installerOf(a.repo, latest);
      if (inst) {
        var href = assetUrl(a.repo, latest.tag, inst.n);
        document.querySelectorAll('a[data-dl="' + a.repo + '"]').forEach(function (btn) {
          btn.href = href; btn.setAttribute('data-resolved', '');
          var ver = btn.querySelector('[data-dl-ver]');
          if (ver) ver.textContent = verTag(latest.tag);
        });
      }
      if (latest && el) {
        var as = pick(latest.assets), parts = [latest.tag, df.format(new Date(latest.date))];
        if (as) parts.push(size(as.s));
        el.textContent = parts.join(' · ');
      }
      if (a.repo === 'arabic-file-search' && latest) {
        var bar = document.querySelector('[data-news]');
        var days = (Date.now() - new Date(latest.date)) / 864e5;
        if (bar && days < 30) {
          bar.querySelector('[data-news-ver]').textContent = latest.tag;
          bar.querySelector('[data-news-link]').setAttribute('href', '#download-instafind');
          bar.hidden = false;
        }
      }
    });
    function show(k, n, ok, min) {
      if (n < (min || 1)) return;
      var li = document.querySelector('[data-stat="' + k + '"]');
      if (li && ok && n > 0) { li.querySelector('[data-n]').textContent = nf.format(n); li.hidden = false; }
    }
    /* small numbers are hidden rather than shown, never inflated */
    show('stars', stars, okStars, 100); show('downloads', dl, okRel, 1000); show('releases', rel, okRel, 10);
  });

  /* ---------- download & release notes dialog ---------- */
  var SLUG = {}; Object.keys(APPS).forEach(function (r) { SLUG[APPS[r].slug] = r; });
  var dlg, opener = null;
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16"/></svg>';
  function svg(markup) { var t = document.createElement('template'); t.innerHTML = markup; return t.content.firstChild; } /* static, trusted markup only */

  /* release notes: a tiny, safe markdown subset built from DOM nodes (text only, never innerHTML) */
  function inline(parent, text) {
    text = text.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach(function (part) {
      if (!part) return;
      if (/^\*\*[^*]+\*\*$/.test(part)) parent.appendChild(h('strong', { text: part.slice(2, -2) }));
      else if (/^`[^`]+`$/.test(part)) parent.appendChild(h('code', { text: part.slice(1, -1) }));
      else parent.appendChild(document.createTextNode(part.replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:])/g, '$1$2')));
    });
  }
  function markdown(src) {
    var box = h('div', { class: 'dl-notes', dir: 'auto' }), list = null, para = null, code = null;
    function end() { list = null; para = null; }
    String(src || '').replace(/\r/g, '').split('\n').forEach(function (line) {
      if (code) { if (/^\s*```/.test(line)) code = null; else code.textContent += (code.textContent ? '\n' : '') + line; return; }
      if (/^\s*```/.test(line)) { end(); code = h('code'); box.appendChild(h('pre', null, [code])); return; }
      var m;
      if (!line.trim()) { end(); return; }
      if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { end(); var hd = h('h4'); inline(hd, m[1].replace(/#+\s*$/, '')); box.appendChild(hd); return; }
      if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { end(); return; }
      if ((m = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/))) {
        var tag = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (!list || list.tagName.toLowerCase() !== tag) { para = null; list = h(tag); box.appendChild(list); }
        var li = h('li'); inline(li, m[2]); list.appendChild(li); return;
      }
      if (list && /^\s{2,}\S/.test(line)) { inline(list.lastChild, ' ' + line.trim()); return; }
      list = null;
      if (!para) { para = h('p'); box.appendChild(para); } else para.appendChild(document.createTextNode(' '));
      inline(para, line.trim());
    });
    if (!box.firstChild) box.appendChild(h('p', { text: T.noNotes }));
    return box;
  }

  function ensureDialog() {
    if (dlg) return dlg;
    dlg = h('dialog', { class: 'dl', 'aria-labelledby': 'dl-title' });
    var close = h('button', { class: 'dl-close', type: 'button', 'aria-label': T.close });
    close.appendChild(svg('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'));
    close.addEventListener('click', function () { dlg.close(); });
    dlg.appendChild(h('div', { class: 'dl-head' }, [h('img', { alt: '', width: '48', height: '48' }),
      h('div', null, [h('h2', { id: 'dl-title' }), h('p', { text: T.title })]), close]));
    dlg.appendChild(h('div', { class: 'dl-body' }));
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {
      if (/^#download-/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
      if (opener && opener.isConnected) opener.focus();
      opener = null;
    });
    document.body.appendChild(dlg);
    return dlg;
  }
  function dlButton(href, label, primary, ver, bytes) {
    var a = h('a', { class: 'btn ' + (primary ? 'btn-primary dl-main' : 'btn-ghost'), href: href });
    a.appendChild(svg(ICON_DL)); a.appendChild(document.createTextNode(label));
    if (ver) { a.appendChild(document.createTextNode(' ')); a.appendChild(h('span', { class: 'ltr', text: ver })); }
    if (bytes) { a.appendChild(document.createTextNode(' · ')); a.appendChild(h('span', { text: size(bytes) })); }
    return a;
  }
  function ghLink(repo, label) { return h('a', { href: 'https://github.com/' + OWNER + '/' + repo + '/releases/latest', 'data-github': '', text: label }); }

  function render(repo, d) {
    var app = APPS[repo], body = dlg.querySelector('.dl-body');
    body.textContent = '';
    var latest = latestOf(d);
    if (!latest) {
      body.appendChild(h('p', { class: 'dl-msg', role: 'status', text: T.offline }));
      if (app.fallback) body.appendChild(dlButton(app.fallback, T.offlineDl, true));
      body.appendChild(h('dl', { class: 'dl-facts' }, [h('dt', { text: T.req }), h('dd', { text: app.req })]));
      body.appendChild(h('p', { class: 'dl-foot' }, [ghLink(repo, T.ghRelease + ' ↗')]));
      return;
    }
    var inst = installerOf(repo, latest) || pick(latest.assets);
    var facts = h('dl', { class: 'dl-facts' }, [
      h('dt', { text: T.version }), h('dd', { class: 'ltr', text: verTag(latest.tag) }),
      h('dt', { text: T.date }), h('dd', { text: df.format(new Date(latest.date)) })]);
    if (inst) { facts.appendChild(h('dt', { text: T.size })); facts.appendChild(h('dd', { text: size(inst.s) })); }
    facts.appendChild(h('dt', { text: T.req })); facts.appendChild(h('dd', { text: app.req }));
    var sha = inst && /^sha256:/i.test(inst.h) ? inst.h.slice(7) : '';
    if (sha) {
      var copy = h('button', { class: 'dl-copy', type: 'button', text: T.copy, 'aria-label': T.copy + ' SHA-256' });
      copy.addEventListener('click', function () {
        if (navigator.clipboard) navigator.clipboard.writeText(sha).then(function () { copy.textContent = T.copied; setTimeout(function () { copy.textContent = T.copy; }, 1800); }, function () {});
      });
      facts.appendChild(h('dt', { text: T.sha, title: T.verify }));
      facts.appendChild(h('dd', { class: 'dl-hash' }, [h('code', { text: sha }), copy]));
    }
    body.appendChild(facts);
    if (inst) body.appendChild(dlButton(assetUrl(repo, latest.tag, inst.n), T.download, true, verTag(latest.tag), inst.s));
    else if (app.fallback) body.appendChild(dlButton(app.fallback, T.offlineDl, true));
    var others = latest.assets.filter(function (x) { return x !== inst && !/\.(blockmap|yml|yaml|sig|json|txt)$/i.test(x.n) && !/^latest/i.test(x.n); });
    if (others.length) {
      body.appendChild(h('h3', { text: T.files }));
      body.appendChild(h('ul', { class: 'dl-files' }, others.map(function (x) {
        return h('li', null, [h('a', { href: assetUrl(repo, latest.tag, x.n) }, [h('span', { text: x.n }), h('span', { text: size(x.s) })])]);
      })));
    }
    body.appendChild(h('h3', { text: T.notes }));
    body.appendChild(markdown(latest.body));
    var older = d.rels.filter(function (r) { return r !== latest; }).slice(0, 10);
    if (older.length) {
      var ol = h('ol');
      older.forEach(function (r) {
        var a = installerOf(repo, r) || pick(r.assets);
        var row = h('div', { class: 'row' }, [h('b', { text: verTag(r.tag) }), h('span', { text: df.format(new Date(r.date)) })]);
        if (a) row.appendChild(h('a', { href: assetUrl(repo, r.tag, a.n), text: T.download + ' · ' + size(a.s) }));
        var li = h('li', null, [row]);
        if (r.body && r.body.trim()) li.appendChild(h('details', null, [h('summary', { text: T.showNotes }), markdown(r.body)]));
        ol.appendChild(li);
      });
      body.appendChild(h('details', { class: 'dl-older' }, [h('summary', { text: T.older }), ol]));
    }
    body.appendChild(h('p', { class: 'dl-foot' }, [h('span', { text: sha ? T.verify : '' }), ghLink(repo, T.ghFoot + ' ↗')]));
  }

  function openDl(repo, from) {
    var app = APPS[repo]; if (!app) return;
    ensureDialog();
    opener = from || (document.activeElement !== document.body ? document.activeElement : null);
    dlg.querySelector('.dl-head img').src = base + app.icon;
    dlg.querySelector('#dl-title').textContent = app.name;
    var body = dlg.querySelector('.dl-body');
    body.textContent = ''; body.appendChild(h('p', { class: 'dl-loading', role: 'status', text: T.loading }));
    if (!dlg.open) dlg.showModal();
    load(repo).then(function (d) { if (dlg.open && dlg.querySelector('#dl-title').textContent === app.name) render(repo, d); });
  }
  function fromHash() {
    var m = location.hash.match(/^#download-([a-z-]+)$/);
    if (m && SLUG[m[1]]) openDl(SLUG[m[1]]);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-dl]');
    /* a download button that still points at a release page (not a file) resolves through the dialog instead */
    if (a && !a.hasAttribute('data-resolved') && !/\/releases\/(latest\/)?download\//.test(a.href)) {
      e.preventDefault(); openDl(a.getAttribute('data-dl'), a);
    }
  });

  /* ---------- header shadow once scrolled ---------- */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ---------- reveal sections once ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) reveals.forEach(function (el) { el.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- hero: the four app windows ---------- */
  var stage = document.querySelector('[data-stage]');
  if (!stage) return;
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tablist [role="tab"]'));
  var wins = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
  var bar = document.querySelector('.tabs'), pp = bar.querySelector('.playpause');
  var n = tabs.length, active = 0, carousel = matchMedia('(max-width: 719px)');
  var playing = !reduce, hover = false, focusIn = false, elapsed = 0, last = 0, DUR = 5000;

  function select(i, opts) {
    opts = opts || {};
    active = (i + n) % n; elapsed = 0;
    tabs.forEach(function (t, j) {
      var on = j === active;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; t.style.setProperty('--p', 0);
      wins[j].setAttribute('data-pos', (j - active + n) % n);
      if (on) { wins[j].removeAttribute('aria-hidden'); } else wins[j].setAttribute('aria-hidden', 'true');
    });
    if (opts.focus) tabs[active].focus();
    if (opts.scroll && carousel.matches) {
      wins[active].scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  }
  function userPick(i, focus) { setPlaying(false); select(i, { focus: focus, scroll: true }); }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { userPick(i); });
    t.addEventListener('keydown', function (e) {
      var rtl = getComputedStyle(t).direction === 'rtl', k = e.key, to = null;
      if (k === 'ArrowRight') to = i + (rtl ? -1 : 1);
      else if (k === 'ArrowLeft') to = i + (rtl ? 1 : -1);
      else if (k === 'Home') to = 0; else if (k === 'End') to = n - 1;
      if (to !== null) { e.preventDefault(); userPick(to, true); }
    });
  });
  wins.forEach(function (w, i) { w.addEventListener('click', function () { if (i !== active && !carousel.matches) userPick(i); }); });

  /* phones: a swipeable carousel; keep the tabs in sync with the window in view */
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      if (!carousel.matches) return;
      entries.forEach(function (en) { if (en.isIntersecting && en.intersectionRatio > 0.6) { var i = wins.indexOf(en.target); if (i !== active) select(i); } });
    }, { root: stage, threshold: [0.6] });
    wins.forEach(function (w) { cio.observe(w); });
  }

  /* auto-rotation: every 5 s on wide screens; pauses on hover, focus or a hidden tab; off with reduced motion */
  function setPlaying(on) {
    playing = on; elapsed = 0;
    if (on) bar.setAttribute('data-playing', ''); else bar.removeAttribute('data-playing');
    pp.setAttribute('aria-label', pp.getAttribute(on ? 'data-label-pause' : 'data-label-play'));
    tabs[active].style.setProperty('--p', 0);
  }
  if (!reduce) {
    bar.setAttribute('data-auto', ''); setPlaying(true);
    pp.addEventListener('click', function () { setPlaying(!playing); });
    var zone = stage.parentNode;
    zone.addEventListener('mouseenter', function () { hover = true; });
    zone.addEventListener('mouseleave', function () { hover = false; });
    zone.addEventListener('focusin', function (e) { if (e.target !== pp) focusIn = true; });
    zone.addEventListener('focusout', function () { focusIn = false; });
    var tick = function (now) {
      var dt = Math.min(now - (last || now), 100); last = now;
      var run = playing && !hover && !focusIn && !document.hidden && !carousel.matches && !(dlg && dlg.open);
      if (run) {
        elapsed += dt;
        if (elapsed >= DUR) select(active + 1);
        tabs[active].style.setProperty('--p', Math.min(elapsed / DUR, 1));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
})();
