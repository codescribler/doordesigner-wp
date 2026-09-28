// Plain-Node tests for the close-up box (HD_DD_DoorCard.cropBox). `node tests/js/door-card.test.js`
var assert = require('assert');
var DC = require('../../assets/js/swipe/door-card.js');

var stage = { width: 156, height: 318 };
var lever = { slot: 'Handles', cx: 23, cy: 160, w: 26, h: 41 };
var bar = { slot: 'Handles', cx: 23, cy: 160, w: 13, h: 278 };
var shortBar = { slot: 'Handles', cx: 23, cy: 160, w: 13, h: 60 };
var plate = { slot: 'Letterplates', cx: 78, cy: 250, w: 51, h: 16 };
var doctors = { slot: 'Knockers', cx: 78, cy: 80, w: 6, h: 29 };

// A lever gets a tight square box around it: the part fills most of the circle.
var b = DC.cropBox([lever], 'handle', false, stage);
assert.ok(b.w === b.h, 'square');
assert.ok(b.w < 60 && b.w > 41, 'tight around a 41-tall lever: ' + b.w);
assert.ok(b.x < 23 - 13 && b.x + b.w > 23 + 13, 'contains the lever horizontally');
assert.ok(b.y < 160 - 20.5 && b.y + b.h > 160 + 20.5, 'contains the lever vertically');

// Long pull bars (and the 400mm one) are big enough to see — no close-up.
assert.strictEqual(DC.cropBox([bar], 'handle', false, stage), null);
assert.strictEqual(DC.cropBox([shortBar], 'handle', false, stage), null);

// Letterplates and knockers get one, even a slim knocker.
assert.ok(DC.cropBox([plate], 'letterplate', false, stage).w >= 51);
assert.ok(DC.cropBox([doctors], 'knocker', false, stage));

// A mirrored (hinge-flipped) door moves the box to the part's displayed side.
var f = DC.cropBox([lever], 'handle', true, stage);
assert.ok(Math.abs((f.x + f.w / 2) - (156 - 23)) < 0.01, 'mirrored centre');

// No part, or no close-up kind → none.
assert.strictEqual(DC.cropBox([], 'handle', false, stage), null);
assert.strictEqual(DC.cropBox([lever], 'colour', false, stage), null);

console.log('door-card.test.js: all assertions passed');
