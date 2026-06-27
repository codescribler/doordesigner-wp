// assets/js/wizard/review.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Review = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function el(t, c, x) { var n = document.createElement(t); if (c) { n.className = c; } if (x != null) { n.textContent = x; } return n; }

  function render(container, ctx) {
    container.innerHTML = '';
    container.appendChild(el('div', 'hd-dd__steptitle', 'Your door'));

    // Row-based summary: each row is its own element with a fixed label / value / edit
    // structure, so an entry without an Edit button can't shift the columns.
    var list = el('div', 'hd-dd__review');
    function row(label, value, key) {
      var r = el('div', 'hd-dd__review-row');
      r.appendChild(el('span', 'hd-dd__review-label', label));
      r.appendChild(el('span', 'hd-dd__review-value', value));
      if (key) {
        var edit = el('button', 'hd-dd__edit', 'Edit'); edit.type = 'button';
        edit.addEventListener('click', function () { ctx.onEdit(key); });
        r.appendChild(edit);
      } else {
        r.appendChild(el('span', 'hd-dd__edit')); // spacer keeps the 3-column rhythm
      }
      list.appendChild(r);
    }

    if (ctx.typeLabel) { row('Door type', ctx.typeLabel, null); }
    ctx.steps.forEach(function (s) {
      var chosen = ctx.design[s.heading];
      if (!chosen) { return; }
      row(s.name || s.label, chosen.label, s.key);
    });
    container.appendChild(list);

    container.appendChild(el('p', 'hd-dd__review-note',
      'Free, no-obligation quote — no payment now. We usually reply within one working day.'));

    var cta = el('button', 'hd-dd__cta', 'Get my free quote'); cta.type = 'button';
    cta.addEventListener('click', ctx.onSubmitClick);
    container.appendChild(cta);
  }
  return { render: render };
}));
