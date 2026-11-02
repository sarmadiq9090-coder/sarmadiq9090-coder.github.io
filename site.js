/* FastKiwi: live release info from the GitHub API (no tracking, cached for an hour). */
(function () {
  var OWNER = 'sarmadiq9090-coder', REPOS = ['arabic-file-search', 'Remember-Me', 'local-ai-chat'];
  var ar = document.documentElement.lang === 'ar';
  var nf = new Intl.NumberFormat(ar ? 'ar' : 'en', { notation: 'compact', maximumFractionDigits: 1 });
  var df = new Intl.DateTimeFormat(ar ? 'ar' : 'en', { year: 'numeric', month: 'short', day: 'numeric' });

  var v = document.querySelector('video.demo');
  if (v && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); }

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
      return { tag: r.tag_name, pre: r.prerelease, date: r.published_at, url: r.html_url,
        assets: r.assets.map(function (a) { return { n: a.name, s: a.size, d: a.download_count }; }) };
    });
  }
  function size(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }
  function pick(assets) {
    return assets.filter(function (a) { return a.n === 'bahth.exe'; })[0] ||
      assets.filter(function (a) { return /\.(exe|msi)$/i.test(a.n) && !/arm64|x86|setup.*\.blockmap/i.test(a.n); })[0] ||
      assets.filter(function (a) { return /\.(exe|msi|zip)$/i.test(a.n); })[0];
  }

  Promise.all(REPOS.map(function (r) {
    var base = 'https://api.github.com/repos/' + OWNER + '/' + r;
    return Promise.all([cached(base).catch(function () { return null; }),
      cached(base + '/releases?per_page=100').then(slim).catch(function () { return null; })])
      .then(function (x) { return { repo: r, info: x[0], rels: x[1] }; });
  })).then(function (all) {
    var stars = 0, dl = 0, rel = 0, okStars = false, okRel = false;
    all.forEach(function (a) {
      if (a.info) { stars += a.info.stargazers_count || 0; okStars = true; }
      if (!a.rels) return;
      okRel = true; rel += a.rels.length;
      a.rels.forEach(function (r) { r.assets.forEach(function (x) { dl += x.d; }); });
      var latest = a.rels.filter(function (r) { return !r.pre; })[0];
      var el = document.querySelector('.rel[data-repo="' + a.repo + '"]');
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
          bar.querySelector('[data-news-link]').href = latest.url;
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
})();
