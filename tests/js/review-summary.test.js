// The one-line summary at the top of the Review step. `node tests/js/review-summary.test.js`
var assert = require('assert');
global.document = { createElement: function () { return {}; } };
var P = require('../../assets/js/swipe/swipe-parts.js');

var rows = [
  { name: 'Design', value: 'Abbott' }, { name: 'Door type', value: 'Single' }, { name: 'Hinge', value: 'Hinges on Left' },
  { name: 'Colour', value: 'Anthracite Grey' }, { name: 'Inside colour', value: 'White' }, { name: 'Glass', value: 'Satin' },
  { name: 'Hardware', value: 'Chrome' }, { name: 'Handle', value: 'Lever/Lever' }
];
assert.strictEqual(P.reviewSummary(rows), 'Abbott · Anthracite Grey · Satin glass · Chrome hardware');
// A solid door has no glass to name.
assert.strictEqual(P.reviewSummary([{ name: 'Design', value: 'Ben Nevis' }, { name: 'Colour', value: 'Sage' }, { name: 'Glass', value: 'Unglazed' }]), 'Ben Nevis · Sage · Solid');
// Missing rows are skipped, not shown as blanks.
assert.strictEqual(P.reviewSummary([{ name: 'Design', value: 'Ketu' }]), 'Ketu');
assert.strictEqual(P.reviewSummary([{ name: 'Design', value: 'Ketu' }, { name: 'Colour', value: '' }]), 'Ketu');
assert.strictEqual(P.reviewSummary([]), '');
assert.strictEqual(P.reviewSummary(undefined), '');

console.log('review-summary.test.js: all assertions passed');
