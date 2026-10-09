// ?notrack — the owner's own visits never reach the analytics. `node tests/js/notrack.test.js`
var assert = require('assert');
var Funnel = require('../../assets/js/wizard/funnel.js');

var store = {};
var calls = [];
global.window = {
  location: { search: '' },
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  },
  hdAnalytics: {
    step: function (f, s) { calls.push(['step', f, s]); },
    lead: function (f) { calls.push(['lead', f]); }
  }
};
var v2 = Funnel.create('door-designer-v3', Funnel.ORDER_V3);

// Normal visitor: events flow.
assert.strictEqual(Funnel.muted(), false);
v2.step('design', 'Ketu');
assert.strictEqual(calls.length, 1);

// ?notrack=1 mutes — steps, leads and the classic funnel alike.
window.location.search = '?door_type=Avantal&notrack=1';
calls.length = 0;
assert.strictEqual(Funnel.muted(), true);
v2.step('design', 'Ketu'); v2.lead(); Funnel.step('type', 'Single Door'); Funnel.lead();
assert.strictEqual(calls.length, 0);

// …and is remembered on later visits without the flag.
window.location.search = '';
assert.strictEqual(Funnel.muted(), true);
v2.step('design', 'Ketu');
assert.strictEqual(calls.length, 0);

// ?notrack=0 switches it back on, and that sticks too.
window.location.search = '?notrack=0';
assert.strictEqual(Funnel.muted(), false);
window.location.search = '';
assert.strictEqual(Funnel.muted(), false);
v2.step('design', 'Ketu');
assert.strictEqual(calls.length, 1);

// Storage blocked: the URL flag still works for that page view.
window.localStorage = { getItem: function () { throw new Error('blocked'); }, setItem: function () { throw new Error('blocked'); }, removeItem: function () {} };
window.location.search = '?notrack=1';
assert.strictEqual(Funnel.muted(), true);
window.location.search = '';
assert.strictEqual(Funnel.muted(), false);

console.log('notrack.test.js: all assertions passed');
