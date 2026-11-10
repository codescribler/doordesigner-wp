// assets/js/designer4/d4-callouts.js
// Where Designer 4's part labels sit around the door picture (pure maths, no DOM). The parts are
// what app.dots() returns ([{key, x, y}], fractions of the frame); every box comes back in pixels
// from the frame's top-left corner.
//
//   layout(parts, o) -> [{key, side, x, y, w, h, ax, ay, ex, ey}] in the parts' order
//     o.mode    'desk': labels beside the door, outside the picture (from 720px);
//               'edge': labels over the door's left or right edge (phones)
//     o.frame   {w, h} the door picture
//     o.bounds  {left, top, right, bottom} where labels may go (the stage, inside the screen)
//     o.sizes   {key: {w, h}} measured label boxes (else a rough guess from the word)
//     o.gap     least space between two labels on one side (6); o.reach: desk space between the
//               door and a label (14); o.overlap: how far an edge label reaches over the door (22)
//   (x, y, w, h) is the label; (ax, ay) where its line starts; (ex, ey) the part (the ring).
//   need(parts, o) -> {left, right}: the room each side needs beside the door in 'desk' mode.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_D4Callouts = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NAMES = { glass: 'Glass', handle: 'Handle', letterplate: 'Letterplate', knocker: 'Knocker', colour: 'Colour' };
  var CENTRE = 0.08;   // a part this near the middle (fraction of the frame) is on the centre line
  var PAD = 8;         // an edge label keeps this far (px) from any part under its strip

  function num(v, d) { return v == null ? d : v; }
  function sizeOf(o, key) {
    var s = o.sizes && o.sizes[key];
    return (s && s.w) ? s : { w: 8 * (NAMES[key] || key).length + 24, h: 36 };
  }
  function nearest(ys, y) { return ys.reduce(function (m, v) { return Math.min(m, Math.abs(v - y)); }, Infinity); }

  // Left or right per part: by the side of the door it is on; a centred part goes to the side with
  // fewer labels, or on a tie to the side whose labels are further from its height.
  function sides(parts) {
    var out = {}, ys = { left: [], right: [] };
    function put(p, s) { out[p.key] = s; ys[s].push(p.y); }
    var centred = [];
    parts.forEach(function (p) {
      if (Math.abs(p.x - 0.5) <= CENTRE) { centred.push(p); } else { put(p, p.x < 0.5 ? 'left' : 'right'); }
    });
    centred.sort(function (a, b) { return a.y - b.y; }).forEach(function (p) {
      var l = ys.left.length, r = ys.right.length;
      put(p, l !== r ? (l < r ? 'left' : 'right') : (nearest(ys.left, p.y) >= nearest(ys.right, p.y) ? 'left' : 'right'));
    });
    return out;
  }

  // An edge label's best height: level with its part unless a part lies under its strip of the
  // door (its own included), then just above or below that part, whichever is nearer.
  function avoid(want, h, x0, x1, points, top, bottom) {
    var under = points.filter(function (p) { return p.x >= x0 - PAD && p.x <= x1 + PAD; });
    function clear(c) { return under.every(function (p) { return p.y < c - h / 2 - PAD + 2 || p.y > c + h / 2 + PAD - 2; }); }
    var cands = [want];
    under.forEach(function (p) { cands.push(p.y - PAD - h / 2, p.y + PAD + h / 2); });
    cands = cands.filter(function (c) { return c - h / 2 >= top && c + h / 2 <= bottom; })
      .sort(function (a, b) { return Math.abs(a - want) - Math.abs(b - want); });
    for (var i = 0; i < cands.length; i++) { if (clear(cands[i])) { return cands[i]; } }
    return want;
  }

  // One side's labels, in their parts' top-to-bottom order (so lines never cross): each as near
  // its wanted height as the others allow, at least `gap` apart, inside top..bottom.
  function stack(list, top, bottom, gap) {
    list.sort(function (a, b) { return a.ey - b.ey; });
    var prev = -Infinity;
    list.forEach(function (l) { l.y = Math.max(l.want - l.h / 2, top, prev + gap); prev = l.y + l.h; });
    var limit = bottom;
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].y + list[i].h > limit) { list[i].y = limit - list[i].h; }
      limit = list[i].y - gap;
    }
    if (list.length && list[0].y < top) {   // more labels than height: pack them from the top
      prev = top;
      list.forEach(function (l) { l.y = prev; prev += l.h + gap; });
    }
  }

  function layout(parts, o) {
    parts = parts || [];
    var fw = o.frame.w, fh = o.frame.h, b = o.bounds, edge = o.mode === 'edge';
    var gap = num(o.gap, 6), reach = num(o.reach, 14), overlap = num(o.overlap, 22);
    var side = sides(parts);
    var points = parts.map(function (p) { return { x: p.x * fw, y: p.y * fh }; });
    var groups = { left: [], right: [] };
    var out = parts.map(function (p) {
      var s = side[p.key], sz = sizeOf(o, p.key), w = sz.w, h = sz.h, x;
      if (edge) { x = s === 'left' ? Math.max(b.left, overlap - w) : Math.min(b.right - w, fw - overlap); }
      else { x = s === 'left' ? -reach - w : fw + reach; }
      var l = { key: p.key, side: s, x: x, y: 0, w: w, h: h, ex: p.x * fw, ey: p.y * fh, want: p.y * fh };
      if (edge) { l.want = avoid(l.want, h, x, x + w, points, b.top, b.bottom); }
      groups[s].push(l);
      return l;
    });
    stack(groups.left, b.top, b.bottom, gap);
    stack(groups.right, b.top, b.bottom, gap);
    return out.map(function (l) {
      return { key: l.key, side: l.side, x: l.x, y: l.y, w: l.w, h: l.h, ax: l.side === 'left' ? l.x + l.w : l.x, ay: l.y + l.h / 2, ex: l.ex, ey: l.ey };
    });
  }

  function need(parts, o) {
    o = o || {};
    var side = sides(parts || []), reach = num(o.reach, 14), out = { left: 0, right: 0 };
    (parts || []).forEach(function (p) { out[side[p.key]] = Math.max(out[side[p.key]], sizeOf(o, p.key).w + reach); });
    return out;
  }

  return { layout: layout, need: need, sides: sides, NAMES: NAMES };
}));
