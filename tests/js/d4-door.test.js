// Designer 4's door screen: banner, handle glow, guide price, nudge copy, the no-handle bubble and
// the handle preview (stepped with fake timers). Designer 3's door screen is stubbed with the slots
// it really builds. `node tests/js/d4-door.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, style: {}, listeners: {}, parentNode: null,
    appendChild: function (c) { c.parentNode = n; n.children.push(c); return c; },
    insertBefore: function (c, ref) { var i = n.children.indexOf(ref); c.parentNode = n; n.children.splice(i < 0 ? n.children.length : i, 0, c); return c; },
    removeChild: function (c) { var i = n.children.indexOf(c); if (i >= 0) { n.children.splice(i, 1); } c.parentNode = null; return c; },
    addEventListener: function (type, fn) { n.listeners[type] = fn; },
    setAttribute: function (k, v) { n.attrs[k] = v; },
    querySelector: function (sel) { return find(n, sel.replace(/^\./, '')); }
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children = []; }, get: function () { return ''; } });
  return n;
}
function has(n, cls) { return (' ' + n.className + ' ').indexOf(' ' + cls + ' ') !== -1; }
function find(n, cls) {
  for (var i = 0; i < n.children.length; i++) {
    var c = n.children[i];
    if (has(c, cls)) { return c; }
    var r = find(c, cls);
    if (r) { return r; }
  }
  return null;
}
function el(tag, cls, txt) { var n = node(tag); n.className = cls || ''; if (txt != null) { n.textContent = txt; } return n; }
global.document = { createElement: node };

var base = { refreshes: 0, destroyed: 0 };
var renders = [];
global.window = {
  HD_DD_D4Handle: require('../../assets/js/designer4/d4-handle.js'),
  HD_DD_Preview: { create: function () { return { _token: 0, render: function (type, design) { renders.push(design.Handle.label); return Promise.resolve(); } }; } },
  HD_DD_D3Screens: {
    // The slots Designer 3's door() builds: banner, frame (canvas + dots), dock (sheet, nudge, save).
    door: function (app, shell) {
      var main = shell.appendChild(el('div', 'hd-d3-main'));
      main.appendChild(el('p', 'hd-d3-banner', 'Here’s your door. Tap a dot to change any part of it.'));
      var frame = main.appendChild(el('div', 'hd-d3-frame'));
      frame.appendChild(el('canvas', 'hd-d3-canvas'));
      frame.appendChild(el('div', 'hd-d3-dots'));
      var dock = shell.appendChild(el('div', 'hd-d3-dock'));
      dock.appendChild(el('div', 'hd-d3-sheet'));
      var nudge = dock.appendChild(el('div', 'hd-d3-nudgeslot'));
      dock.appendChild(el('div', 'hd-d3-saveslot'));
      function drawNudge() { nudge.innerHTML = ''; if (app.nudgeOn) { nudge.appendChild(el('span', 'hd-d3-nudge__text', 'Looking good. Save it so you don’t lose it?')); } }
      drawNudge();
      return { refresh: function () { base.refreshes++; drawNudge(); }, destroy: function () { base.destroyed++; } };
    }
  }
};
require('../../assets/js/designer4/d4-door.js');
var Door = window.HD_DD_D4Door;

