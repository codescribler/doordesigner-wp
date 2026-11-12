// The pieces the phone review of 2026-11-12 added to Designer 4: popular styles first
// (d4-styles.js), handles by kind and the glass row (d4-toolbox.js), the kept draft (d4-draft.js),
// the design effort (d4-effort.js) and the phone's back button (d4-history.js).
// `node tests/js/d4-phone-review.test.js`
var assert = require('assert');
var Styles = require('../../assets/js/designer4/d4-styles.js');
var Toolbox = require('../../assets/js/designer4/d4-toolbox.js');
var Draft = require('../../assets/js/designer4/d4-draft.js');
var Effort = require('../../assets/js/designer4/d4-effort.js');
var Hist = require('../../assets/js/designer4/d4-history.js');

// ---- Styles: popular first, in the server's order; the chosen style always among them ----------
var labels = ['Abbott', 'Ainos ', 'Eiger', 'Etna', 'Fuji', 'Kyo'];
var sp = Styles.split(labels, ['Etna', 'Nope', 'Ainos', 'Eiger'], '');
assert.deepStrictEqual(sp.top, ['Etna', 'Ainos ', 'Eiger'], 'popular order, catalogue labels (stray spaces and all)');
assert.deepStrictEqual(sp.rest, ['Abbott', 'Fuji', 'Kyo'], 'the others as the catalogue lists them');
assert.deepStrictEqual(Styles.split(labels, ['Etna'], 'Kyo').top, ['Kyo', 'Etna'], 'the style on the door leads');
assert.deepStrictEqual(Styles.split(labels, [], '').top, [], 'no list, nothing on top');
var many = []; for (var i = 0; i < 20; i++) { many.push('S' + i); }
assert.strictEqual(Styles.split(many, many, '').top.length, Styles.TOP, 'at most TOP');

// ---- Handles by kind ---------------------------------------------------------------------------
function ch(l) { return { label: l }; }
var handles = ['Lever/Lever', 'Lever/Pad', 'Heritage Finger Pull with 1200mm Pull Handle', 'Heritage Finger pull with 400mm Pull Handle',
  '1200mm Pull Handle', '1800mm Pull Handle', '400mm Pull Handle', '900mm Stainless Flat Pull Handle', 'Premium Stainless Lever Handles',
  'Finger Pull', 'Pewter Noble Handle', 'Forged Black Monkey Tail', 'No Handle ', ' Touch Key Handle Chrome'].map(ch);
var gs = Toolbox.groups(handles);
assert.deepStrictEqual(gs.map(function (x) { return x.title; }), ['Lever handles', 'Pull bars', 'Finger pulls', 'Traditional', 'More handles']);
function names(k) { return gs.filter(function (x) { return x.key === k; })[0].choices.map(function (c) { return c.label; }); }
assert.deepStrictEqual(names('lever'), ['Lever/Lever', 'Lever/Pad', 'Premium Stainless Lever Handles']);
assert.deepStrictEqual(names('bar'), ['400mm Pull Handle', '900mm Stainless Flat Pull Handle', '1200mm Pull Handle', '1800mm Pull Handle'], 'pull bars shortest first');
assert.deepStrictEqual(names('finger'), ['Finger Pull', 'Heritage Finger pull with 400mm Pull Handle', 'Heritage Finger Pull with 1200mm Pull Handle']);
assert.deepStrictEqual(names('trad'), ['Pewter Noble Handle', 'Forged Black Monkey Tail']);
assert.deepStrictEqual(names('other'), [' Touch Key Handle Chrome'], 'the choice keeps its own label');
assert.ok(!gs.some(function (x) { return x.choices.some(function (c) { return /no handle/i.test(c.label); }); }), '"No Handle" is never offered');
assert.deepStrictEqual(Toolbox.groups([]), []);

// ---- The glass row -------------------------------------------------------------------------------
function tbApp(design, steps) {
  return { design: function () { return design; }, stepFor: function (h) { return steps.indexOf(h) !== -1 ? { choices: [ch('Satin'), ch('Clear')] } : null; } };
}
var base = [{ key: 'colour', label: 'Colour' }, { key: 'style', label: 'Door style' }, { key: 'more', label: 'More options', value: 'Satin glass, Chrome finish' }];
var rows = Toolbox.rows(tbApp({ 'Door Glass': { label: 'Satin ' }, 'Hardware Type': { label: 'Chrome' } }, ['Door Glass']), base.map(function (r) { return Object.assign({}, r); }));
assert.deepStrictEqual(rows.map(function (r) { return r.key; }), ['colour', 'glass', 'style', 'more'], 'glass sits after colour');
assert.strictEqual(rows[1].value, 'Satin');
assert.strictEqual(rows[3].value, 'Chrome finish', 'More options names the finish only');
assert.strictEqual(Toolbox.rows(tbApp({ 'Door Glass': { label: 'Unglazed' } }, ['Door Glass']), base.map(function (r) { return Object.assign({}, r); }))[1].value, 'Solid');
assert.strictEqual(Toolbox.rows(tbApp({}, []), base).length, 3, 'a type with no door glass keeps Designer 3\'s rows');
// The glass section reports as "more"; other sections are left to Designer 3.
var calls = [];
var h = { tiles: function (app, section, heading, kind, choices) { calls.push([section, heading, kind, choices.length]); return { tiles: true }; }, usable: function () { return handles; }, el: function () { return { children: [], appendChild: function (c) { this.children.push(c); }, setAttribute: function () {} }; } };
var app = tbApp({}, ['Door Glass']);
assert.ok(Toolbox.section(app, 'glass', h).tiles);
assert.deepStrictEqual(calls[0], ['more', 'Door Glass', 'glass', 2]);
assert.strictEqual(Toolbox.section(app, 'colour', h), null);
calls = [];
var box = Toolbox.section(app, 'handle', h);
assert.strictEqual(box.children.length, 5, 'a group per kind');
assert.ok(calls.every(function (c) { return c[0] === 'handle' && c[1] === 'Handle'; }), 'handle picks report as handle');

