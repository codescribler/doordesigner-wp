// assets/js/wizard/review.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Review = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function render(container, ctx) {
    container.innerHTML = '';
    container.appendChild(el('div', 'hd-dd__steptitle', 'Your door'));
    var wrap = el('div', 'hd-dd__review');
    var dl = document.createElement('dl');
    if (ctx.typeLabel) {
      dl.appendChild(el('dt', null, 'Door type'));
      dl.appendChild(el('dd', null, ctx.typeLabel));
    }
    ctx.steps.forEach(function (s) {
      var chosen = ctx.design[s.heading];
      if (!chosen) { return; }
      dl.appendChild(el('dt', null, s.label));
      dl.appendChild(el('dd', null, chosen.label));
      var edit = el('button', 'hd-dd__edit', 'Edit'); edit.type = 'button';
      edit.addEventListener('click', function () { ctx.onEdit(s.key); });
      dl.appendChild(edit);
    });
    wrap.appendChild(dl);
    container.appendChild(wrap);
    var cta = el('button', 'hd-dd__cta', 'Get my free quote'); cta.type = 'button';
    cta.addEventListener('click', ctx.onSubmitClick);
    container.appendChild(cta);
  }
  return { render: render };
}));