function fakeTimers() {
  var q = [], id = 0;
  return {
    q: q,
    set: function (fn, ms) { id++; q.push({ id: id, fn: fn, ms: ms }); return id; },
    clear: function (t) { for (var i = 0; i < q.length; i++) { if (q[i].id === t) { q.splice(i, 1); return; } } },
    step: function () { var t = q.shift(); assert.ok(t, 'a timer is waiting'); assert.strictEqual(t.ms, 1000); t.fn(); }
  };
}
function fakeApp(over) {
  var app = {
    log: [], opened: [], needHandle: true, previewDue: true, nudgeOn: false, reduce: false,
    model: {}, canvas: {}, OPTS: { toplights: true }, guide: '',
    funnel: { step: function (k) { app.log.push(k); }, lead: function () {} },
    timers: fakeTimers(),
    toolbox: { open: function (k, by) { app.opened.push([k, by]); } },
    previewLabels: function () { return ['Lever/Lever', 'Finger Pull', '400mm Pull Handle']; },
    reducedMotion: function () { return app.reduce; },
    design: function () { return { 'Door Type': { label: 'Single Door' }, Handle: { label: 'No Handle ' } }; },
    type: function () { return 'Single Door'; },
    assetBase: function () { return ''; },
    cfg: function () { return { trust: { guidePrice: app.guide } }; },
    dots: function () { return [{ key: 'colour', x: 0.2, y: 0.2 }, { key: 'handle', x: 0.75, y: 0.5 }]; },
    whenPainted: function () { return Promise.resolve(); }
  };
  Object.keys(over || {}).forEach(function (k) { app[k] = over[k]; });
  return app;
}
function tick() { return new Promise(function (r) { setImmediate(r); }); }
var C = Door.COPY;

