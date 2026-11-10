// Designer 4's door screen: banner, handle glow, guide price, nudge copy, the part labels with
// lines (in place of Designer 3's dots), the no-handle bubble and the handle preview (stepped with
// fake timers). Designer 3's door screen is stubbed with the slots it really builds.
// `node tests/js/d4-door.test.js`
var assert = require('assert');
var fs = require('fs');
var path = require('path');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, listeners: {}, parentNode: null,
    style: { setProperty: function (k, v) { n.style[k] = v; } },
    appendChild: function (c) { c.parentNode = n; n.children.push(c); return c; },
    insertBefore: function (c, ref) { var i = n.children.indexOf(ref); c.parentNode = n; n.children.splice(i < 0 ? n.children.length : i, 0, c); return c; },
    removeChild: function (c) { var i = n.children.indexOf(c); if (i >= 0) { n.children.splice(i, 1); } c.parentNode = null; return c; },
    addEventListener: function (type, fn) { n.listeners[type] = fn; },
    setAttribute: function (k, v) { n.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(n.attrs, k) ? n.attrs[k] : null; },
    focus: function () { global.document.activeElement = n; },
    querySelector: function (sel) { return find(n, sel.replace(/^\./, '')); }
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children.forEach(function (c) { c.parentNode = null; }); n.children = []; }, get: function () { return ''; } });
  Object.defineProperty(n, 'firstChild', { get: function () { return n.children[0] || null; } });
  // A button measures by its words, roughly as a browser would.
  Object.defineProperty(n, 'offsetWidth', { get: function () { return tag === 'button' ? 7 * n.textContent.length + 20 : 0; } });
  Object.defineProperty(n, 'offsetHeight', { get: function () { return tag === 'button' ? 36 : 0; } });
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
global.document = { createElement: node, createElementNS: function (ns, tag) { return node(tag); }, activeElement: null };

