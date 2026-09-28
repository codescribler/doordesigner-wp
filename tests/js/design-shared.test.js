// Plain-Node tests for HD_DD_Shared — the design rules both flows use.
// `node tests/js/design-shared.test.js`
var assert = require('assert');
var model = require('../../data/render-model.json');
var S = require('../../assets/js/design-shared.js');
var fx = require('./fixtures/customer-view.js');

var black = { 'Hardware Type': { label: 'Black' } };
assert.strictEqual(S.disabledReason(model, 'Single Door', black, 'handle', 'Architectural Lever/Lever'), 'Chrome, Gold & Graphite only');
assert.strictEqual(S.disabledReason(model, 'Single Door', black, 'letterplate', 'Stainless Steel Letterplate'), 'Stainless Steel only');
assert.strictEqual(S.disabledReason(model, 'Single Door', { 'Hardware Type': { label: 'Chrome' } }, 'handle', 'Architectural Lever/Lever'), null);
assert.strictEqual(S.disabledReason(model, 'Single Door', {}, 'handle', 'Architectural Lever/Lever'), null, 'no finish chosen → nothing greyed');
assert.strictEqual(S.disabledReason(model, 'Single Door', black, 'knocker', 'Anything'), null);

var d = { 'Hardware Type': { label: 'Black' }, 'Handle': { label: 'Architectural Lever/Lever' }, 'Letterplate': { label: 'Letterplate' } };
S.resetFurnitureIfIncompatible(model, 'Single Door', d);
assert.strictEqual(d['Handle'], undefined, 'incompatible handle dropped');
assert.ok(d['Letterplate'], 'compatible letterplate kept');

assert.deepStrictEqual(S.cleanDesign({ a: 1, _ui: 2 }), { a: 1 });
assert.strictEqual(S.formatColourList(['A', 'B', 'C']), 'A, B & C');

var cv = S.enrichCustomerView(fx.customerView(), model);
assert.ok(Object.keys(cv.byType['Single Door'].letterplatePosStyles).length > 0);

console.log('design-shared.test.js: all assertions passed');
