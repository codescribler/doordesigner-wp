// Designer 3's door screen and toolbox in a stub DOM: focus survives redraws, the phone sheet is
// a labelled dialog that Escape closes (focus goes back to its opener), sections report when
// opened and on pick, a bad style changes nothing, the token has one owner, listeners go.
// `node tests/js/d3-toolbox.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, listeners: {}, style: {}, parentNode: null, hidden: false, scrollTop: 0, value: '',
    appendChild: function (c) { if (c.parentNode) { c.parentNode.removeChild(c); } c.parentNode = n; n.children.push(c); return c; },
    removeChild: function (c) { n.children = n.children.filter(function (x) { return x !== c; }); c.parentNode = null; return c; },
    setAttribute: function (k, v) { n.attrs[k] = String(v); },
    getAttribute: function (k) { return k in n.attrs ? n.attrs[k] : null; },
    addEventListener: function (type, fn) { (n.listeners[type] = n.listeners[type] || []).push(fn); },
    focus: function () { document.activeElement = n; },
    scrollIntoView: function () {},
    classList: {
      contains: function (c) { return (' ' + n.className + ' ').indexOf(' ' + c + ' ') !== -1; },
      toggle: function (c, on) {
        var has = n.classList.contains(c);
        if (on === undefined) { on = !has; }
        if (on && !has) { n.className += ' ' + c; }
        if (!on && has) { n.className = (' ' + n.className + ' ').replace(' ' + c + ' ', ' ').trim(); }
      }
    }
  };
  Object.defineProperty(n, 'id', { get: function () { return n.attrs.id || ''; }, set: function (v) { n.attrs.id = v; } });
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children.forEach(function (c) { c.parentNode = null; }); n.children = []; }, get: function () { return ''; } });
  return n;
}
global.document = { createElement: node, activeElement: null };
function walk(n, test) { if (test(n)) { return n; } for (var i = 0; i < n.children.length; i++) { var r = walk(n.children[i], test); if (r) { return r; } } return null; }
function byKey(n, k) { return walk(n, function (x) { return x.attrs['data-k'] === k; }); }
function byClass(n, c) { return walk(n, function (x) { return (' ' + x.className + ' ').indexOf(' ' + c + ' ') !== -1; }); }
function fire(n, type, ev) { (n.listeners[type] || []).forEach(function (fn) { fn(ev || { preventDefault: function () {} }); }); }
function active() { return document.activeElement ? document.activeElement.attrs['data-k'] : null; }
function inside(n, root) { for (; n; n = n.parentNode) { if (n === root) { return true; } } return false; }
function tick() { return new Promise(function (r) { setImmediate(r); }); }

var model = require('../../data/render-model.json');
var fx = require('./fixtures/customer-view.js');
var phone = false;
var resize = 0;
global.window = {
  location: { origin: 'https://example.test', pathname: '/d/' },
  HD_DD_CONFIG: { restUrl: 'https://example.test/wp-json/hd/', d3Defaults: require('../../data/designer3-defaults.json') },
  matchMedia: function () { return { matches: phone }; },
  addEventListener: function (t) { if (t === 'resize') { resize++; } },
  removeEventListener: function (t) { if (t === 'resize') { resize--; } },
  innerHeight: 800,
  HD_DD_StepConfig: require('../../assets/js/wizard/step-config.js'),
  HD_DD_Wizard: require('../../assets/js/wizard/wizard-controller.js'),
  HD_DD_Shared: require('../../assets/js/design-shared.js'),
  HD_DD_RenderModel: require('../../assets/js/render-model.js'),
  HD_DD_SwipeParts: require('../../assets/js/swipe/swipe-parts.js'),
  HD_DD_D3Defaults: require('../../assets/js/designer3/d3-defaults.js'),
  HD_DD_D3Hotspots: require('../../assets/js/designer3/d3-hotspots.js'),
  HD_DD_D3Nudge: require('../../assets/js/designer3/d3-nudge.js'),
  HD_DD_D3Save: require('../../assets/js/designer3/d3-save.js'),
  HD_DD_D3Toolbox: require('../../assets/js/designer3/d3-toolbox.js')
};
require('../../assets/js/designer3/d3-screens.js');
require('../../assets/js/designer3/d3-app.js');

var steps = [], calls = [], reply = null;
var api = function (path, o) { calls.push([path, o.body ? JSON.parse(o.body) : null]); return Promise.resolve(reply); };
var root = node('div');
var app = new window.HD_DD_Designer3App(root, fx.customerView(), model, null,
  { api: api, funnel: { step: function (k, c) { steps.push([k, c]); }, lead: function () {} }, flow: 'designer3', storage: null });
app.select('Door Type', 'Single Door');
app.select('Door Design', 'Abbott');
assert.strictEqual(app.screen, 'door');
assert.strictEqual(resize, 1, 'the door screen listens for resizes');
var shell = app.shell;
var COLOUR = 'Door Colour (External)';
function otherColour() { return app.stepFor(COLOUR).choices.map(function (c) { return c.label; }).filter(function (l) { return l !== app.design()[COLOUR].label; })[0]; }