var base = { refreshes: 0, destroyed: 0 };
var renders = [];
var retries = [];
global.window = {
  HD_DD_D4Handle: require('../../assets/js/designer4/d4-handle.js'),
  HD_DD_D4Callouts: require('../../assets/js/designer4/d4-callouts.js'),
  HD_DD_D3Toolbox: require('../../assets/js/designer3/d3-toolbox.js'),
  HD_DD_D4Ask: { COPY: { noHandle: 'Oops, your door needs a handle to be saved.' } },
  // Like preview.js: each render takes a token; a slow layer redraws later only if still current.
  HD_DD_Preview: { create: function () { return { _token: 0, render: function (type, design) {
    var me = this, tok = ++me._token, label = design.Handle.label;
    renders.push(label);
    retries.push(function () { if (tok === me._token) { renders.push('retry:' + label); } });
    return Promise.resolve();
  } }; } },
  HD_DD_D3Screens: {
    DOT_NAMES: { glass: 'the glass', knocker: 'the knocker', handle: 'the handle', letterplate: 'the letterplate', colour: 'the colour' },
    // The slots Designer 3's door() builds: banner, stage > frame (canvas + dots), dock (sheet, nudge, save).
    door: function (app, shell) {
      var main = shell.appendChild(el('div', 'hd-d3-main'));
      main.appendChild(el('p', 'hd-d3-banner', 'Here’s your door. Tap a dot to change any part of it.'));
      var frame = main.appendChild(el('div', 'hd-d3-stage')).appendChild(el('div', 'hd-d3-frame'));
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
require('../../assets/js/designer4/d4-labels.js');
require('../../assets/js/designer4/d4-door.js');
var Door = window.HD_DD_D4Door;
var CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'assets/css/hd-designer4.css'), 'utf8');

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
    log: [], opened: [], phone: false, needHandle: true, previewDue: true, nudgeOn: false, reduce: false,
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
    whenPainted: function () { return Promise.resolve(); },
    matchMedia: function (q) { return { matches: q === '(max-width: 719px)' && app.phone }; }
  };
  Object.keys(over || {}).forEach(function (k) { app[k] = over[k]; });
  return app;
}
function tick() { return new Promise(function (r) { setImmediate(r); }); }
var C = Door.COPY;
function layerOf(shell) { return shell.querySelector('.hd-d4-callouts'); }
function labels(shell) { return layerOf(shell).children.filter(function (c) { return c.tag === 'button'; }); }
function label(shell, key) { return labels(shell).filter(function (b) { return b.attrs['data-k'] === 'dot:' + key; })[0]; }
function svgOf(shell) { return layerOf(shell).children.filter(function (c) { return c.tag === 'svg'; })[0]; }
function svgHas(n, cls) { return (' ' + (n.attrs['class'] || '') + ' ').indexOf(' ' + cls + ' ') !== -1; }
function drawn(shell, cls) { return svgOf(shell).children.filter(function (c) { return svgHas(c, cls); }); }

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
  assert.ok(has(shell, 'hd-d4-previewing'), 'the handle ring hides while the preview plays');
  assert.strictEqual(labels(shell).length, 2, 'the labels stay during the preview');
  assert.strictEqual(drawn(shell, 'hd-d4-callouts__ring--handle').length, 1, 'the handle ring is drawn (CSS hides it while previewing)');
  assert.ok(/\.hd-d4\.hd-d4-previewing \.hd-d4-callouts__ring--handle\s*\{[^}]*display:\s*none/.test(CSS), 'only the handle ring hides while previewing');
  assert.ok(!/hd-d4-previewing[^{]*hd-d3-dots/.test(CSS), 'the old hide-the-dots rule is gone');
  assert.strictEqual(app.previewDue, false, 'played once');
  assert.deepStrictEqual(app.log, ['handle_preview']);
  await tick();
  assert.deepStrictEqual(renders, ['Lever/Lever'], 'first frame after the real paint');
  app.timers.step();
  assert.deepStrictEqual(renders, ['Lever/Lever', 'Finger Pull']);
  app.timers.step();
  assert.deepStrictEqual(renders, ['Lever/Lever', 'Finger Pull', '400mm Pull Handle']);
  retries[retries.length - 1]();
  assert.strictEqual(renders.pop(), 'retry:400mm Pull Handle', 'while playing, a slow layer redraws its frame');
  var r0 = base.refreshes;
  app.timers.step();
  assert.strictEqual(base.refreshes, r0 + 1, 'the real design is drawn again');
  retries[retries.length - 1]();
  assert.deepStrictEqual(renders, ['Lever/Lever', 'Finger Pull', '400mm Pull Handle'], 'after the end, a late layer never redraws a handle over the real door');
  assert.strictEqual(app.timers.q.length, 0, 'nothing more scheduled');
  assert.strictEqual(banner.textContent, C.choose);
  assert.ok(!has(banner, 'hd-d4-banner--preview'));
  assert.ok(!has(shell, 'hd-d4-previewing'), 'the handle ring is back when the preview ends');
  assert.deepStrictEqual(app.log, ['handle_preview'], 'nothing per frame');

  // a handle picked: glow off, the settled banner names the labels (there are no dots in Designer 4)
  assert.strictEqual(C.settled, "Here's your door. Tap a label to change any part of it.");
  app.needHandle = false;
  view.refresh();
  assert.ok(!has(shell, 'hd-d4-needhandle'));
  assert.strictEqual(banner.textContent, C.settled);
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
  assert.ok(!has(shell2, 'hd-d4-previewing'), 'a pick during the preview brings the handle ring back');
  retries[retries.length - 1]();
  assert.deepStrictEqual(renders, ['Lever/Lever'], 'a stopped frame never redraws');

  // stopPreview says whether it stopped a playing preview (the app then redraws the real door
  // for a pick that changed nothing: picking the option already on the door)
  var app2b = fakeApp();
  var shell2b = node('div');
  var v2b = Door.door(app2b, shell2b);
  await tick();
  assert.ok(has(shell2b, 'hd-d4-previewing'));
  assert.strictEqual(v2b.stopPreview(), true, 'stopped a playing preview');
  assert.ok(!has(shell2b, 'hd-d4-previewing'), 'the handle ring is back when the preview is stopped');
  assert.strictEqual(v2b.stopPreview(), false, 'nothing left to stop');
  assert.strictEqual(app2b.timers.q.length, 0);
  var r2 = base.refreshes;
  v2b.refresh();
  assert.strictEqual(base.refreshes, r2 + 1, 'one redraw of the real door');
  assert.strictEqual(shell2b.querySelector('.hd-d3-banner').textContent, C.choose);
  assert.ok(!has(shell2b.querySelector('.hd-d3-banner'), 'hd-d4-banner--preview'));

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

  // no preview due (a reopened door with a handle): the settled banner, no glow
  var app5 = fakeApp({ previewDue: false, needHandle: false });
  var shell5 = node('div');
  Door.door(app5, shell5);
  await tick();
  assert.strictEqual(shell5.querySelector('.hd-d3-banner').textContent, C.settled);
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

  // once the door is a lead the guide price has done its job: absent, before the lead present
  function leadSaver(on) { return function () { return { saved: function () { return on.v; } }; }; }
  var lead7 = { v: true };
  var app7b = fakeApp({ previewDue: false, guide: 'Doors like this from £1,450 fitted', saver: leadSaver(lead7) });
  var shell7b = node('div');
  Door.door(app7b, shell7b);
  assert.strictEqual(shell7b.querySelector('.hd-d4-guide'), null, 'no guide price after the lead');
  var lead7c = { v: false };
  var app7c = fakeApp({ previewDue: false, guide: 'Doors like this from £1,450 fitted', saver: leadSaver(lead7c) });
  var shell7c = node('div');
  var v7c = Door.door(app7c, shell7c);
  assert.ok(shell7c.querySelector('.hd-d4-guide'), 'guide price before the lead');
  lead7c.v = true;   // the lead sent while still on this screen
  v7c.refresh();
  assert.strictEqual(shell7c.querySelector('.hd-d4-guide'), null, 'gone once the door is a lead');

  // ---- the nudge never shows once the door is a lead ---------------------------------------------
  var appL = fakeApp({ previewDue: false, nudgeOn: true, saver: leadSaver({ v: true }) });
  var shellL = node('div');
  var vL = Door.door(appL, shellL);
  assert.strictEqual(shellL.querySelector('.hd-d3-nudgeslot').children.length, 0, 'nudge slot empty for a lead');
  assert.strictEqual(appL.nudgeOn, false, 'and kept off');
  appL.nudgeOn = true;   // Designer 3's pick turns it on and redraws
  vL.refresh();
  assert.strictEqual(shellL.querySelector('.hd-d3-nudgeslot').children.length, 0, 'still empty after a pick');

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
  // The announcement comes from a visually hidden live region that is there before any text.
  var live9 = shell9.querySelector('.hd-d4-announce');
  assert.ok(live9, 'a live region is built with the screen');
  assert.strictEqual(live9.attrs['aria-live'], 'polite');
  assert.ok(has(live9, 'hd-d3-sr'), 'visually hidden');
  assert.strictEqual(live9.textContent, '', 'empty until there is something to say');
  v9.bubble();
  var b = shell9.querySelector('.hd-d4-bubble');
  assert.ok(b, 'bubble shown');
  assert.strictEqual(b.textContent, C.bubble);
  assert.strictEqual(b.tag, 'button');
  assert.strictEqual(b.type, 'button', 'the bubble is a real button');
  assert.ok(!('role' in b.attrs), 'with no role="status" on it');
  assert.strictEqual(shell9.querySelector('.hd-d4-announce'), live9, 'the same live region');
  assert.strictEqual(live9.textContent, C.bubble, 'the live region announces the bubble');
  assert.strictEqual(b.parentNode, shell9.querySelector('.hd-d3-frame'), 'beside the door');
  // It sits above the Handle label (CSS lifts it by its height), its pointer at the label's middle.
  function pointsAt(bub, lab, msg) {
    assert.strictEqual(bub.style.top, lab.style.top, msg + ': level with the top of the Handle label');
    var tip = parseFloat(bub.style['--hd-d4-tip']);
    assert.strictEqual(parseFloat(bub.style.left) + tip, parseFloat(lab.style.left) + lab.offsetWidth / 2, msg + ': pointer at the label');
  }
  pointsAt(b, label(shell9, 'handle'), 'first shown');
  assert.deepStrictEqual(app9.log, ['nohandle']);
  b.listeners.click();
  assert.deepStrictEqual(app9.opened, [['handle', 'dot:handle']], 'a tap opens the handle choices');
  v9.bubble();
  assert.strictEqual(shell9.querySelector('.hd-d3-frame').children.filter(function (c) { return has(c, 'hd-d4-bubble'); }).length, 1, 'one bubble at a time');
  assert.deepStrictEqual(app9.log, ['nohandle'], 'reported once per door, however many presses');
  Door.door(app9, node('div')).bubble();
  assert.deepStrictEqual(app9.log, ['nohandle'], 'still once after the screen is drawn again');
  v9.refresh();
  assert.ok(shell9.querySelector('.hd-d4-bubble'), 'stays while the handle is missing');
  // the handle moves (hinge side changed): its label changes side and the bubble follows it
  var before = shell9.querySelector('.hd-d4-bubble').style.left;
  app9.dots = function () { return [{ key: 'handle', x: 0.25, y: 0.5 }]; };
  v9.refresh();
  assert.ok(parseFloat(label(shell9, 'handle').style.left) < 0, 'the Handle label is now on the left');
  assert.notStrictEqual(shell9.querySelector('.hd-d4-bubble').style.left, before, 'the bubble moved');
  pointsAt(shell9.querySelector('.hd-d4-bubble'), label(shell9, 'handle'), 'after the handle moved');
  // the ask's "needs a handle" line (in the save slot) goes with the bubble; any other line stays
  var err = shell9.querySelector('.hd-d3-saveslot').appendChild(el('div', 'hd-d4-ask__error', 'Oops, your door needs a handle to be saved.'));
  app9.needHandle = false;
  v9.refresh();
  assert.strictEqual(shell9.querySelector('.hd-d4-bubble'), null, 'gone once a handle is chosen');
  assert.strictEqual(err.textContent, '', 'the needs-a-handle line goes once a handle is chosen');
  err.textContent = 'Please enter a valid email address.';
  v9.refresh();
  assert.strictEqual(err.textContent, 'Please enter a valid email address.', 'other lines are left alone');

  // ---- the part labels, in place of Designer 3's dots --------------------------------------------
  var parts = [{ key: 'glass', x: 0.5, y: 0.15 }, { key: 'knocker', x: 0.5, y: 0.25 }, { key: 'handle', x: 0.85, y: 0.5 },
    { key: 'letterplate', x: 0.5, y: 0.48 }, { key: 'colour', x: 0.5, y: 0.8 }];
  var app10 = fakeApp({ previewDue: false, dots: function () { return parts; } });
  var shell10 = node('div');
  var v10 = Door.door(app10, shell10);
  var frame10 = shell10.querySelector('.hd-d3-frame');
  assert.strictEqual(frame10.children[0], layerOf(shell10), 'the label layer comes first in the frame (focus finds a label before its hidden dot)');
  assert.ok(frame10.children.indexOf(shell10.querySelector('.hd-d3-dots')) > 0, 'Designer 3\'s dots layer is still built');
  assert.ok(/\.hd-d4 \.hd-d3-dots\s*\{[^}]*display:\s*none/.test(CSS), 'Designer 4 does not show the dots (out of the tab order and the accessibility tree)');
  var want = { glass: 'Glass', knocker: 'Knocker', handle: 'Handle: choose one', letterplate: 'Letterplate', colour: 'Colour' };
  assert.deepStrictEqual(labels(shell10).map(function (b) { return b.attrs['data-k']; }), parts.map(function (p) { return 'dot:' + p.key; }), 'one button per part');
  parts.forEach(function (p) {
    var lab = label(shell10, p.key);
    assert.strictEqual(lab.type, 'button');
    assert.strictEqual(lab.textContent, want[p.key], p.key + ' label text');
    assert.strictEqual(lab.attrs['aria-label'], want[p.key] + '. Change the ' + p.key, p.key + ' accessible name contains its visible text');
    assert.ok(/px$/.test(lab.style.left) && /px$/.test(lab.style.top), p.key + ' placed');
  });
  // lines and rings: decorative, one each per label
  assert.strictEqual(svgOf(shell10).attrs['aria-hidden'], 'true', 'lines are hidden from assistive tech');
  assert.strictEqual(drawn(shell10, 'hd-d4-callouts__line').length, 5);
  assert.strictEqual(drawn(shell10, 'hd-d4-callouts__ring').length, 5);
  var ring = drawn(shell10, 'hd-d4-callouts__ring--handle')[0];
  assert.ok(svgHas(ring, 'hd-d4-callouts__ring--need'), 'the handle ring is orange while there is no handle');
  assert.strictEqual(drawn(shell10, 'hd-d4-callouts__line--need').length, 1, 'and so is its line');
  // pressing a label opens that part, as its dot did
  label(shell10, 'letterplate').listeners.click();
  assert.deepStrictEqual(app10.opened, [['letterplate', 'dot:letterplate']]);
  // with no handle the Handle label needs attention; on a phone it is one word
  assert.ok(has(label(shell10, 'handle'), 'hd-d4-callout--need'));
  app10.phone = true;
  v10.refresh();
  assert.strictEqual(label(shell10, 'handle').textContent, 'Handle', 'one word on a phone');
  assert.strictEqual(label(shell10, 'handle').attrs['aria-label'], 'Handle. Change the handle', 'and its name follows');
  assert.ok(has(label(shell10, 'handle'), 'hd-d4-callout--need'), 'still needs attention on a phone');
  labels(shell10).forEach(function (lab) {
    var x = parseFloat(lab.style.left);
    assert.ok(x < 0 ? x + lab.offsetWidth > 0 : x < 240, lab.attrs['data-k'] + ' over the door edge on a phone');
  });
  // a handle picked: plain "Handle", no attention, grey line and ring
  app10.phone = false;
  app10.needHandle = false;
  v10.refresh();
  assert.strictEqual(label(shell10, 'handle').textContent, 'Handle');
  assert.ok(!has(label(shell10, 'handle'), 'hd-d4-callout--need'));
  assert.strictEqual(drawn(shell10, 'hd-d4-callouts__line--need').length, 0);
  assert.ok(!svgHas(drawn(shell10, 'hd-d4-callouts__ring--handle')[0], 'hd-d4-callouts__ring--need'));
  // focus on a label survives a redraw (it lands on the new twin)
  var old = label(shell10, 'glass');
  old.focus();
  v10.refresh();
  assert.notStrictEqual(label(shell10, 'glass'), old, 'the labels were drawn again');
  assert.strictEqual(document.activeElement, label(shell10, 'glass'), 'focus kept on the Glass label');
  // a part the style does not offer has no label
  parts = parts.filter(function (p) { return p.key !== 'knocker'; });
  v10.refresh();
  assert.strictEqual(label(shell10, 'knocker'), undefined, 'no knocker label');
  assert.strictEqual(labels(shell10).length, 4);
  // leaving the screen stops watching for redraws
  v10.destroy();

  console.log('d4-door.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