// ---- Draft -----------------------------------------------------------------------------------------
function store() { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, m: m }; }
var t = 1000, st = store();
var d = Draft.create({ storage: st, now: function () { return t; } });
assert.strictEqual(d.load(), null);
assert.strictEqual(d.save({ type: 'Single Door' }), false, 'no style, no draft');
assert.ok(d.save({ type: 'Single Door', style: 'Etna', design: { Handle: { label: 'Lever/Lever' } }, mine: { Handle: 'Lever/Lever' }, effort: { changes: 2, seconds: 30, parts: ['handle'] } }));
var got = d.load();
assert.strictEqual(got.style, 'Etna'); assert.deepStrictEqual(got.mine, { Handle: 'Lever/Lever' }); assert.strictEqual(got.effort.changes, 2);
t += Draft.MAX_AGE - 1; assert.ok(d.load(), 'still there just inside two weeks');
t += 2; assert.strictEqual(d.load(), null, 'a door left too long starts fresh');
assert.strictEqual(st.getItem(Draft.KEY), null, 'and is cleared');
st.setItem(Draft.KEY, '{not json'); assert.strictEqual(d.load(), null, 'unreadable storage is no draft');
var broken = Draft.create({ storage: null });
assert.strictEqual(broken.save({ type: 'a', style: 'b' }), false); assert.strictEqual(broken.load(), null); broken.clear();

// keep(): a lead clears it; a reopened door or a copy is never kept; an unsaved door is.
function draftApp(over) {
  var a = { draft: Draft.create({ storage: store(), now: function () { return 5; } }), savedToken: null, reopened: false, copy: false, mine: { Handle: 'Lever/Lever' },
    style: function () { return 'Etna'; }, type: function () { return 'Single Door'; },
    design: function () { return { 'Door Type': { label: 'Single Door', extra: 1 }, 'Frame Design': { label: 'No Sidelights', id: 1 } }; },
    effort: { snapshot: function () { return { changes: 3, seconds: 9, parts: [] }; } } };
  Object.keys(over || {}).forEach(function (k) { a[k] = over[k]; });
  return a;
}
var a1 = draftApp(); Draft.keep(a1);
assert.deepStrictEqual(a1.draft.load().design, { 'Door Type': { label: 'Single Door' }, 'Frame Design': { label: 'No Sidelights', id: 1 } }, 'labels and ids only');
assert.strictEqual(a1.draft.load().effort.changes, 3);
a1.savedToken = 'tok'; Draft.keep(a1); assert.strictEqual(a1.draft.load(), null, 'once a lead, no draft');
var a2 = draftApp({ reopened: true }); Draft.keep(a2); assert.strictEqual(a2.draft.load(), null);
var a3 = draftApp({ copy: true }); Draft.keep(a3); assert.strictEqual(a3.draft.load(), null);

