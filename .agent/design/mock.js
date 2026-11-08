// Mockup helper (NOT app code).
// - ?theme=dark|light forces a theme (the gallery passes it).
// - <html data-pseudo="en-XA"> or ?locale=en-XA turns UI strings into the en-XA pseudo-locale
//   (same transform as apps/web/src/lib/pseudo-locale.ts). User content is left alone:
//   anything inside [data-user], and text containing digits or ৳ (amounts, dates, IDs).
// - Renders Lucide icons (<i data-lucide="name">).
(function () {
  var params = new URLSearchParams(location.search);
  var t = params.get('theme');
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  if (params.get('locale') === 'en-XA') document.documentElement.setAttribute('data-pseudo', 'en-XA');

  var MAP = { a: 'å', A: 'Å', b: 'ƀ', B: 'Ɓ', c: 'ç', C: 'Ç', d: 'ð', D: 'Ð', e: 'é', E: 'É', f: 'ƒ', F: 'Ƒ', g: 'ĝ', G: 'Ĝ', h: 'ĥ', H: 'Ĥ', i: 'î', I: 'Î', j: 'ĵ', J: 'Ĵ', k: 'ķ', K: 'Ķ', l: 'ļ', L: 'Ļ', n: 'ñ', N: 'Ñ', o: 'ő', O: 'Ő', p: 'þ', P: 'Þ', r: 'ŕ', R: 'Ŕ', s: 'š', S: 'Š', t: 'ţ', T: 'Ţ', u: 'û', U: 'Û', w: 'ŵ', W: 'Ŵ', y: 'ý', Y: 'Ý', z: 'ž', Z: 'Ž' };
  function pseudo(s) {
    var core = s.trim();
    if (!core) return s;
    var out = '';
    for (var i = 0; i < core.length; i++) out += MAP[core[i]] || core[i];
    var pad = new Array(Math.max(1, Math.floor(core.length * 0.4)) + 1).join('·');
    var lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + '[' + out + pad + ']' + trail;
  }
  function applyPseudo() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var nodes = [];
    for (var n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
    nodes.forEach(function (node) {
      var p = node.parentElement;
      if (!p || !node.textContent.trim()) return;
      if (p.closest('script, style, [data-user], .avatar, .ph, .sr-only, [data-no-pseudo]')) return;
      if (/[0-9৳]/.test(node.textContent)) return;
      node.textContent = pseudo(node.textContent);
    });
    ['aria-label', 'placeholder', 'title'].forEach(function (a) {
      document.querySelectorAll('[' + a + ']').forEach(function (el) {
        if (!el.closest('[data-user]')) el.setAttribute(a, pseudo(el.getAttribute(a)));
      });
    });
  }

  function ready() {
    if (document.documentElement.getAttribute('data-pseudo') === 'en-XA') applyPseudo();
    if (window.lucide) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
    // data-proto: tiny prototype toggles (tabs) — never production logic
    document.querySelectorAll('[data-proto="tabs"]').forEach(function (list) {
      list.addEventListener('click', function (e) {
        var tab = e.target.closest('[role="tab"]');
        if (!tab) return;
        list.querySelectorAll('[role="tab"]').forEach(function (x) { x.setAttribute('aria-selected', String(x === tab)); });
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
