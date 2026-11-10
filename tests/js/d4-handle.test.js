// Designer 4 handle preview rules. `node tests/js/d4-handle.test.js`
var assert = require('assert');
global.window = { HD_DD_Shared: require('../../assets/js/design-shared.js') };
var H = require('../../assets/js/designer4/d4-handle.js');
var model = require('../../data/render-model.json');
var byType = require('./fixtures/customer-view.js').customerView().byType;
var S = window.HD_DD_Shared;

function choices(t) { return byType[t].fields['Handle']; }
function design(finish) { return { 'Hardware Type': { label: finish } }; }

var single = H.previewLabels(model, 'Single Door', design('Chrome'), choices('Single Door'));
assert.strictEqual(single.length, 3);
assert.strictEqual(single[0], 'Lever/Lever');
assert.ok(/lever/i.test(single[0]) && /finger pull/i.test(single[1]) && !/with/i.test(single[1]));
assert.strictEqual(single[1], 'Finger Pull');
assert.strictEqual(single[2], '400mm Pull Handle');
single.forEach(function (l) {
  assert.ok(choices('Single Door').some(function (c) { return c.label === l; }), l + ' is offered');
  assert.strictEqual(S.disabledReason(model, 'Single Door', design('Chrome'), 'handle', l), null);
});

// Stable offers no pulls: shows what exists, never throws.
var stable = H.previewLabels(model, 'Stable Door', design('Chrome'), choices('Stable Door'));
assert.ok(stable.length >= 1);
assert.ok(stable.every(function (l) { return S.furnitureKind(l) === 'lever'; }));

// Double doors have pulls only in the render model: still no throw.
assert.ok(Array.isArray(H.previewLabels(model, 'Double Door', design('Chrome'), choices('Double Door'))));

// Finish rule: no label disabled by the finish is returned.
var mb = H.previewLabels(model, 'Single Door', design('Matt Black'), choices('Single Door'));
assert.strictEqual(mb.indexOf('Finger Pull'), -1);
mb.forEach(function (l) { assert.strictEqual(S.disabledReason(model, 'Single Door', design('Matt Black'), 'handle', l), null); });

// Degenerate inputs.
assert.deepStrictEqual(H.previewLabels(model, 'Single Door', {}, []), []);
assert.deepStrictEqual(H.previewLabels(model, 'Single Door', {}, null), []);
assert.deepStrictEqual(H.previewLabels(model, 'Nope', {}, [{ label: 'No Handle ' }, { label: 'Lever/Lever' }]), ['Lever/Lever']);

// Shortest bar by parsed length, not list order.
var bars = [{ label: '1800mm Pull Handle' }, { label: '900mm Pull Handle' }, { label: '1200mm Pull Handle' }];
assert.deepStrictEqual(H.previewLabels(null, 'x', {}, bars), ['900mm Pull Handle']);
// "Heritage Finger pull with ..." is not the finger pull, and not a bar.
assert.deepStrictEqual(H.previewLabels(null, 'x', {}, [{ label: 'Heritage Finger pull with 400mm Pull Handle' }]), []);

// noHandle returns the original label (trailing space intact).
assert.strictEqual(H.noHandle(choices('Single Door')).label, 'No Handle ');
assert.strictEqual(H.noHandle(choices('Avantal')).label, 'No Handle ');
assert.strictEqual(H.noHandle([{ label: 'Lever/Lever' }]), null);
assert.strictEqual(H.noHandle(null), null);

// hasHandle mirrors the server.
assert.strictEqual(H.hasHandle({ Handle: { label: 'No Handle ' } }), false);
assert.strictEqual(H.hasHandle({ Handle: { label: ' no handle' } }), false);
assert.strictEqual(H.hasHandle({ Handle: { label: '' } }), false);
assert.strictEqual(H.hasHandle({}), false);
assert.strictEqual(H.hasHandle(null), false);
assert.strictEqual(H.hasHandle({ Handle: { label: 'Lever/Lever' } }), true);

// withHandle copies; original untouched.
var d = { Handle: { label: 'Lever/Lever' }, X: 1 };
var w = H.withHandle(d, 'Finger Pull');
assert.deepStrictEqual(w.Handle, { label: 'Finger Pull' });
assert.strictEqual(w.X, 1);
assert.strictEqual(d.Handle.label, 'Lever/Lever');
assert.notStrictEqual(w, d);
console.log('d4-handle ok');
