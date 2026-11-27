/* FastKiwi scrapbook pages: screenshot lightbox and the before/after slider. No network requests. */
(function () {
  var doc = document;
  /* lightbox: every .shot button opens its full-size image in a modal dialog; Esc or the close button closes it */
  var lb = doc.getElementById('lightbox');
  if (lb && lb.showModal) {
    var cap = lb.querySelector('figcaption'), img = null, opener = null;
    doc.querySelectorAll('button.shot[data-src]').forEach(function (b) {
      b.addEventListener('click', function () {
        opener = b;
        if (!img) { img = doc.createElement('img'); cap.parentNode.insertBefore(img, cap); } /* created on first use: the page never holds an image without a source */
        img.alt = b.getAttribute('data-cap') || ''; img.src = b.getAttribute('data-src');
        cap.textContent = b.getAttribute('data-cap') || '';
        lb.showModal(); lb.querySelector('.lb-close').focus();
      });
    });
    lb.querySelector('.lb-close').addEventListener('click', function () { lb.close(); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
    lb.addEventListener('close', function () { if (opener && opener.isConnected) opener.focus(); opener = null; });
  }
  /* before/after slider: the range input moves the divider (mouse, touch and arrow keys) */
  var r = doc.getElementById('cmp-range'), c = doc.getElementById('compare');
  if (r && c) {
    var set = function () { c.style.setProperty('--pos', r.value + '%'); };
    r.addEventListener('input', set); set();
  }
})();
