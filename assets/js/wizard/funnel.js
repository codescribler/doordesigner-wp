(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Funnel = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FUNNEL = 'door-designer';

  // Canonical dashboard order — fixed per step key regardless of which conditional
  // steps a given visitor is offered, so the funnel draws a stable sequence.
  var ORDER = {
    type: 1, frame: 2, style: 3, hinge: 4, extColour: 5, intColour: 6,
    sidelightType: 7, sidelightGlass: 8, glazing: 9, hardware: 10, handle: 11,
    letterplate: 12, letterplatePosition: 13, knocker: 14, review: 15, details: 16
  };

  // The site-wide analytics plugin defines window.hdAnalytics before our code runs
  // and queues early calls, so when present it is always safe to call. When absent
  // (plugin deactivated, QA harness) every call is a silent no-op.
  function tracker() {
    return (typeof window !== 'undefined' && window.hdAnalytics) ? window.hdAnalytics : null;
  }

  function step(key, choice) {
    var t = tracker();
    if (!t) { return; }
    var opts = { order: ORDER[key] };
    if (choice) { opts.choice = choice; }
    try { t.step(FUNNEL, key, opts); } catch (e) { /* analytics is best-effort */ }
  }

  function lead() {
    var t = tracker();
    if (!t) { return; }
    try { t.lead(FUNNEL); } catch (e) { /* analytics is best-effort */ }
  }

  return { ORDER: ORDER, step: step, lead: lead };
}));
