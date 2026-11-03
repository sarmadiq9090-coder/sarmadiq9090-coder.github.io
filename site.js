/* FastKiwi site script: live release info from the GitHub API (no tracking, cached for an hour),
   the on-site download dialog, the "What's new" releases page, the hero app stage and scroll reveals.
   Remote text (release notes) is only ever inserted as text nodes, never as HTML. */
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
  var doc = document, root = doc.documentElement, ar = root.lang === 'ar';
  var nf = new Intl.NumberFormat(ar ? 'ar' : 'en', { notation: 'compact', maximumFractionDigits: 1 });
  var df = new Intl.DateTimeFormat(ar ? 'ar' : 'en', { year: 'numeric', month: 'short', day: 'numeric' });
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var script = doc.currentScript, base = script ? new URL('.', script.src).href : '';

  /* per-app details (hash slug, icon, name, Windows requirements, static direct-download fallback) */
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
    size: 'حجم المثبّت', req: 'المتطلبات', sha: 'SHA-256', copy: 'نسخ', copied: 'تم النسخ', download: 'تنزيل', files: 'ملفات أخرى',
    notes: 'ما الجديد', noNotes: 'لا توجد ملاحظات لهذا الإصدار.', older: 'الإصدارات السابقة', showNotes: 'الملاحظات',
    offline: 'تعذّر الاتصال بـ GitHub لجلب معلومات آخر إصدار. جرّب لاحقاً، أو استخدم الرابط أدناه.',
    offlineDl: 'تنزيل آخر إصدار', ghRelease: 'افتح الإصدار على GitHub', ghFoot: 'الإصدار على GitHub', verify: 'تحقق من الملف بمقارنة بصمة SHA-256.',
    allNotes: 'كل الإصدارات وملاحظاتها', relNotes: 'ملاحظات الإصدار', viewGh: 'عرض الإصدارات على GitHub',
    relOffline: 'تعذّر جلب معلومات الإصدار الآن (قد يكون GitHub غير متاح). يمكنك التنزيل مباشرة:', relOfflineNo: 'تعذّر جلب معلومات الإصدار الآن (قد يكون GitHub غير متاح). لا يوجد رابط تنزيل ثابت لهذا البرنامج، فافتح إصداراته على GitHub:',
    prev: function (n) { return 'الإصدارات السابقة (' + n + ')'; }, preRel: 'تجريبي'
  } : {
    title: 'Download & release notes', close: 'Close', loading: 'Getting the latest release…', version: 'Version', date: 'Released',
    size: 'Installer size', req: 'Requirements', sha: 'SHA-256', copy: 'Copy', copied: 'Copied', download: 'Download', files: 'Other files',
    notes: "What's new", noNotes: 'No notes for this release.', older: 'Earlier versions', showNotes: 'Notes',
    offline: "We couldn't reach GitHub to load the latest release. Try again later, or use the link below.",
    offlineDl: 'Download the latest version', ghRelease: 'Open the release on GitHub', ghFoot: 'Release on GitHub', verify: 'Check the file by comparing its SHA-256 fingerprint.',
    allNotes: 'All versions and their notes', relNotes: 'Release notes', viewGh: 'View releases on GitHub',
    relOffline: "We couldn't load the release details right now (GitHub may be unreachable). You can still download directly:", relOfflineNo: "We couldn't load the release details right now (GitHub may be unreachable). This app has no fixed download link, so open its releases on GitHub:",
    prev: function (n) { return 'Previous releases (' + n + ')'; }, preRel: 'Pre-release'
  };

  /* the demo video loads and plays only while it is on screen (never with reduced motion); until then it shows its poster */
  var v = doc.querySelector('video.demo[data-autoplay]');
  if (v && !reduce && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
      });
    }, { rootMargin: '200px 0px' }).observe(v);
  }

  /* ---------- GitHub data ---------- */
  function cached(url, shape) {
    var key = 'fk2:' + url, now = Date.now();
    try { var c = JSON.parse(localStorage.getItem(key)); if (c && now - c.t < 3600e3) return Promise.resolve(c.d); } catch (e) {}
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (d) {
      d = shape ? shape(d) : d;
      try { localStorage.setItem(key, JSON.stringify({ t: now, d: d })); } catch (e) {}
      return d;
    });
  }
  function slim(rels) {
    return rels.filter(function (r) { return !r.draft; }).map(function (r) {
      return { tag: r.tag_name, name: r.name || '', pre: r.prerelease, date: r.published_at, url: r.html_url, body: r.body || '',
        assets: (r.assets || []).map(function (a) { return { n: a.name, s: a.size, d: a.download_count, h: a.digest || '' }; }) };
    });
  }
  function slimInfo(i) { return { stargazers_count: i.stargazers_count }; }
  var store = {};
  function load(repo) {
    if (!store[repo]) {
      var b = 'https://api.github.com/repos/' + OWNER + '/' + repo;
      store[repo] = Promise.all([cached(b, slimInfo).catch(function () { return null; }),
        cached(b + '/releases?per_page=100', slim).catch(function () { return null; })])
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
  /* files a person might want; updater metadata and checksum lists are left out */
  function extraAssets(rel, inst) {
    return rel.assets.filter(function (x) { return x !== inst && !/\.(blockmap|yml|yaml|sig|json|txt|sha256|sha512|asc)$/i.test(x.n) && !/^latest/i.test(x.n); });
  }
  function shaOf(a) { return a && /^sha256:/i.test(a.h) ? a.h.slice(7) : ''; }

  /* ---------- small DOM helpers ---------- */
  function h(tag, attrs, kids) {
    var e = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return e;
  }
  var ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16"/></svg>';
  function svg(markup) { var t = doc.createElement('template'); t.innerHTML = markup; return t.content.firstChild; } /* static, trusted markup only */

  /* ---------- release notes: a safe markdown subset built from DOM text nodes ----------
     Handles headings, lists, task lists, quotes, code blocks, tables and <div dir="rtl"> blocks.
     Links become their text, images are dropped, any other HTML is stripped. Never uses innerHTML. */
  function cleanInline(text) {
    return text
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:pull|issues)\/(\d+)/g, '#$1')
      .replace(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/compare\/(\S+)/g, '$1')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  function inlineCode(parent, text) { /* code spans inside bold text */
    text.split(/(`[^`]+`)/).forEach(function (p) { if (p) parent.appendChild(/^`[^`]+`$/.test(p) ? h('code', { text: p.slice(1, -1) }) : doc.createTextNode(p)); });
  }
  function inline(parent, text) {
    cleanInline(text).split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|~~[^~]+~~)/).forEach(function (part) {
      if (!part) return;
      if (/^(\*\*|__)[\s\S]+(\*\*|__)$/.test(part)) { var st = h('strong'); inlineCode(st, part.slice(2, -2)); parent.appendChild(st); }
      else if (/^`[^`]+`$/.test(part)) parent.appendChild(h('code', { text: part.slice(1, -1) }));
      else if (/^~~[\s\S]+~~$/.test(part)) parent.appendChild(doc.createTextNode(part.slice(2, -2)));
      else parent.appendChild(doc.createTextNode(part.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')));
    });
  }
  function markdown(src, opts) {
    opts = opts || {};
    var hTag = opts.heading || 'h4';
    var box = h('div', { class: 'md' }), list = null, para = null, code = null, table = null, dirs = [];
    var text = String(src || '').replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
    function cur() { return dirs.length ? dirs[dirs.length - 1] : 'auto'; }
    function add(el) { el.setAttribute('dir', cur()); box.appendChild(el); return el; }
    function end() { list = null; para = null; table = null; }
    function cells(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
    text.split('\n').forEach(function (line) {
      var m;
      if (code) { if (/^\s*(```|~~~)/.test(line)) code = null; else code.textContent += (code.textContent ? '\n' : '') + line; return; }
      if (/^\s*(```|~~~)/.test(line)) { end(); code = h('code'); var pre = h('pre', null, [code]); box.appendChild(pre); return; }
      if ((m = line.match(/^\s*<div[^>]*\bdir=["']?(rtl|ltr)["']?[^>]*>\s*$/i))) { end(); dirs.push(m[1].toLowerCase()); return; }
      if (/^\s*<\/div>\s*$/i.test(line)) { end(); dirs.pop(); return; }
      if (/^\s*<\/?(details|summary|div|p|picture|source|table|thead|tbody|tr|center)\b[^>]*>\s*$/i.test(line)) { end(); return; }
      if (!line.trim()) { end(); return; }
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (/^[\s|:\-]+$/.test(line)) return; /* the |---| separator row */
        if (!table) { list = null; para = null; table = h('tbody'); var wrap = h('div', { class: 'md-table' }, [h('table', null, [table])]); add(wrap); }
        var row = h('tr'), first = !table.firstChild;
        cells(line).forEach(function (c) { var cell = h(first ? 'th' : 'td'); inline(cell, c); row.appendChild(cell); });
        table.appendChild(row); return;
      }
      table = null;
      if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { end(); var hd = add(h(hTag)); inline(hd, m[1].replace(/\s#+\s*$/, '')); return; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { end(); return; }
      if ((m = line.match(/^\s*>\s?(.*)$/))) { end(); var q = add(h('p', { class: 'quote' })); inline(q, m[1]); return; }
      if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
        var tag = /\d/.test(m[2]) ? 'ol' : 'ul', body = m[3].replace(/^\[([ xX])\]\s+/, function (_, x) { return x.trim() ? '✓ ' : '☐ '; });
        if (!list || list.tagName.toLowerCase() !== tag) { para = null; list = add(h(tag)); }
        var li = h('li', cur() === 'auto' ? { dir: 'auto' } : null); if (m[1].length >= 2) li.className = 'sub'; inline(li, body); list.appendChild(li); return;
      }
      if (list && /^\s{2,}\S/.test(line)) { inline(list.lastChild, ' ' + line.trim()); return; }
      list = null;
      var t = line.trim(); if (!cleanInline(t).trim()) return;
      if (!para) { para = add(h('p')); } else para.appendChild(doc.createTextNode(' '));
      inline(para, t);
    });
    if (!box.firstChild) box.appendChild(h('p', { text: T.noNotes }));
    return box;
  }
  window.FKmarkdown = markdown; /* exposed for tests */

  function copyButton(textToCopy) {
    var b = h('button', { class: 'dl-copy', type: 'button', text: T.copy, 'aria-label': T.copy + ' SHA-256' });
    b.addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(textToCopy).then(function () { b.textContent = T.copied; setTimeout(function () { b.textContent = T.copy; }, 1800); }, function () {});
    });
    return b;
  }
  function facts(repo, rel, inst) {
    var app = APPS[repo];
    var dl = h('dl', { class: 'dl-facts' }, [
      h('dt', { text: T.version }), h('dd', { class: 'ltr', text: verTag(rel.tag) }),
      h('dt', { text: T.date }), h('dd', { text: df.format(new Date(rel.date)) })]);
    if (inst) { dl.appendChild(h('dt', { text: T.size })); dl.appendChild(h('dd', { text: size(inst.s) })); }
    dl.appendChild(h('dt', { text: T.req })); dl.appendChild(h('dd', { text: app.req }));
    var sha = shaOf(inst);
    if (sha) {
      dl.appendChild(h('dt', { text: T.sha, title: T.verify }));
      dl.appendChild(h('dd', { class: 'dl-hash' }, [h('code', { text: sha }), copyButton(sha)]));
    }
    return dl;
  }
  function dlButton(href, label, primary, ver, bytes) {
    var a = h('a', { class: 'btn ' + (primary ? 'btn-primary dl-main' : 'btn-ghost'), href: href });
    a.appendChild(svg(ICON_DL)); a.appendChild(doc.createTextNode(label));
    if (ver) { a.appendChild(doc.createTextNode(' ')); a.appendChild(h('span', { class: 'ltr', text: ver })); }
    if (bytes) { a.appendChild(doc.createTextNode(' · ')); a.appendChild(h('span', { text: size(bytes) })); }
    return a;
  }
  function fileList(repo, rel, files) {
    return h('ul', { class: 'dl-files' }, files.map(function (x) {
      return h('li', null, [h('a', { href: assetUrl(repo, rel.tag, x.n) }, [h('span', { text: x.n }), h('span', { text: size(x.s) })])]);
    }));
  }
  function ghLink(repo, label, path, cls) {
    return h('a', { href: 'https://github.com/' + OWNER + '/' + repo + '/releases' + (path || ''), 'data-github': '', class: cls || '', text: label });
  }

  /* ---------- home: download buttons, release lines, stats ---------- */
  /* only the apps this page shows are asked for (the home page's totals need all four) */
  var needed = REPOS.filter(function (r) { return doc.querySelector('[data-stat], a[data-dl="' + r + '"], .rel[data-repo="' + r + '"]'); });
  if (needed.length) Promise.all(needed.map(load)).then(function (all) {
    var stars = 0, dl = 0, rel = 0, okStars = false, okRel = false;
    all.forEach(function (a) {
      if (a.info) { stars += a.info.stargazers_count || 0; okStars = true; }
      if (!a.rels) return;
      okRel = true; rel += a.rels.length;
      a.rels.forEach(function (r) { r.assets.forEach(function (x) { dl += x.d; }); });
      var latest = latestOf(a);
      var el = doc.querySelector('.rel[data-repo="' + a.repo + '"]');
      /* download buttons: direct link to the latest installer, with its version */
      var inst = installerOf(a.repo, latest);
      if (inst) {
        var href = assetUrl(a.repo, latest.tag, inst.n);
        doc.querySelectorAll('a[data-dl="' + a.repo + '"]').forEach(function (btn) {
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
        var bar = doc.querySelector('[data-news]');
        var days = (Date.now() - new Date(latest.date)) / 864e5;
        if (bar && days < 30) { bar.querySelector('[data-news-ver]').textContent = latest.tag; bar.hidden = false; }
      }
    });
    function show(k, n, ok, min) {
      if (n < (min || 1)) return;
      var li = doc.querySelector('[data-stat="' + k + '"]');
      if (li && ok && n > 0) { li.querySelector('[data-n]').textContent = nf.format(n); li.hidden = false; }
    }
    /* small numbers are hidden rather than shown, never inflated */
    show('stars', stars, okStars, 100); show('downloads', dl, okRel, 1000); show('releases', rel, okRel, 10);
  });

  /* ---------- quick download dialog ---------- */
  var SLUG = {}; Object.keys(APPS).forEach(function (r) { SLUG[APPS[r].slug] = r; });
  var dlg, opener = null;
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
    doc.body.appendChild(dlg);
    return dlg;
  }
  function releasesHref(repo) { return base + (ar ? 'ar/' : '') + 'releases/#' + APPS[repo].slug; }
  function renderDialog(repo, d) {
    var app = APPS[repo], body = dlg.querySelector('.dl-body');
    body.textContent = '';
    var latest = latestOf(d);
    if (!latest) {
      body.appendChild(h('p', { class: 'dl-msg', role: 'status', text: T.offline }));
      if (app.fallback) body.appendChild(dlButton(app.fallback, T.offlineDl, true));
      body.appendChild(h('dl', { class: 'dl-facts' }, [h('dt', { text: T.req }), h('dd', { text: app.req })]));
      body.appendChild(h('p', { class: 'dl-foot' }, [ghLink(repo, T.ghRelease + ' ↗', '/latest')]));
      return;
    }
    var inst = installerOf(repo, latest) || pick(latest.assets);
    body.appendChild(facts(repo, latest, inst));
    if (inst) body.appendChild(dlButton(assetUrl(repo, latest.tag, inst.n), T.download, true, verTag(latest.tag), inst.s));
    else if (app.fallback) body.appendChild(dlButton(app.fallback, T.offlineDl, true));
    var others = extraAssets(latest, inst);
    if (others.length) { body.appendChild(h('h3', { text: T.files })); body.appendChild(fileList(repo, latest, others)); }
    body.appendChild(h('h3', { text: T.notes }));
    var notes = markdown(latest.body); notes.classList.add('dl-notes'); body.appendChild(notes);
    body.appendChild(h('p', { class: 'dl-foot' }, [h('a', { href: releasesHref(repo), text: T.allNotes }), ghLink(repo, T.ghFoot + ' ↗', '/latest')]));
  }
  function openDl(repo, from) {
    var app = APPS[repo]; if (!app) return;
    ensureDialog();
    opener = from || (doc.activeElement !== doc.body ? doc.activeElement : null);
    dlg.querySelector('.dl-head img').src = base + app.icon;
    dlg.querySelector('#dl-title').textContent = app.name;
    var body = dlg.querySelector('.dl-body');
    body.textContent = ''; body.appendChild(h('p', { class: 'dl-loading', role: 'status', text: T.loading }));
    if (!dlg.open) dlg.showModal();
    load(repo).then(function (d) { if (dlg.open && dlg.querySelector('#dl-title').textContent === app.name) renderDialog(repo, d); });
  }
  function fromHash() {
    var m = location.hash.match(/^#download-([a-z-]+)$/);
    if (m && SLUG[m[1]]) openDl(SLUG[m[1]]);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-dl]');
    /* a download button that still points at a release page (not a file) resolves through the dialog instead */
    if (a && !a.hasAttribute('data-resolved') && !/\/releases\/(latest\/)?download\//.test(a.href)) {
      e.preventDefault(); openDl(a.getAttribute('data-dl'), a);
    }
  });

  /* ---------- "What's new" releases page ---------- */
  var relSecs = doc.querySelectorAll('[data-release]'), relDone = [], userScrolled = false;
  if (relSecs.length) ['wheel', 'touchmove', 'keydown'].forEach(function (ev) { window.addEventListener(ev, function () { userScrolled = true; }, { passive: true, once: true }); });
  relSecs.forEach(function (sec) {
    var repo = sec.getAttribute('data-release'), app = APPS[repo], box = sec.querySelector('[data-release-body]');
    if (!app || !box) return;
    relDone.push(load(repo).then(function (d) {
      box.textContent = ''; box.removeAttribute('aria-busy');
      var latest = latestOf(d);
      if (!latest) {
        var off = h('div', { class: 'rp-off' }, [h('p', { class: 'dl-msg', role: 'status', text: app.fallback ? T.relOffline : T.relOfflineNo })]);
        var row = h('div', { class: 'cta' });
        if (app.fallback) row.appendChild(dlButton(app.fallback, T.offlineDl, true));
        row.appendChild(ghLink(repo, T.viewGh, '', 'btn btn-ghost'));
        off.appendChild(row);
        off.appendChild(h('p', { class: 'fine', text: T.req + ': ' + app.req }));
        box.appendChild(off);
        return;
      }
      var inst = installerOf(repo, latest) || pick(latest.assets);
      var side = h('div', { class: 'rp-side' });
      if (latest.name && latest.name.replace(/\s/g, '') !== latest.tag) side.appendChild(h('p', { class: 'rp-title', dir: 'auto', text: latest.name }));
      side.appendChild(facts(repo, latest, inst));
      if (inst) side.appendChild(dlButton(assetUrl(repo, latest.tag, inst.n), T.download, true, verTag(latest.tag), inst.s));
      var others = extraAssets(latest, inst);
      if (others.length) { side.appendChild(h('h3', { class: 'rp-h', text: T.files })); side.appendChild(fileList(repo, latest, others)); }
      side.appendChild(h('p', { class: 'fine' }, [ghLink(repo, T.ghFoot + ' ↗', '/tag/' + encodeURIComponent(latest.tag))]));
      var notes = h('div', { class: 'rp-notes' }, [h('h3', { class: 'rp-h', text: T.relNotes + ' · ' }), markdown(latest.body)]);
      notes.firstChild.appendChild(h('span', { class: 'ltr', text: verTag(latest.tag) }));
      box.appendChild(h('div', { class: 'rp-grid' }, [side, notes]));
      var older = d.rels.filter(function (r) { return r !== latest; });
      if (older.length) {
        var ol = h('ol', { class: 'rp-list' });
        older.forEach(function (r) {
          var a = installerOf(repo, r) || pick(r.assets);
          var sum = h('summary', null, [h('b', { class: 'ltr', text: verTag(r.tag) }), h('span', { text: df.format(new Date(r.date)) })]);
          if (r.pre) sum.appendChild(h('span', { class: 'tag', text: T.preRel }));
          var item = h('details', null, [sum]);
          item.addEventListener('toggle', function () {
            if (!item.open || item.querySelector('.md')) return;
            if (r.name && r.name.replace(/\s/g, '') !== r.tag) item.appendChild(h('p', { class: 'rp-title', dir: 'auto', text: r.name }));
            item.appendChild(markdown(r.body));
          });
          var li = h('li', null, [item]);
          if (a) li.appendChild(h('a', { class: 'rp-dl', href: assetUrl(repo, r.tag, a.n), 'aria-label': T.download + ' ' + verTag(r.tag) }, [svg(ICON_DL), h('span', { text: size(a.s) })]));
          ol.appendChild(li);
        });
        box.appendChild(h('details', { class: 'rp-older' }, [h('summary', { text: T.prev(older.length) }), ol]));
      }
    }));
  });
  /* sections grow when their data arrives: keep a deep link such as #lemon on its section */
  if (relDone.length) Promise.all(relDone).then(function () {
    var t = location.hash && doc.getElementById(location.hash.slice(1));
    if (t && t.hasAttribute('data-release') && !userScrolled) t.scrollIntoView();
  });
  /* in-page app switcher: mark the section in view */
  var chips = doc.querySelectorAll('.rp-switch a[href^="#"]');
  if (chips.length && 'IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        chips.forEach(function (c) { if (c.getAttribute('href') === '#' + en.target.id) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current'); });
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    chips.forEach(function (c) { var t = doc.getElementById(c.getAttribute('href').slice(1)); if (t) sio.observe(t); });
  }

  /* ---------- wide tables: show a fade + hint while there is more to scroll ---------- */
  doc.querySelectorAll('.table-wrap').forEach(function (w) {
    function upd() {
      var max = w.scrollWidth - w.clientWidth, x = Math.abs(w.scrollLeft);
      w.toggleAttribute('data-more-end', max > 2 && x < max - 2);
      w.toggleAttribute('data-more-start', max > 2 && x > 2);
    }
    w.addEventListener('scroll', upd, { passive: true }); window.addEventListener('resize', upd); upd();
  });

  /* ---------- header shadow once scrolled ---------- */
  var header = doc.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ---------- reveal sections once ---------- */
  var reveals = doc.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) reveals.forEach(function (el) { el.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- hero: the four app windows ---------- */
  var stage = doc.querySelector('[data-stage]');
  if (!stage) return;
  var tabs = Array.prototype.slice.call(doc.querySelectorAll('.tablist [role="tab"]'));
  var wins = tabs.map(function (t) { return doc.getElementById(t.getAttribute('aria-controls')); });
  var bar = doc.querySelector('.tabs'), pp = bar.querySelector('.playpause');
  var n = tabs.length, active = 0, carousel = matchMedia('(max-width: 719px)');
  var playing = !reduce, hover = false, focusIn = false, elapsed = 0, last = 0, DUR = 5000;

  /* centre a window in the phone carousel without moving the page vertically (works in RTL too) */
  function centre(i, smooth) {
    var w = wins[i].getBoundingClientRect(), s = stage.getBoundingClientRect();
    var delta = (w.left + w.width / 2) - (s.left + s.width / 2);
    if (Math.abs(delta) > 1) stage.scrollBy({ left: delta, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }
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
    if (opts.scroll && carousel.matches) centre(active, true);
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

  /* phones: a swipeable carousel; start on the first window, keep the tabs in sync with the window in view */
  if (carousel.matches) centre(active, false);
  carousel.addEventListener && carousel.addEventListener('change', function (e) { if (e.matches) centre(active, false); });
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
      var run = playing && !hover && !focusIn && !doc.hidden && !carousel.matches && !(dlg && dlg.open);
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
