// Designer 3's app: type -> style -> a complete door, restyling, funnel order, nudge, toolbox rows.
// The screens and the canvas are stubbed (as in swipe-go.test.js); the state is the real wizard.
// `node tests/js/d3-app.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, style: {},
    appendChild: function (c) { n.children.push(c); return c; },
    addEventListener: function () {}, setAttribute: function (k, v) { n.attrs[k] = v; },
    scrollIntoView: function () {}
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children = []; }, get: function () { return ''; } });
  return n;
}
global.document = { createElement: node };

var model = require('../../data/render-model.json');
var table = require('../../data/designer3-defaults.json');
var fx = require('./fixtures/customer-view.js');
var screens = [];
global.window = {
  HD_DD_CONFIG: { d3Defaults: table },
  HD_DD_StepConfig: require('../../assets/js/wizard/step-config.js'),
  HD_DD_Wizard: require('../../assets/js/wizard/wizard-controller.js'),
  HD_DD_Shared: require('../../assets/js/design-shared.js'),
  HD_DD_RenderModel: require('../../assets/js/render-model.js'),
  HD_DD_D3Defaults: require('../../assets/js/designer3/d3-defaults.js'),
  HD_DD_D3Hotspots: require('../../assets/js/designer3/d3-hotspots.js'),
  HD_DD_D3Nudge: require('../../assets/js/designer3/d3-nudge.js'),
  HD_DD_D3Screens: {
    type: function () { screens.push('type'); },
    style: function () { screens.push('style'); },
    door: function () { screens.push('door'); return { refresh: function () { screens.push('refresh'); } }; }
  }
};
var Toolbox = require('../../assets/js/designer3/d3-toolbox.js');
window.HD_DD_D3Toolbox = Toolbox;
require('../../assets/js/designer3/d3-app.js');
var App = window.HD_DD_Designer3App;
var D = window.HD_DD_D3Defaults;

function make(opts) {
  var steps = [];
  var o = { api: function () { return Promise.resolve({ ok: false }); }, funnel: { step: function (k, c) { steps.push([k, c]); }, lead: function () {} }, flow: 'designer3', storage: null };
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  var app = new App(node('div'), fx.customerView(), model, fx.categories || null, o);
  app.steps = steps;
  return app;
}
function labels(design) { var o = {}; Object.keys(design).forEach(function (h) { o[h] = design[h].label; }); return o; }

// ---- type -> style -> door, with every resolved default -------------------------------
var app = make();
app.render();
assert.strictEqual(app.screen, 'type');
app.select('Door Type', 'Single Door');
assert.strictEqual(app.screen, 'style');
app.select('Door Design', 'Abbott');
assert.strictEqual(app.screen, 'door');
var want = D.resolve(app.node(), model, 'Single Door', 'Abbott', table);
var got = labels(app.design());
Object.keys(want).forEach(function (h) { assert.strictEqual(got[h], want[h], 'default ' + h); });
['Door Colour (External)', 'Handle', 'Letterplate', 'Knocker', 'Door Glass', 'Hardware Type'].forEach(function (h) { assert.ok(got[h], 'complete door has ' + h); });

// funnel: type, style, shown — in that order, with the choices
assert.deepStrictEqual(app.steps, [['type', 'Single Door'], ['style', 'Abbott'], ['shown', undefined]]);
app.go('door');
assert.strictEqual(app.steps.filter(function (s) { return s[0] === 'shown'; }).length, 1, 'shown once per visit');

// ---- toolbox rows -------------------------------------------------------------------------
var rows = Toolbox.rows(app);
assert.deepStrictEqual(rows.map(function (r) { return r.label; }), ['Colour', 'Door style', 'Handle', 'Letterplate', 'Knocker', 'More options']);
assert.ok(!rows.some(function (r) { return /spy/i.test(r.label + r.key); }), 'no spy hole row');
assert.strictEqual(rows[0].value, got['Door Colour (External)'], 'rows show the current choice');
var more = Toolbox.moreGroups(app).map(function (g) { return g.heading; });
['Door Hinged On', 'Door Colour (Internal)', 'Door Glass', 'Hardware Type'].forEach(function (h) { assert.ok(more.indexOf(h) !== -1, 'More options holds ' + h); });
assert.ok(!more.some(function (h) { return /spy/i.test(h); }));

// ---- opening a section fires its step with no choice (door style has no step) -------------
var m0 = app.steps.length;
app.opened('handle'); app.opened('style');
assert.deepStrictEqual(app.steps.slice(m0), [['handle', undefined]]);

// ---- a toolbox pick fires its section step with the label ---------------------------------
var colours = app.stepFor('Door Colour (External)').choices.map(function (c) { return c.label; });
var newColour = colours.filter(function (l) { return l !== got['Door Colour (External)']; })[0];
app.pick('colour', 'Door Colour (External)', newColour);
assert.strictEqual(app.design()['Door Colour (External)'].label, newColour);
assert.deepStrictEqual(app.steps[app.steps.length - 1], ['colour', newColour]);
var before = app.steps.length;
app.pick('colour', 'Door Colour (External)', newColour);
assert.strictEqual(app.steps.length, before, 'picking what is already on the door is not a change');

