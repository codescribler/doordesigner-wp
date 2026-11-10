// Designer 4 doorway screen: keyboard focus across redraws, Skip after a pick, the screen's own
// canvas, a stale pick, doorway_change once per change of mind, only the newest pick saved, and
// "Matches the door" offered only without a top light. `node tests/js/d4-doorway-screen.test.js`
var T = require('./fixtures/d4-steps-harness.js');
var assert = T.assert, byKey = T.byKey, fire = T.fire, settle = T.settle, harness = T.harness, Doorway = T.Doorway;

// The snapshot reports which canvas it was given (the real one needs a 2D context).
window.HD_DD_Enquiry.snapshot = function (cv) { return cv && cv.mark ? 'img:' + cv.mark : null; };

function key(h, k) { return byKey(h.shell(), k); }
function press(h, k) { var n = key(h, k); assert.ok(n, 'control ' + k); n.focus(); fire(n, 'click'); return n; }
function focusedKey() { var a = document.activeElement; return a && a.getAttribute ? a.getAttribute('data-k') : null; }
function inShell(h, n) { for (; n; n = n.parentNode) { if (n === h.shell()) { return true; } } return false; }
function frameId(h) { return h.app.design()['Frame Design'].id; }
function choice(h, id) { return h.app.stepFor('Frame Design').choices.filter(function (c) { return Number(c.id) === id; })[0]; }

(async function () {
  // ---- focus stays on the pressed tile or chip after the redraw ------------------------------
  var f = harness();
  f.app.go('doorway');
  var old = press(f, 'fam:oneside');
  assert.strictEqual(focusedKey(), 'fam:oneside', 'focus back on the family tile');
  assert.notStrictEqual(document.activeElement, old, 'on the redrawn tile');
  assert.ok(inShell(f, document.activeElement), 'which is on the page');
  press(f, 'exact:2');
  await settle();
  assert.strictEqual(focusedKey(), 'exact:2', 'focus back on the exact tile');
  assert.ok(inShell(f, document.activeElement));
  press(f, 'opt:Sidelight Type:Unglazed');
  await settle();
  assert.strictEqual(focusedKey(), 'opt:Sidelight Type:Unglazed', 'focus back on the side glass chip');
  assert.ok(inShell(f, document.activeElement));

  // ---- Skip after a pick just moves on -------------------------------------------------------
  var s = harness();
  s.app.go('doorway');
  press(s, 'fam:door');
  await settle();
  assert.strictEqual(s.updates.length, 1, 'the pick was saved');
  fire(T.byCls(s.shell(), 'hd-d4-skip'), 'click');
  await settle();
  assert.strictEqual(s.updates.length, 1, 'no skipped request after a pick');
  assert.strictEqual(s.of('doorway_skip').length, 0, 'no doorway_skip after a pick');
  assert.strictEqual(s.app.screen, 'details');
  // ... and without a pick it is recorded
  var s2 = harness();
  s2.app.go('doorway');
  fire(T.byCls(s2.shell(), 'hd-d4-skip'), 'click');
  await settle();
  assert.deepStrictEqual(s2.updates, [['tok1', { doorway: 'skipped' }]]);
  assert.strictEqual(s2.of('doorway_skip').length, 1);

  // ---- the doorway save snapshots the screen's own canvas -------------------------------------
  var c = harness();
  c.app.go('doorway');
  c.app.canvas.mark = 'doorway';
  press(c, 'fam:door');
  c.app.canvas = { mark: 'elsewhere' };    // before the paint resolves
  await settle();
  assert.strictEqual(c.updates[0][1].image, 'img:doorway');

  // ---- a stale pick: the design's actual frame wins ------------------------------------------
  var st = harness();
  st.app.go('doorway');
  press(st, 'fam:oneside'); press(st, 'exact:2');
  await settle();
  st.app.go('door');
  st.app.select('Frame Design', { label: choice(st, 5).label, id: 5 });   // changed elsewhere
  st.app.go('doorway');
  assert.ok(T.has(key(st, 'exact:5'), 'is-on') && !T.has(key(st, 'exact:2'), 'is-on'), 'shows the design\'s frame');
  // changed behind the screen's back, then the remembered tile is tapped: it is applied again
  st.app.wiz.select('Frame Design', choice(st, 1));
  var before = st.updates.length;
  press(st, 'exact:5');
  await settle();
  assert.strictEqual(frameId(st), 5, 're-applied');
  assert.strictEqual(st.updates.length, before + 1, 'and saved');

  // ---- doorway_change once per change of mind ------------------------------------------------
  var d = harness();
  d.app.go('doorway');
  function changes() { return d.of('doorway_change').length; }
  press(d, 'fam:oneside'); press(d, 'exact:2');
  assert.strictEqual(changes(), 0, 'first family and first pick');
  press(d, 'fam:bothsides');
  assert.strictEqual(changes(), 1, 'a different family');
  press(d, 'fam:oneside'); press(d, 'exact:2');
  assert.strictEqual(changes(), 2, 'back to the family (one), the same tile (none)');
  press(d, 'exact:3');
  assert.strictEqual(changes(), 3, 'a different tile in the same family');
  press(d, 'fam:oneside_above'); press(d, 'exact:12');
  assert.strictEqual(changes(), 4, 'a different family, completed by its tile: once');
  press(d, 'fam:door');
  assert.strictEqual(changes(), 5, 'a one-layout family: once');
  await settle();

  // ---- only the newest pick is saved ---------------------------------------------------------
  var n = harness();
  n.app.go('doorway');
  press(n, 'fam:oneside');
  press(n, 'exact:2'); press(n, 'exact:3');
  await settle();
  assert.strictEqual(n.updates.length, 1, 'one save');
  assert.strictEqual(n.updates[0][1].design['Frame Design'].id, 3, 'carrying the second frame');

  // ---- "Matches the door": offered on a full-height side frame, never with a top light -------
  var m = harness();
  m.app.go('doorway');
  press(m, 'fam:oneside'); press(m, 'exact:2');
  await settle();
  assert.ok(key(m, 'opt:Sidelight Glass:Matches the door'), 'offered without a top light');
  press(m, 'fam:oneside_above'); press(m, 'exact:14');
  await settle();
  assert.ok(key(m, 'opt:Sidelight Type:Glazed'), 'side glass rows shown');
  assert.ok(!key(m, 'opt:Sidelight Glass:Matches the door'), 'not offered with a top light');
  assert.notStrictEqual((m.app.design()['Sidelight Glass'] || {}).label, 'Matches the door', 'nor kept');
  assert.strictEqual(Doorway.familyOf(14), 'oneside_above');

  console.log('d4-doorway-screen.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