// resume(): rebuilds the door, keeps their picks, opens the door screen; a handle they never chose stays off.
function resumeApp(draft, over) {
  var design = {}, log = [];
  var a = { draft: { load: function () { return draft; }, clear: function () { log.push('clear'); } }, cv: { byType: { 'Single Door': {} } }, doorType: '', mine: { old: 1 }, auto: { old: 1 },
    wiz: { selectType: function (x) { log.push('type:' + x); } },
    build: function (style, prefs) { log.push('build:' + style); Object.keys(prefs).forEach(function (k) { design[k] = prefs[k][0]; }); return true; },
    design: function () { return design; }, leaveHandleOff: function () { log.push('handleoff'); },
    effort: { restore: function (e) { log.push('effort:' + e.changes); } }, go: function (s) { log.push('go:' + s); }, log: log };
  Object.keys(over || {}).forEach(function (k) { a[k] = over[k]; });
  return a;
}
var saved = { v: 1, type: 'Single Door', style: 'Etna', design: { Handle: { label: 'Lever/Lever' }, 'Door Colour (External)': { label: 'French Navy' } }, mine: { Handle: 'Lever/Lever', Knocker: 'Gone' }, effort: { changes: 4, seconds: 60, parts: [] } };
var r1 = resumeApp(saved);
assert.strictEqual(Draft.resume(r1), true);
assert.deepStrictEqual(r1.log, ['type:Single Door', 'build:Etna', 'effort:4', 'go:door']);
assert.deepStrictEqual(r1.mine, { Handle: 'Lever/Lever' }, 'only picks still on the door are theirs');
assert.strictEqual(r1.resumed, true); assert.strictEqual(r1.previewDue, false); assert.strictEqual(r1.freshDoor, false);
var r2 = resumeApp({ v: 1, type: 'Single Door', style: 'Etna', design: { Handle: { label: 'No Handle ' } }, mine: {} });
Draft.resume(r2); assert.ok(r2.log.indexOf('handleoff') !== -1, 'a door left before the handle still has none');
assert.strictEqual(Draft.resume(resumeApp(null)), false);
assert.strictEqual(Draft.resume(resumeApp({ v: 1, type: 'Gone', style: 'x', design: {} })), false, 'a type the catalogue no longer has');
assert.strictEqual(Draft.resume(resumeApp(saved, { doorType: 'Stable Door' })), false, 'a link to another door type wins');
var r3 = resumeApp(saved, { build: function () { return false; } });
assert.strictEqual(Draft.resume(r3), false); assert.ok(r3.log.indexOf('clear') !== -1, 'a draft that no longer builds is dropped');

// ---- Effort ------------------------------------------------------------------------------------------
var now = 0, e = Effort.create({ now: function () { return now; } });
assert.deepStrictEqual(e.snapshot(), { changes: 0, seconds: 0, parts: [] });
e.enter(); now = 20000; e.change('colour'); now = 30000; e.change('colour'); e.change('handle');
assert.deepStrictEqual(e.snapshot(), { changes: 3, seconds: 30, parts: ['colour', 'handle'] });
now = 30000 + 10 * 60 * 1000; e.touch();
assert.strictEqual(e.snapshot().seconds, 30 + Effort.IDLE / 1000, 'a long gap counts as IDLE at most');
e.leave(); now += 60000; assert.strictEqual(e.snapshot().seconds, 120, 'time away from the door is not counted');
e.touch(); assert.strictEqual(e.snapshot().seconds, 120, 'touch before enter does nothing');
e.restore({ changes: 9, seconds: 400, parts: ['more', 5] }); assert.deepStrictEqual(e.snapshot(), { changes: 9, seconds: 400, parts: ['more'] });
e.reset(); assert.deepStrictEqual(e.snapshot(), { changes: 0, seconds: 0, parts: [] });
assert.strictEqual(Effort.describe({ changes: 7, seconds: 372 }), '7 changes over 6 min');
assert.strictEqual(Effort.describe({ changes: 1, seconds: 40 }), '1 change over 40 sec');
assert.strictEqual(Effort.describe(null), '');

// ---- History: Back steps back inside the designer ---------------------------------------------------
function fakeWin() {
  var w = { pushed: 0, listeners: {}, history: { pushState: function () { w.pushed++; } },
    addEventListener: function (k, f) { w.listeners[k] = f; }, removeEventListener: function (k) { delete w.listeners[k]; } };
  return w;
}
var w = fakeWin(), backs = 0, closed = 0, open = null;
var happ = { screen: 'type', toolbox: { openKey: function () { return open; }, close: function () { closed++; open = null; } }, back: function () { backs++; happ.screen = happ.screen === 'door' ? 'style' : 'type'; hist.sync(); } };
var hist = Hist.attach(happ, w);
hist.sync(); assert.strictEqual(w.pushed, 0, 'nothing to go back to on the first screen');
happ.screen = 'style'; hist.sync(); hist.sync(); assert.strictEqual(w.pushed, 1, 'one entry, however many screens');
happ.screen = 'door'; hist.sync(); assert.strictEqual(w.pushed, 1);
open = 'handle'; w.listeners.popstate({ state: null });
assert.strictEqual(closed, 1, 'Back closes the open options first'); assert.strictEqual(backs, 0); assert.strictEqual(w.pushed, 2, 'and the entry is put back');
w.listeners.popstate({ state: null });
assert.strictEqual(backs, 1); assert.strictEqual(happ.screen, 'style'); assert.strictEqual(w.pushed, 3, 'still deep: armed again');
w.listeners.popstate({ state: null });
assert.strictEqual(happ.screen, 'type'); assert.strictEqual(w.pushed, 3, 'on the first screen the next Back leaves the page');
w.listeners.popstate({ state: null }); assert.strictEqual(backs, 2, 'not armed: nothing more happens here');
w.listeners.popstate({ state: { hdD4: 1 } }); happ.screen = 'door';
w.listeners.popstate({ state: null }); assert.strictEqual(backs, 3, 'Forward onto the entry arms it again');
hist.detach(); assert.strictEqual(w.listeners.popstate, undefined);
var none = Hist.attach(happ, {}); none.sync(); none.detach();   // no history: harmless

console.log('d4-phone-review: all assertions passed');
