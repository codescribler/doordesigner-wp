// Designer 4 steps 2 and 3 and the finished screen: the doorway picked by picture, the details,
// done. Real Designer 3/4 app and wizard in a stub DOM; the store is a recording fake.
// `node tests/js/d4-steps.test.js`
var T = require('./fixtures/d4-steps-harness.js');
var assert = T.assert, has = T.has, all = T.all, walk = T.walk, text = T.text, byCls = T.byCls, allCls = T.allCls, byKey = T.byKey;
var byText = T.byText, input = T.input, fire = T.fire, settle = T.settle, fx = T.fx, Doorway = T.Doorway, harness = T.harness;

(async function () {
  // ---- the doorway: strip, green line, heading, six family pictures -------------------------
  var h = harness();
  h.app.go('doorway');
  var sh = h.shell();
  var strip = allCls(sh, 'hd-d4-strip__step');
  assert.deepStrictEqual(strip.map(function (s) { return s.textContent; }), ['✓ 1. Your door', '2. Your doorway', '3. Your details']);
  assert.ok(has(strip[0], 'is-done') && has(strip[1], 'is-now') && !has(strip[2], 'is-done'), 'step 1 ticked, step 2 now');
  assert.strictEqual(byCls(sh, 'hd-d4-okline').textContent, '✓ We\'ve got your door, and emailed a link to it to nicola@example.com.');
  assert.ok(walk(sh, function (x) { return x.tag === 'h2' && x.textContent === 'Now, what\'s around the door?'; }), 'heading');
  assert.ok(text(sh).indexOf('Glass beside or above the door changes the price. Grey is glass; the white gap is your door.') !== -1, 'help line');
  assert.ok(text(sh).indexOf('Which is closest? You\'ll pick the side and style next.') !== -1, 'row one question');
  var fams = h.families();
  assert.strictEqual(fams.length, 6, 'six family tiles for Single Door');
  Doorway.FAMILIES.forEach(function (f, i) {
    var t = fams[i], im = walk(t, function (x) { return x.tag === 'img'; });
    assert.strictEqual(t.tag, 'button'); assert.strictEqual(t.type, 'button');
    assert.strictEqual(text(t).trim(), f.label);
    assert.strictEqual(im.alt, '');
    assert.strictEqual(im.src, 'https://example.test/plugin/' + Doorway.drawing(f.pic), 'drawing for ' + f.label);
  });
  assert.strictEqual(h.exacts().length, 0, 'no second row yet');
  assert.strictEqual(h.next().disabled, true, 'Next waits for an exact doorway');
  assert.strictEqual(h.app.canvas && h.app.canvas.tag, 'canvas', 'the door is drawn on a canvas, used for the picture');
  assert.strictEqual(h.of('doorway').length, 1, 'doorway step fired');

  // ---- Just the door: one id, selected at once -----------------------------------------------
  fire(h.tile('Just the door'), 'click');
  await settle();
  assert.strictEqual(h.app.design()['Frame Design'].id, 1);
  assert.strictEqual(h.app.design()['Frame Design'].label, 'No Sidelights');
  assert.strictEqual(h.next().disabled, false, 'Next enabled');
  assert.ok(has(h.tile('Just the door'), 'is-on') && h.tile('Just the door').attrs['aria-pressed'] === 'true');
  assert.deepStrictEqual(h.of('doorway_group'), [['doorway_group', 'Just the door']]);
  assert.deepStrictEqual(h.of('doorway_exact'), [['doorway_exact', 'Just the door']]);
  assert.strictEqual(h.of('doorway_change').length, 0);
  assert.strictEqual(h.updates.length, 1);
  assert.strictEqual(h.updates[0][0], 'tok1');
  assert.strictEqual(h.updates[0][1].doorway, 'picked');
  assert.strictEqual(h.updates[0][1].design['Frame Design'].id, 1);

  // ---- a family with several layouts: the second row, no exact yet, a change -----------------
  fire(h.tile('Glass on one side (left or right)'), 'click');
  await settle();
  assert.strictEqual(h.exacts().length, 6, 'six exact tiles');
  assert.ok(text(h.shell()).indexOf('Which one exactly?') !== -1);
  assert.deepStrictEqual(h.exacts().map(function (t) { return text(t).trim(); }), [2, 3, 4, 5, 6, 7].map(function (id) { return Doorway.CAPTIONS[id]; }));
  assert.strictEqual(h.of('doorway_exact').length, 1, 'no doorway_exact yet');
  assert.deepStrictEqual(h.of('doorway_change'), [['doorway_change', 'Glass on one side (left or right)']]);
  assert.strictEqual(h.next().disabled, true, 'Next waits for the exact layout in this family');
  assert.strictEqual(h.updates.length, 1, 'nothing saved for a family alone');

  // ---- exact id 14: frame by id and label, glazed sides, the side glass rows ------------------
  fire(h.tile('One side and above'), 'click');
  fire(h.tile(Doorway.CAPTIONS[14]), 'click');
  await settle();
  var fd = h.app.design()['Frame Design'];
  assert.strictEqual(fd.id, 14); assert.strictEqual(fd.label, 'Toplight with Half Flag Left');
  assert.deepStrictEqual(h.of('doorway_exact')[1], ['doorway_exact', Doorway.CAPTIONS[14]]);
  assert.strictEqual(h.app.design()['Sidelight Type'].label, 'Glazed', 'side glass glazed');
  assert.ok(byKey(h.shell(), 'opt:Sidelight Type:Glazed'), 'Sidelight Type row');
  assert.ok(allCls(h.shell(), 'hd-d3-chip').some(function (c) { return /^opt:Sidelight Glass:/.test(c.attrs['data-k']); }), 'Sidelight Glass row');
  assert.ok(!byKey(h.shell(), 'opt:Sidelight Glass:Matches the door'), 'never Matches the door with a top light');
  var u = h.updates[h.updates.length - 1];
  assert.strictEqual(u[1].doorway, 'picked'); assert.strictEqual(u[1].design['Frame Design'].id, 14);
  assert.strictEqual(h.next().disabled, false);
  // side glass pick: kept as theirs
  fire(byKey(h.shell(), 'opt:Sidelight Type:Unglazed'), 'click');
  await settle();
  assert.strictEqual(h.app.design()['Sidelight Type'].label, 'Unglazed');
  assert.strictEqual(h.app.mine['Sidelight Type'], 'Unglazed');

  // ---- leave and come back: same family and tile, no second doorway step ---------------------
  h.app.go('door');
  h.app.go('doorway');
  assert.strictEqual(h.of('doorway').length, 1, 'doorway fires once per door');
  assert.ok(has(h.tile('One side and above'), 'is-on'), 'family shown');
  assert.ok(has(h.tile(Doorway.CAPTIONS[14]), 'is-on'), 'exact tile shown');
  assert.strictEqual(h.next().disabled, false);

  // ---- Next: details while anything is missing, else done ------------------------------------
  fire(h.next(), 'click');
  assert.strictEqual(h.app.screen, 'details');
  h.app.missing = { name: false, postcode: false, phone: false };
  h.app.go('doorway');
  fire(h.next(), 'click');
  assert.strictEqual(h.app.screen, 'done', 'nothing missing: done');

  // ---- a new door resets the doorway state ---------------------------------------------------
  h.app.startDoor();
  assert.strictEqual(h.app.d4steps, null, 'newDoor clears the per-door step state');

  // ---- Skip ----------------------------------------------------------------------------------
  var s = harness();
  s.app.go('doorway');
  fire(byCls(s.shell(), 'hd-d4-skip'), 'click');
  await settle();
  assert.strictEqual(s.of('doorway_skip').length, 1);
  assert.deepStrictEqual(s.updates, [['tok1', { doorway: 'skipped' }]]);
  assert.strictEqual(s.app.screen, 'details');

  // ---- details: labels, autocomplete, hints, empty Finish ------------------------------------
  var dsh = s.shell();
  var dstrip = allCls(dsh, 'hd-d4-strip__step');
  assert.deepStrictEqual(dstrip.map(function (x) { return x.textContent; }), ['✓ 1. Your door', '✓ 2. Your doorway', '3. Your details']);
  assert.ok(has(dstrip[2], 'is-now'));
  assert.ok(walk(dsh, function (x) { return x.tag === 'h2' && x.textContent === 'Last step: where\'s it going?'; }));
  assert.strictEqual(input(dsh, 'name').attrs.autocomplete, 'name');
  assert.strictEqual(input(dsh, 'postcode').attrs.autocomplete, 'postal-code');
  assert.strictEqual(input(dsh, 'telephone').attrs.autocomplete, 'tel');
  assert.strictEqual(input(dsh, 'telephone').type, 'tel');
  ['Your name', 'Postcode', 'Phone number', 'So we can check we cover you and price the fitting.', 'Helps if we need to check a detail.'].forEach(function (t) {
    assert.ok(text(dsh).indexOf(t) !== -1, t);
  });
  assert.strictEqual(all(dsh, function (x) { return x.tag === 'label'; }).length, 3, 'three visible labels');
  assert.strictEqual(s.of('details').length, 1, 'details step fired');
  fire(byCls(dsh, 'hd-d4-details'), 'submit');
  await settle();
  assert.strictEqual(s.details.length, 0, 'nothing sent');
  assert.strictEqual(s.of('finished').length, 0, 'nothing fired');
  assert.strictEqual(s.app.screen, 'done');

  // ---- details: a postcode 422 keeps the screen ----------------------------------------------
  var d = harness();
  d.detailsReply = { ok: false, status: 422, body: { code: 'hd_dd_validation', data: { status: 422, fields: { postcode: 'Please enter a valid UK postcode.' } } } };
  d.app.go('details');
  input(d.shell(), 'postcode').value = ' xx1 ';
  fire(byCls(d.shell(), 'hd-d4-details'), 'submit');
  await settle();
  assert.deepStrictEqual(d.details, [{ postcode: 'xx1' }], 'only the fields with a value');
  assert.strictEqual(d.app.screen, 'details');
  assert.ok(text(d.shell()).indexOf('Please enter a valid UK postcode.') !== -1, 'postcode message');
  assert.strictEqual(d.of('finished').length, 0);
  // then a good send: finished, missing updated, done
  d.detailsReply = null;
  input(d.shell(), 'postcode').value = '';
  input(d.shell(), 'name').value = 'Ann';
  input(d.shell(), 'telephone').value = '01234 567890';
  fire(byCls(d.shell(), 'hd-d4-details'), 'submit');
  await settle();
  assert.deepStrictEqual(d.details[1], { name: 'Ann', telephone: '01234 567890' });
  assert.strictEqual(d.of('finished').length, 1);
  assert.deepStrictEqual(d.app.missing, { name: false, postcode: true, phone: false });
  assert.strictEqual(d.app.screen, 'done');

  // ---- done: the line and the three links ----------------------------------------------------
  var dn = d.shell();
  assert.ok(byCls(dn, 'hd-d4-done'));
  assert.ok(text(dn).indexOf('✓ Your estimate is on its way') !== -1);
  assert.ok(text(dn).indexOf('We\'ll email it to nicola@example.com within 1 working day. Your design is saved, and you can change it any time.') !== -1);
  assert.ok(allCls(dn, 'hd-d4-strip__step').every(function (x) { return has(x, 'is-done'); }), 'every step ticked');
  ['See my designs', 'Design another door', 'Keep customising this door'].forEach(function (t) {
    var b = byText(dn, t);
    assert.ok(b && (b.tag === 'a' || b.type === 'button'), t);
  });
  fire(byText(dn, 'Keep customising this door'), 'click');
  assert.strictEqual(d.app.screen, 'door');
  d.app.go('done');
  fire(byText(d.shell(), 'See my designs'), 'click');
  assert.strictEqual(d.app.screen, 'designs');
  d.app.go('done');
  fire(byText(d.shell(), 'Design another door'), 'click');
  assert.strictEqual(d.app.screen, 'type');
  assert.strictEqual(d.app.known, true, 'startDoor: a fresh door for the known person');

  // ---- a door added from My designs, and a type without the doorway --------------------------
  var k = harness();
  k.app._askKnown = true;
  k.app.go('doorway');
  assert.strictEqual(byCls(k.shell(), 'hd-d4-okline').textContent, '✓ We\'ve added this door to your estimate.');
  // a door reopened from My designs: no green line
  var ro = harness();
  ro.app.reopened = true;      // as loadSaved leaves it
  ro.app.go('doorway');
  assert.ok(!byCls(ro.shell(), 'hd-d4-okline'), 'no confirmation line for a reopened door');
  ro.app.onLead({ ok: true, token: 'tok9' });   // then a door added this visit
  assert.strictEqual(ro.app.screen, 'doorway');
  assert.ok(byCls(ro.shell(), 'hd-d4-okline'), 'the line is back after an added door');
  // done with no door open (e.g. after "Design another door"): no "Keep customising"
  var nd = harness();
  nd.app.startDoor();
  nd.app.go('done');
  assert.ok(byText(nd.shell(), 'See my designs') && byText(nd.shell(), 'Design another door'));
  assert.ok(!byText(nd.shell(), 'Keep customising this door'), 'no keep link without a door');
  var dd = harness('Double Door', fx.customerView().byType['Double Door'].fields['Door Design'][0].label);
  dd.app.go('details');
  assert.deepStrictEqual(allCls(dd.shell(), 'hd-d4-strip__step').map(function (x) { return x.textContent; }), ['✓ 1. Your door', '2. Your details']);

  console.log('d4-steps.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
