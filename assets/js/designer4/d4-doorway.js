// assets/js/designer4/d4-doorway.js
// Designer 4 doorway choices: the 24 Frame Design layouts grouped into six picture families
// (pick a family, then the exact layout). Pure logic, no DOM. Ids are Endurance catalogue ids.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
  else { root.HD_DD_D4Doorway = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function frame() {
    if (root && root.HD_DD_D3Frame) { return root.HD_DD_D3Frame; }
    try { return require('../designer3/d3-frame.js'); } catch (e) { return null; }
  }

  // `pic` is the id whose drawing stands for the family.
  var FAMILIES = [
    { key: 'door', label: 'Just the door', pic: 1, ids: [1] },
    { key: 'above', label: 'Glass above only', pic: 11, ids: [11, 30] },
    { key: 'oneside', label: 'Glass on one side (left or right)', pic: 2, ids: [2, 3, 4, 5, 6, 7] },
    { key: 'bothsides', label: 'Glass on both sides', pic: 8, ids: [8, 9, 10] },
    { key: 'oneside_above', label: 'One side and above', pic: 12, ids: [12, 13, 14, 31, 15, 16, 17, 32] },
    { key: 'bothsides_above', label: 'Both sides and above', pic: 18, ids: [18, 19, 20, 33] }
  ];

  // id -> caption for the "Which one exactly?" tiles.
  var CAPTIONS = {
    1: 'Just the door',
    2: 'Full-height glass, left',
    3: 'Left, with a bar across the middle',
    4: 'Left, glass in the top half only',
    5: 'Full-height glass, right',
    6: 'Right, with a bar across the middle',
    7: 'Right, glass in the top half only',
    8: 'Full-height glass, both sides',
    9: 'Both sides, with a bar across the middle',
    10: 'Both sides, glass in the top half only',
    11: 'Glass above the door',
    12: 'Full-height glass, left',
    13: 'Left, with a bar across the middle',
    14: 'Left, top half, bar under the top glass',
    15: 'Full-height glass, right',
    16: 'Right, with a bar across the middle',
    17: 'Right, top half, bar under the top glass',
    18: 'Full-height glass, both sides',
    19: 'Both sides, with a bar across the middle',
    20: 'Both sides, top half, bar under the top glass',
    30: 'Wide glass above the door',
    31: 'Left, top half, glass runs to the top',
    32: 'Right, top half, glass runs to the top',
    33: 'Both sides, top half, glass runs to the top'
  };

  // FAMILIES with ids limited to those the type offers; families left empty are dropped.
  function families(choices) {
    var offered = {};
    (choices || []).forEach(function (c) { offered[Number(c.id)] = true; });
    return FAMILIES.map(function (f) {
      return { key: f.key, label: f.label, pic: f.pic, ids: f.ids.filter(function (id) { return offered[id]; }) };
    }).filter(function (f) { return f.ids.length > 0; });
  }

  function familyOf(id) {
    var n = Number(id);
    for (var i = 0; i < FAMILIES.length; i++) {
      if (FAMILIES[i].ids.indexOf(n) !== -1) { return FAMILIES[i].key; }
    }
    return null;
  }

  function drawing(id) {
    var F = frame();
    return F ? F.drawingFor(id) : null;
  }

  return { FAMILIES: FAMILIES, CAPTIONS: CAPTIONS, families: families, familyOf: familyOf, drawing: drawing };
}));