(async function () {
  // ---- every dot has a name ---------------------------------------------------------------
  window.HD_DD_D3Hotspots.KEYS.forEach(function (k) { assert.ok(window.HD_DD_D3Screens.DOT_NAMES[k], 'dot name for ' + k); });
  app.refresh();
  walk(shell, function (n) { if (/hd-d3-dot /.test(n.className)) { assert.ok(!/undefined/.test(n.attrs['aria-label']), n.attrs['aria-label']); } return false; });

  // ---- desktop: rows control their panels, opening reports the section --------------------------
  var row = byKey(shell, 'row:colour');
  assert.strictEqual(row.attrs['aria-controls'], 'hd-d3-panel-colour');
  assert.strictEqual(byKey(shell, 'tab:colour').attrs['aria-controls'], 'hd-d3-sheet');
  row.focus(); fire(row, 'click');
  assert.ok(walk(shell, function (n) { return n.id === 'hd-d3-panel-colour'; }), 'the panel the row controls');
  assert.deepStrictEqual(steps[steps.length - 1], ['colour', undefined], 'opening fires the section with no choice');
  assert.strictEqual(active(), 'row:colour', 'the row keeps focus through the redraw');

  // ---- a tile pick keeps focus on the same tile ---------------------------------------------------
  var pickLabel = otherColour();
  var tile = byKey(shell, 'opt:' + COLOUR + ':' + pickLabel);
  tile.focus(); fire(tile, 'click');
  assert.strictEqual(app.design()[COLOUR].label, pickLabel);
  assert.strictEqual(active(), 'opt:' + COLOUR + ':' + pickLabel, 'focus stays on the picked tile');
  assert.notStrictEqual(document.activeElement, tile, 'on its redrawn twin');
  assert.deepStrictEqual(steps[steps.length - 1], ['colour', pickLabel], 'the pick fires the section with the label');

  // ---- a focused dot keeps focus through a change ----------------------------------------------------
  var dot = byKey(shell, 'dot:handle');
  dot.focus();
  app.pick('colour', COLOUR, otherColour());
  assert.strictEqual(active(), 'dot:handle');
  assert.notStrictEqual(document.activeElement, dot);

  // ---- phone: the sheet is a labelled dialog; focus moves in, Escape closes, focus goes back -----------
  phone = true;
  app.toolbox.close();
  var sheet = byClass(shell, 'hd-d3-sheet');
  assert.strictEqual(sheet.attrs.role, 'dialog');
  assert.strictEqual(sheet.id, 'hd-d3-sheet');
  var tab = byKey(shell, 'tab:handle');
  tab.focus(); fire(tab, 'click');
  assert.strictEqual(sheet.hidden, false, 'the sheet is open');
  assert.ok(shell.classList.contains('is-sheet'), 'the door shrinks');
  var title = walk(sheet, function (n) { return n.id === sheet.attrs['aria-labelledby']; });
  assert.ok(title && title.textContent === 'Handle', 'labelled by its heading');
  assert.ok(inside(document.activeElement, sheet) && /^opt:Handle:/.test(active()), 'focus moved into the sheet');
  assert.strictEqual(active(), 'opt:Handle:' + app.design()['Handle'].label, 'on the selected handle');
  assert.deepStrictEqual(steps[steps.length - 1], ['handle', undefined]);
  fire(sheet, 'keydown', { key: 'Escape', preventDefault: function () {} });
  assert.strictEqual(sheet.hidden, true, 'Escape closes it');
  assert.ok(!shell.classList.contains('is-sheet'));
  assert.strictEqual(active(), 'tab:handle', 'focus back on the tab that opened it');
  // Opened by the app, not the visitor (Designer 4's handle step): the sheet opens, no funnel step.
  var nSteps = steps.length;
  app.toolbox.open('handle', 'tab:handle', true);
  assert.strictEqual(sheet.hidden, false, 'a quiet open still opens the sheet');
  assert.strictEqual(steps.length, nSteps, 'a quiet open fires no funnel step');
  app.toolbox.close();

  // the glass dot opens More options at the door glass; Done returns focus to the dot
  var gdot = byKey(shell, 'dot:glass');
  gdot.focus(); fire(gdot, 'click');
  assert.strictEqual(app.toolbox.openKey(), 'more');
  assert.ok(/^opt:Door Glass:/.test(active()), 'focus on a door glass option');
  assert.deepStrictEqual(steps[steps.length - 1], ['more', undefined]);
  fire(byKey(sheet, 'done'), 'click');
  assert.strictEqual(sheet.hidden, true);
  assert.strictEqual(active(), 'dot:glass', 'focus back on the dot');
  phone = false;
  app.toolbox.refresh();

  // ---- an unknown style changes nothing, counts nothing, sends nothing --------------------------------
  var before = JSON.stringify(app.design()), shown = app.nudgeShown, n = calls.length;
  assert.strictEqual(app.restyle('No Such Door'), false);
  assert.strictEqual(app.pick('style', 'Door Design', 'No Such Door'), false);
  await tick();
  assert.strictEqual(JSON.stringify(app.design()), before, 'door unchanged');
  assert.strictEqual(app.nudgeShown, shown);
  assert.strictEqual(calls.length, n, 'no update sent');

  // ---- the saver owns the token: a 409 clears it for the app too ------------------------------------------
  reply = { ok: true, status: 201, body: { ok: true, token: 'tok1' } };
  var form = byClass(shell, 'hd-d3-save');
  var email = walk(form, function (x) { return x.tag === 'input' && x.name === 'email'; });
  email.value = 'jo@example.com';
  fire(form, 'submit');
  await tick();
  assert.strictEqual(calls[calls.length - 1][0], 'save');
  assert.strictEqual(app.savedToken, 'tok1');
  assert.strictEqual(app.screen, 'saved');
  assert.strictEqual(resize, 0, 'leaving the door screen removes its resize listener');
  app.go('door');
  assert.strictEqual(resize, 1);
  reply = { ok: false, status: 409, body: { ok: false } };
  app.pick('colour', COLOUR, otherColour());
  await tick(); await tick();
  assert.strictEqual(calls[calls.length - 1][0], 'save/tok1');
  assert.strictEqual(app.savedToken, null, 'closed record: no stale token on the app');
  app.savedToken = 'tok2';
  assert.strictEqual(app.saver().token(), 'tok2', 'setting it goes to the saver');

  console.log('d3-toolbox.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
