// assets/js/designer4/d4-handle.js
// Designer 4 handle rules: which handles to show in the preview animation (lever, finger pull,
// bar), how to find "No Handle", and whether a design has a handle. Pure logic, no DOM.
// Catalogue labels carry stray spaces ("No Handle ", " Touch Key Handle Chrome"): every test here
// trims, and every returned label is the choice's original label (selecting uses the exact label).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
  else { root.HD_DD_D4Handle = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function shared() {
    if (root && root.HD_DD_Shared) { return root.HD_DD_Shared; }
    try { return require('../design-shared.js'); } catch (e) { return null; }
  }

  var NO_HANDLE = /^\s*no handle/i;

  function trimmed(label) { return String(label || '').trim(); }
  function isNone(label) { return /^no /i.test(trimmed(label)); }
  // A finger pull on its own; "Heritage Finger pull with 900mm Pull Handle" is a combination.
  function isFingerPull(label) { return /finger pull/i.test(label) && !/with/i.test(label); }
  // Leading millimetre number ("900mm Pull Handle"); labels without one sort last.
  function length(label) {
    var m = /^\s*(\d+)\s*mm/i.exec(label);
    return m ? Number(m[1]) : Infinity;
  }

  function noHandle(choices) {
    var list = choices || [];
    for (var i = 0; i < list.length; i++) {
      if (NO_HANDLE.test(String(list[i].label || ''))) { return list[i]; }
    }
    return null;
  }

  function hasHandle(design) {
    var h = design && design.Handle;
    var label = h && h.label ? String(h.label) : '';
    return !!label && !NO_HANDLE.test(label);
  }

  // Up to three labels, in the order lever, finger pull, bar handle. Missing kinds are skipped, so
  // the result may be shorter (Stable doors have no pulls); [] means "no preview".
  function previewLabels(model, type, design, choices) {
    var S = shared();
    var kind = S ? S.furnitureKind : function () { return 'other'; };
    var usable = (choices || []).map(function (c) { return c && c.label; }).filter(function (label) {
      if (!label || isNone(label)) { return false; }
      return !S || !S.disabledReason(model, type, design || {}, 'handle', label);
    });

    var levers = usable.filter(function (l) { return kind(l) === 'lever'; });
    var lever = levers.filter(function (l) { return trimmed(l) === 'Lever/Lever'; })[0] || levers[0];
    var finger = usable.filter(isFingerPull)[0];
    var bars = usable.filter(function (l) { return kind(l) === 'pull' && !/finger pull/i.test(l); });
    bars.sort(function (a, b) { return length(a) - length(b); });

    return [lever, finger, bars[0]].filter(function (l) { return !!l; });
  }

  function withHandle(design, label) {
    var copy = {};
    Object.keys(design || {}).forEach(function (k) { copy[k] = design[k]; });
    copy.Handle = { label: label };
    return copy;
  }

  return { noHandle: noHandle, hasHandle: hasHandle, previewLabels: previewLabels, withHandle: withHandle };
}));
