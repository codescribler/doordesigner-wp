// assets/js/designer3/d3-hotspots.js
// Where the orange "+" dots sit over the drawn door. Positions come from the same layers the
// picture is painted from (HD_DD_RenderModel.assemble), as fractions 0..1 of the stage box, so
// the dots follow the door style, the letterplate position and any side/top lights.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('../render-model.js')); }
  else { root.HD_DD_D3Hotspots = factory(root.HD_DD_RenderModel); }
}(typeof self !== 'undefined' ? self : this, function (RM) {
  'use strict';

  var KEYS = ['glass', 'knocker', 'handle', 'letterplate', 'colour'];
  // Layer slots each part is drawn in (as RM.slotOf names them).
  var SLOTS = { glass: ['DoorGlazing'], knocker: ['Knockers'], handle: ['Handles', 'HandlesRight'], letterplate: ['Letterplates'] };

  // Same box preview.js deriveStage works out: the furthest right/bottom edge of any layer.
  function stageOf(layers, T) {
    var maxX = 0, maxY = 0;
    layers.forEach(function (l) {
      maxX = Math.max(maxX, (l.cx || 0) + (l.w || 0) / 2);
      maxY = Math.max(maxY, (l.cy || 0) + (l.h || 0) / 2);
    });
    var c = (T && T.canvas) || {};
    return { width: Math.ceil(maxX) || c.width || 160, height: Math.ceil(maxY) || c.height || 330 };
  }

  function inSlots(layer, key) { return SLOTS[key].indexOf(layer.slot) !== -1; }

  // Centre of the bounding box of the layers.
  function centre(list) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    list.forEach(function (l) {
      x0 = Math.min(x0, l.cx - l.w / 2); x1 = Math.max(x1, l.cx + l.w / 2);
      y0 = Math.min(y0, l.cy - l.h / 2); y1 = Math.max(y1, l.cy + l.h / 2);
    });
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }

  function copyWith(design, heading, label) {
    var d = {};
    for (var k in design) { if (Object.prototype.hasOwnProperty.call(design, k)) { d[k] = design[k]; } }
    d[heading] = { label: label };
    return d;
  }

  function firstKey(o) { for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { return k; } } return null; }

  // spots(model, type, design[, opts]) -> [{key, x, y}] in the order glass, knocker, handle,
  // letterplate, colour. opts is passed to assemble (e.g. {toplights:true}).
  function spots(model, type, design, opts) {
    var T = model && model.types ? model.types[type] : null;
    if (!T) { return []; }
    design = design || {};
    var layers = RM.assemble(model, type, design, opts);
    if (!layers.length) { return []; }
    var stage = stageOf(layers, T);
    var style = T.styles[(design['Door Design'] && design['Door Design'].label) || ''] || {};
    var slab = layers.filter(function (l) { return l.slot === 'DoorBlanks'; })[0];

    // The layers of one part. When the part is switched off (unglazed, no knocker...) draw a
    // stand-in design just to learn where it would go, so the dot can still offer it.
    function partLayers(key, heading, standIn) {
      var found = layers.filter(function (l) { return inSlots(l, key); });
      if (found.length || !standIn) { return found; }
      return RM.assemble(model, type, copyWith(design, heading, standIn), opts).filter(function (l) { return inSlots(l, key); });
    }
    function place(key, list) {
      if (!list.length) { return null; }
      if (type === 'Double Door' && key !== 'glass') { list = [list[0]]; }
      var c = centre(list);
      return { key: key, x: c.x / stage.width, y: c.y / stage.height };
    }

    var out = [];
    var glass = place('glass', partLayers('glass', 'Door Glass', (style.glazingGeom || []).length ? 'Clear' : null));
    if (glass) { out.push(glass); }
    // A knocker dot only if one is drawn or the style offers one (it has a knocker height).
    var knock = place('knocker', partLayers('knocker', 'Knocker', style.knockerCy != null ? firstKey(T.knockers) : null));
    if (knock) { out.push(knock); }
    var handle = place('handle', partLayers('handle', 'Handle', null));
    if (handle) { out.push(handle); }
    var letter = place('letterplate', partLayers('letterplate', 'Letterplate', T.letterplates ? firstKey(T.letterplates) : null));
    if (letter) { out.push(letter); }
    // Colour: the lower door panel, 0.8 of the way down the slab.
    if (slab) { out.push({ key: 'colour', x: slab.cx / stage.width, y: (slab.cy - slab.h / 2 + 0.8 * slab.h) / stage.height }); }
    return out;
  }

  return { spots: spots, KEYS: KEYS, stageOf: stageOf };
}));