(async function () {
  // ---- copy is the spec's ------------------------------------------------------------------
  assert.strictEqual(C.preview, 'Here\'s your door. Which handle suits it?');
  assert.strictEqual(C.choose, 'Choose your handle next.');
  assert.strictEqual(C.nudge, 'Looking good. Want a price for it?');
  assert.strictEqual(C.bubble, 'How will you get in without a handle?');

  // ---- the preview plays once, a second per handle, then settles with no handle -------------
  var app = fakeApp();
  var shell = node('div');
  var view = Door.door(app, shell);
  var banner = shell.querySelector('.hd-d3-banner');
  assert.strictEqual(banner.textContent, C.preview);
  assert.ok(has(banner, 'hd-d4-banner--preview'));
  assert.ok(has(shell, 'hd-d4-needhandle'), 'the handle control glows');
  assert.strictEqual(app.previewDue, false, 'played once');
  assert.deepStrictEqual(app.log, ['handle_preview']);
  await tick();
  assert.deepStrictEqual(renders, ['Lever/Lever'], 'first frame after the real paint');
  app.timers.step();
  assert.deepStrictEqual(renders, ['Lever/Lever', 'Finger Pull']);
  app.timers.step();
  assert.deepStrictEqual(renders, ['Lever/Lever', 'Finger Pull', '400mm Pull Handle']);
  var r0 = base.refreshes;
  app.timers.step();
  assert.strictEqual(base.refreshes, r0 + 1, 'the real design is drawn again');
  assert.strictEqual(app.timers.q.length, 0, 'nothing more scheduled');
  assert.strictEqual(banner.textContent, C.choose);
  assert.ok(!has(banner, 'hd-d4-banner--preview'));
  assert.deepStrictEqual(app.log, ['handle_preview'], 'nothing per frame');

  // a handle picked: glow off, Designer 3's banner back
  app.needHandle = false;
  view.refresh();
  assert.ok(!has(shell, 'hd-d4-needhandle'));
  assert.strictEqual(banner.textContent, 'Here’s your door. Tap a dot to change any part of it.');
  app.needHandle = true;
  view.refresh();
  assert.ok(has(shell, 'hd-d4-needhandle'));
  assert.strictEqual(banner.textContent, C.choose);

  // ---- a pick (refresh) during the preview stops it at once ---------------------------------
  renders.length = 0;
  var app2 = fakeApp();
  var shell2 = node('div');
  var v2 = Door.door(app2, shell2);
  await tick();
  assert.deepStrictEqual(renders, ['Lever/Lever']);
  var r1 = base.refreshes;
  v2.refresh();
  assert.strictEqual(base.refreshes, r1 + 1, 'the real design');
  assert.strictEqual(app2.timers.q.length, 0, 'timer cleared');
  assert.strictEqual(shell2.querySelector('.hd-d3-banner').textContent, C.choose);
  assert.ok(!has(shell2.querySelector('.hd-d3-banner'), 'hd-d4-banner--preview'));
  assert.deepStrictEqual(renders, ['Lever/Lever'], 'no more frames');

  // leaving the screen stops it, even before the first frame
  renders.length = 0;
  var app3 = fakeApp();
  var v3 = Door.door(app3, node('div'));
  v3.destroy();
  await tick();
  assert.deepStrictEqual(renders, [], 'no frame after leaving');
  assert.strictEqual(app3.timers.q.length, 0);
  assert.strictEqual(base.destroyed, 1, 'Designer 3\'s destroy runs');

  // ---- reduced motion: straight to the settled state ----------------------------------------
  renders.length = 0;
  var app4 = fakeApp({ reduce: true });
  var shell4 = node('div');
  Door.door(app4, shell4);
  await tick();
  assert.deepStrictEqual(renders, []);
  assert.deepStrictEqual(app4.log, [], 'no handle_preview step');
  assert.strictEqual(app4.previewDue, false);
  assert.strictEqual(shell4.querySelector('.hd-d3-banner').textContent, C.choose);

  // no preview due (a reopened door with a handle): Designer 3's banner, no glow
  var app5 = fakeApp({ previewDue: false, needHandle: false });
  var shell5 = node('div');
  Door.door(app5, shell5);
  await tick();
  assert.strictEqual(shell5.querySelector('.hd-d3-banner').textContent, 'Here’s your door. Tap a dot to change any part of it.');
  assert.ok(!has(shell5, 'hd-d4-needhandle'));
  assert.strictEqual(app5.timers.q.length, 0);
  // no labels: nothing to play
  var app6 = fakeApp({ previewLabels: function () { return []; } });
  Door.door(app6, node('div'));
  await tick();
  assert.deepStrictEqual(app6.log, []);

  // ---- guide price above the ask, when set ----------------------------------------------------
  assert.strictEqual(shell5.querySelector('.hd-d4-guide'), null, 'no guide price when unset');
  var app7 = fakeApp({ previewDue: false, guide: 'Doors like this from £1,450 fitted' });
  var shell7 = node('div');
  Door.door(app7, shell7);
  var dock = shell7.querySelector('.hd-d3-dock');
  var g = shell7.querySelector('.hd-d4-guide');
  assert.ok(g, 'guide price shown');
  assert.strictEqual(g.textContent, 'Doors like this from £1,450 fitted');
  assert.strictEqual(dock.children.indexOf(g) + 1, dock.children.indexOf(shell7.querySelector('.hd-d3-saveslot')), 'directly above the ask');

  // ---- the nudge points at the price -----------------------------------------------------------
  var app8 = fakeApp({ previewDue: false, nudgeOn: true });
  var shell8 = node('div');
  var v8 = Door.door(app8, shell8);
  assert.strictEqual(shell8.querySelector('.hd-d3-nudge__text').textContent, C.nudge);
  v8.refresh();
  assert.strictEqual(shell8.querySelector('.hd-d3-nudge__text').textContent, C.nudge, 'after a redraw too');

  // ---- the bubble: no handle on submit -------------------------------------------------------
  var app9 = fakeApp({ previewDue: false });
  var shell9 = node('div');
  var v9 = Door.door(app9, shell9);
  v9.bubble();
  var b = shell9.querySelector('.hd-d4-bubble');
  assert.ok(b, 'bubble shown');
  assert.strictEqual(b.textContent, C.bubble);
  assert.strictEqual(b.parentNode, shell9.querySelector('.hd-d3-frame'), 'beside the door');
  assert.strictEqual(b.style.left, '75%');
  assert.strictEqual(b.style.top, '50%');
  assert.deepStrictEqual(app9.log, ['nohandle']);
  b.listeners.click();
  assert.deepStrictEqual(app9.opened, [['handle', 'dot:handle']], 'a tap opens the handle choices');
  v9.bubble();
  assert.strictEqual(shell9.querySelector('.hd-d3-frame').children.filter(function (c) { return has(c, 'hd-d4-bubble'); }).length, 1, 'one bubble at a time');
  v9.refresh();
  assert.ok(shell9.querySelector('.hd-d4-bubble'), 'stays while the handle is missing');
  app9.needHandle = false;
  v9.refresh();
  assert.strictEqual(shell9.querySelector('.hd-d4-bubble'), null, 'gone once a handle is chosen');

  console.log('d4-door.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
