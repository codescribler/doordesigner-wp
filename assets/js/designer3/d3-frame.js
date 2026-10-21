// assets/js/designer3/d3-frame.js
// Maps Designer 3's small side/top light chips to exactly one of Endurance's 24 `Frame Design`
// layouts (by catalogue id, never by label) and back. Ids 14/17/20 and 31/32/33 share labels but
// are different frames: 'bar' (bar level with the top of the door) vs 'totop' (glass runs up to
// the top). drawingFor(id) returns a path RELATIVE TO THE PLUGIN FOLDER, e.g.
// 'assets/img/frames/frame-14-toplight-half-flag-left.png'; the caller resolves it to a URL.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_D3Frame = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIDES = ['none', 'left', 'right', 'both'];
  var TOPS = ['none', 'top', 'full'];
  var PANELS = ['glass', 'midrail', 'halfflag'];
  var JOINTS = ['bar', 'totop'];
  var DIR = 'assets/img/frames/';

  // id -> [sides, top, panel, joint, drawing file]; panel/joint are null where they don't apply.
  var TABLE = {
    1: ['none', 'none', null, null, 'frame-01-no-sidelights.png'],
    2: ['left', 'none', 'glass', null, 'frame-02-sidelight-left.png'],
    3: ['left', 'none', 'midrail', null, 'frame-03-sidelight-left-midrail.png'],
    4: ['left', 'none', 'halfflag', null, 'frame-04-half-flag-left.png'],
    5: ['right', 'none', 'glass', null, 'frame-05-sidelight-right.png'],
    6: ['right', 'none', 'midrail', null, 'frame-06-sidelight-right-midrail.png'],
    7: ['right', 'none', 'halfflag', null, 'frame-07-half-flag-right.png'],
    8: ['both', 'none', 'glass', null, 'frame-08-sidelights-both.png'],
    9: ['both', 'none', 'midrail', null, 'frame-09-sidelights-both-midrails.png'],
    10: ['both', 'none', 'halfflag', null, 'frame-10-half-flags-both.png'],
    11: ['none', 'top', null, null, 'frame-11-toplight.png'],
    12: ['left', 'top', 'glass', null, 'frame-12-toplight-sidelight-left.png'],
    13: ['left', 'top', 'midrail', null, 'frame-13-toplight-sidelight-left-midrail.png'],
    14: ['left', 'top', 'halfflag', 'bar', 'frame-14-toplight-half-flag-left.png'],
    15: ['right', 'top', 'glass', null, 'frame-15-toplight-sidelight-right.png'],
    16: ['right', 'top', 'midrail', null, 'frame-16-toplight-sidelight-right-midrail.png'],
    17: ['right', 'top', 'halfflag', 'bar', 'frame-17-toplight-half-flag-right.png'],
    18: ['both', 'top', 'glass', null, 'frame-18-toplight-sidelights-both.png'],
    19: ['both', 'top', 'midrail', null, 'frame-19-toplight-sidelights-both-midrails.png'],
    20: ['both', 'top', 'halfflag', 'bar', 'frame-20-toplight-half-flags-both.png'],
    30: ['none', 'full', null, null, 'frame-30-toplight-full.png'],
    31: ['left', 'top', 'halfflag', 'totop', 'frame-31-toplight-half-flag-left-no-side-transom.png'],
    32: ['right', 'top', 'halfflag', 'totop', 'frame-32-toplight-half-flag-right-no-side-transom.png'],
    33: ['both', 'top', 'halfflag', 'totop', 'frame-33-toplight-half-flags-both-no-side-transom.png']
  };

  function keyOf(sides, top, panel, joint) { return [sides, top, panel || '', joint || ''].join('|'); }
  var BY_KEY = {};
  Object.keys(TABLE).forEach(function (id) {
    var t = TABLE[id];
    BY_KEY[keyOf(t[0], t[1], t[2], t[3])] = Number(id);
  });

  function normalise(x) {
    x = x || {};
    var sides = x.sides, top = x.top;
    if (SIDES.indexOf(sides) < 0 || TOPS.indexOf(top) < 0) { return null; }
    if (top === 'full' && sides !== 'none') { return null; }
    var panel = null, joint = null;
    if (sides !== 'none') {
      if (PANELS.indexOf(x.panel) < 0) { return null; }
      panel = x.panel;
      if (panel === 'halfflag' && top === 'top') {
        if (JOINTS.indexOf(x.joint) < 0) { return null; }
        joint = x.joint;
      }
    }
    return [sides, top, panel, joint];
  }

  function layoutFor(x, choices) {
    var n = normalise(x);
    if (!n) { return null; }
    var id = BY_KEY[keyOf(n[0], n[1], n[2], n[3])];
    var list = choices || [];
    for (var i = 0; i < list.length; i++) {
      if (Number(list[i].id) === id) { return list[i]; }
    }
    return null;
  }

  function partsOf(id) {
    var t = TABLE[Number(id)];
    return t ? { sides: t[0], top: t[1], panel: t[2], joint: t[3] } : null;
  }

  function drawingFor(id) {
    var t = TABLE[Number(id)];
    return t ? DIR + t[4] : null;
  }

  // Whether a chip may be chosen given the current picks (false = grey it out).
  function allowed(part, value, current) {
    var c = current || {};
    if (part === 'top') { return value !== 'full' || !c.sides || c.sides === 'none'; }
    if (part === 'sides') { return value === 'none' || c.top !== 'full'; }
    if (part === 'panel') { return !!c.sides && c.sides !== 'none'; }
    if (part === 'joint') {
      return !!c.sides && c.sides !== 'none' && c.top === 'top' && c.panel === 'halfflag';
    }
    return true;
  }

  // False when the type only offers "No Sidelights" (e.g. Double Door): skip the step.
  function offered(choices) {
    return !!choices && choices.some(function (c) { return Number(c.id) !== 1; });
  }

  return {
    SIDES: SIDES, TOPS: TOPS, PANELS: PANELS, JOINTS: JOINTS,
    layoutFor: layoutFor, partsOf: partsOf, drawingFor: drawingFor, allowed: allowed, offered: offered
  };
}));
