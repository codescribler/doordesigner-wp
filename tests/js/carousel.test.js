// Plain-Node tests for the cover-flow carousel's pure maths (HD_DD_Carousel.math).
// `node tests/js/carousel.test.js`
var assert = require('assert');
var C = require('../../assets/js/swipe/carousel.js').math;

assert.strictEqual(C.clamp(-1, 10), 0);
assert.strictEqual(C.clamp(12, 10), 9);
assert.strictEqual(C.clamp(4, 10), 4);

// Only the centre card and its neighbours are kept in the DOM.
assert.deepStrictEqual(C.windowRange(0, 93, 3), [0, 3]);
assert.deepStrictEqual(C.windowRange(50, 93, 3), [47, 53]);
assert.deepStrictEqual(C.windowRange(92, 93, 3), [89, 92]);
assert.deepStrictEqual(C.windowRange(0, 1, 3), [0, 0]);

// Settling after a drag: a short drag snaps back, a long drag moves one card, a fast flick
// moves one card even when short, a very long drag can move several — never past the ends.
var W = 100; // card spacing in px
assert.strictEqual(C.settle(5, -20, 0, W, 21), 5);
assert.strictEqual(C.settle(5, -60, 0, W, 21), 6);   // dragged left → next card
assert.strictEqual(C.settle(5, 60, 0, W, 21), 4);    // dragged right → previous card
assert.strictEqual(C.settle(5, -25, -0.8, W, 21), 6); // quick flick left
assert.strictEqual(C.settle(5, 25, 0.8, W, 21), 4);   // quick flick right
assert.strictEqual(C.settle(5, -260, 0, W, 21), 8);
assert.strictEqual(C.settle(0, 300, 0, W, 21), 0);
assert.strictEqual(C.settle(20, -300, 0, W, 21), 20);

// Card placement: the centre card is full size and opaque; neighbours shrink and fade;
// cards further than 2 away are hidden.
var c0 = C.cardStyle(0, W);
assert.deepStrictEqual([c0.x, c0.scale, c0.opacity], [0, 1, 1]);
var c1 = C.cardStyle(1, W);
assert.ok(c1.x > 0 && c1.scale < 1 && c1.opacity < 1);
var cm1 = C.cardStyle(-1, W);
assert.strictEqual(cm1.x, -c1.x);
assert.ok(C.cardStyle(0.5, W).scale > c1.scale, 'mid-drag interpolates');
assert.strictEqual(C.cardStyle(3, W).opacity, 0);
assert.ok(c0.z > c1.z);

// Dot track: a window of dots around the current item for long lists.
assert.deepStrictEqual(C.dotWindow(0, 5, 9), [0, 4]);
assert.deepStrictEqual(C.dotWindow(50, 93, 9), [46, 54]);
assert.deepStrictEqual(C.dotWindow(92, 93, 9), [84, 92]);

console.log('carousel.test.js: all assertions passed');