// ---- restyle keeps valid furniture ------------------------------------------------------------
var k = app.stepFor('Knocker').choices.map(function (c) { return c.label; }).filter(function (l) { return !/^no /i.test(l); })[0];
app.pick('knocker', 'Knocker', k);
var handle = app.stepFor('Handle').choices.map(function (c) { return c.label; }).filter(function (l) {
  return l !== app.design()['Handle'].label && !window.HD_DD_Shared.disabledReason(model, 'Single Door', app.design(), 'handle', l);
})[0];
app.pick('handle', 'Handle', handle);
assert.strictEqual(app.design()['Knocker'].label, k);
app.restyle('Alto'); // Alto offers no knockers at all
var after = labels(app.design());
assert.strictEqual(after['Door Design'], 'Alto');
assert.strictEqual(after['Handle'], handle, 'a handle valid for both styles survives');
assert.strictEqual(after['Door Colour (External)'], newColour, 'the colour survives');
assert.notStrictEqual(after['Knocker'], k, 'a knocker the new style lacks falls back');
assert.ok(!app.stepFor('Knocker'), 'Alto has no knocker step');
assert.ok(!Toolbox.rows(app).some(function (r) { return r.key === 'knocker'; }), 'and no knocker row');
app.restyle('Abbott');
assert.strictEqual(app.design()['Knocker'].label, want['Knocker'], 'back on a knocker style: that style\'s default');
assert.strictEqual(app.design()['Handle'].label, handle);

// restyle re-applies the new style's letterplate position unless the visitor chose one
var bottom = Object.keys(app.node().letterplatePosStyles).filter(function (s) { return app.node().letterplatePosStyles[s] === 'bottom'; })[0];
var middle = Object.keys(app.node().letterplatePosStyles).filter(function (s) { return app.node().letterplatePosStyles[s] === 'middle' && app.node().knockerByStyle[s] && app.node().knockerByStyle[s].length; })[0];
app.pick('letterplate', 'Letterplate', 'Letterplate');
app.restyle(middle);
assert.strictEqual(app.design()['Letterplate Position'].label, 'Middle');
app.restyle(bottom);
assert.strictEqual(app.design()['Letterplate Position'].label, 'Bottom');

// ---- the nudge: toolbox picks only, exactly once ---------------------------------------------
var n = make();
n.select('Door Type', 'Single Door');
n.select('Door Design', 'Abbott');
assert.strictEqual(n.nudgeShown, 0, 'defaults are not changes');
var cs = n.stepFor('Door Colour (External)').choices.map(function (c) { return c.label; }).filter(function (l) { return l !== n.design()['Door Colour (External)'].label; });
n.pick('colour', 'Door Colour (External)', cs[0]);
n.pick('colour', 'Door Colour (External)', cs[1]);
assert.strictEqual(n.nudgeShown, 0);
assert.strictEqual(n.nudgeOn, false);
n.pick('colour', 'Door Colour (External)', cs[2]);
assert.strictEqual(n.nudgeShown, 1, '3rd change shows it');
assert.strictEqual(n.nudgeOn, true);
n.dismissNudge();
assert.strictEqual(n.nudgeOn, false);
n.pick('colour', 'Door Colour (External)', cs[3]);
n.pick('colour', 'Door Colour (External)', cs[4]);
assert.strictEqual(n.nudgeShown, 1, 'never again this visit');

// ---- hardware finish change keeps the handle like-for-like ------------------------------------
var hw = make();
hw.select('Door Type', 'Single Door');
hw.select('Door Design', 'Abbott');
hw.stepFor('Hardware Type').choices.forEach(function (c) {
  hw.pick('more', 'Hardware Type', c.label);
  var h = hw.design()['Handle'];
  assert.ok(h, 'a handle on the door in ' + c.label);
  assert.ok(!window.HD_DD_Shared.disabledReason(model, 'Single Door', hw.design(), 'handle', h.label), h.label + ' comes in ' + c.label);
});

// ---- dots: mirrored with the drawn door ---------------------------------------------------------
var d = make();
d.select('Door Type', 'Single Door');
d.select('Door Design', 'Abbott');
var hinge = d.stepFor('Door Hinged On').choices.map(function (c) { return c.label; });
var plain = window.HD_DD_D3Hotspots.spots(model, 'Single Door', d.design(), { toplights: true });
hinge.forEach(function (h) {
  d.pick('more', 'Door Hinged On', h);
  var flip = window.HD_DD_RenderModel.shouldFlip(model, 'Single Door', d.design(), { toplights: true });
  var raw = window.HD_DD_D3Hotspots.spots(model, 'Single Door', d.design(), { toplights: true });
  var shown = d.dots();
  assert.strictEqual(shown.length, raw.length);
  shown.forEach(function (s, i) {
    if (s.key === 'glass') { return; } // may move to one window, see below
    assert.ok(Math.abs(s.x - (flip ? 1 - raw[i].x : raw[i].x)) < 1e-9, h + ' ' + s.key);
  });
  // no two dots on top of each other (Abbott's glass centre is where the letterplate goes)
  var st = window.HD_DD_D3Hotspots.stageOf(window.HD_DD_RenderModel.assemble(model, 'Single Door', d.design(), { toplights: true }), model.types['Single Door']);
  shown.forEach(function (a, i) { shown.slice(i + 1).forEach(function (b) {
    assert.ok(Math.abs(a.x - b.x) * st.width > 16 || Math.abs(a.y - b.y) * st.height > 16, h + ' ' + a.key + ' clear of ' + b.key);
  }); });
});
assert.ok(plain.length >= 4);

// ---- door type link and navigation -------------------------------------------------------------
var linked = make({ doorType: 'Stable Door' });
linked.render();
assert.strictEqual(linked.screen, 'style', 'a door_type link starts on the style grid');
assert.strictEqual(linked.type(), 'Stable Door');
var later = make();
later.go('saved');
assert.strictEqual(later.screen, 'saved', 'screens after saving route through go()');

console.log('d3-app.test.js: all assertions passed');
