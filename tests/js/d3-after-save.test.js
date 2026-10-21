// Designer 3 after saving: the side/top light question, the quote and call back, and saved links.
// Real app, wizard and saver in a stub DOM; the api is a recording fake.
// `node tests/js/d3-after-save.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, listeners: {}, style: {}, parentNode: null, hidden: false, disabled: false, value: '', type: '',
    appendChild: function (c) { if (c.parentNode) { c.parentNode.removeChild(c); } c.parentNode = n; n.children.push(c); return c; },
    removeChild: function (c) { n.children = n.children.filter(function (x) { return x !== c; }); c.parentNode = null; return c; },
    setAttribute: function (k, v) { n.attrs[k] = String(v); },
    getAttribute: function (k) { return k in n.attrs ? n.attrs[k] : null; },
    addEventListener: function (type, fn) { (n.listeners[type] = n.listeners[type] || []).push(fn); },
    focus: function () { document.activeElement = n; },
    scrollIntoView: function () {},
    classList: { contains: function (c) { return (' ' + n.className + ' ').indexOf(' ' + c + ' ') !== -1; }, toggle: function () {}, add: function () {}, remove: function () {} }
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children.forEach(function (c) { c.parentNode = null; }); n.children = []; }, get: function () { return ''; } });
  return n;
}
global.document = { createElement: node, activeElement: null };
function all(n, test, out) { out = out || []; if (test(n)) { out.push(n); } n.children.forEach(function (c) { all(c, test, out); }); return out; }
function walk(n, test) { return all(n, test)[0] || null; }
function text(n) { return all(n, function () { return true; }).map(function (x) { return x.textContent; }).join(' '); }
function byKey(n, k) { return walk(n, function (x) { return x.attrs['data-k'] === k; }); }
function byText(n, t) { return walk(n, function (x) { return (x.tag === 'button' || x.tag === 'a') && (x.textContent === t || x.children.some(function (c) { return c.textContent === t; })); }); }
function byTag(n, t) { return walk(n, function (x) { return x.tag === t; }); }
function input(n, name) { return walk(n, function (x) { return x.tag === 'input' && x.name === name; }); }
function fire(n, type) { assert.ok(n, 'element to ' + type); (n.listeners[type] || []).forEach(function (fn) { fn({ preventDefault: function () {} }); }); }
function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (var i = 0; i < 6; i++) { await tick(); } }

var model = require('../../data/render-model.json');
var fx = require('./fixtures/customer-view.js');
global.window = {
  location: { origin: 'https://example.test', pathname: '/d/', search: '' },
  HD_DD_CONFIG: { restUrl: 'https://example.test/wp-json/hd/', pluginUrl: 'https://example.test/plugin/', d3Defaults: require('../../data/designer3-defaults.json'), trust: { guidePrice: 'GUIDE PRICE LINE' } },
  HD_DD_StepConfig: require('../../assets/js/wizard/step-config.js'),
  HD_DD_Wizard: require('../../assets/js/wizard/wizard-controller.js'),
  HD_DD_Shared: require('../../assets/js/design-shared.js'),
  HD_DD_RenderModel: require('../../assets/js/render-model.js'),
  HD_DD_Enquiry: require('../../assets/js/enquiry.js'),
  HD_DD_ReviewSave: require('../../assets/js/swipe/review-save.js'),
  HD_DD_Trust: require('../../assets/js/trust.js'),
  HD_DD_SwipeParts: require('../../assets/js/swipe/swipe-parts.js'),
  HD_DD_D3Defaults: require('../../assets/js/designer3/d3-defaults.js'),
  HD_DD_D3Hotspots: require('../../assets/js/designer3/d3-hotspots.js'),
  HD_DD_D3Nudge: require('../../assets/js/designer3/d3-nudge.js'),
  HD_DD_D3Save: require('../../assets/js/designer3/d3-save.js'),
  HD_DD_D3Toolbox: require('../../assets/js/designer3/d3-toolbox.js'),
  HD_DD_D3Frame: require('../../assets/js/designer3/d3-frame.js')
};
require('../../assets/js/designer3/d3-screens.js');
require('../../assets/js/designer3/d3-callback.js');
require('../../assets/js/designer3/d3-frame-step.js');
require('../../assets/js/designer3/d3-after-save.js');
require('../../assets/js/designer3/d3-app.js');
var A = window.HD_DD_D3AfterSave;
var RS = window.HD_DD_ReviewSave;

// replies: path regexp -> response. Every call is recorded.
function harness(type, style, replies) {
  var h = { steps: [], leads: 0, calls: [] };
  h.api = function (path, o) {
    h.calls.push([path, o && o.body ? JSON.parse(o.body) : null]);
    var r = (replies || []).filter(function (x) { return x[0].test(path); })[0];
    return Promise.resolve(r ? r[1] : { ok: true, status: 200, body: { ok: true } });
  };
  h.app = new window.HD_DD_Designer3App(node('div'), fx.customerView(), model, null,
    { api: h.api, funnel: { step: function (k, c) { h.steps.push([k, c]); }, lead: function () { h.leads++; } }, flow: 'designer3', storage: null });
  if (type) {
    h.app.select('Door Type', type);
    h.app.select('Door Design', style);
    h.app.savedToken = 'tok';               // as if just saved
    h.app.go('saved');
  }
  h.updates = function () { return h.calls.filter(function (c) { return c[0] === 'save/tok'; }); };
  h.lastFrame = function () { var u = h.updates(); return u.length ? u[u.length - 1][1].design['Frame Design'] : null; };
  h.frameSteps = function () { return h.steps.filter(function (s) { return s[0] === 'frame'; }); };
  return h;
}
function shell(h) { return h.app.shell; }
function chip(h, k) { return byKey(shell(h), k); }

(async function () {
  // ---- saved screen: confirmation, then straight into the frame question -------------------
  var h = harness('Single Door', 'Abbott');
  assert.strictEqual(h.app.screen, 'saved');
  var t = text(shell(h));
  assert.ok(t.indexOf('✓ Saved. We’ve emailed you a link to your design.') !== -1, 'saved line');
  assert.ok(t.indexOf('Does your doorway have glass at the side or top?') !== -1, 'frame question');
  assert.ok(t.indexOf('It helps us price it properly.') !== -1, 'frame why');
  assert.ok(chip(h, 'sides:left') && chip(h, 'top:full'), 'side and top chips');
  assert.ok(!all(shell(h), function (x) { return (' ' + x.className + ' ').indexOf(' is-on ') !== -1 && /^(sides|top|panel|joint):/.test(x.attrs['data-k'] || ''); }).length, 'nothing pre-selected');
  assert.ok(!chip(h, 'panel:glass'), 'no panel chips until a side is chosen');

  // ---- "Just the door" after trying a side: updates with No Sidelights, lands on the quote --
  fire(chip(h, 'sides:left'), 'click');
  assert.strictEqual(chip(h, 'top:full').disabled, true, 'full width is disabled once a side is chosen');
  assert.ok(chip(h, 'panel:glass'), 'panel chips once a side is chosen');
  fire(chip(h, 'top:none'), 'click');
  fire(chip(h, 'panel:glass'), 'click');
  await settle();
  assert.strictEqual(h.app.design()['Frame Design'].id, 2, 'left, no top, full glass = id 2');
  assert.strictEqual(h.lastFrame().id, 2, 'each pick updates the save');
  var img = walk(shell(h), function (x) { return x.tag === 'img' && /frames\/frame-02-/.test(x.src || ''); });
  assert.ok(img && img.src.indexOf('https://example.test/plugin/assets/img/frames/') === 0, 'the drawing for the combination');
  assert.strictEqual(h.app.design()['Sidelight Type'].label, 'Glazed', 'glass at the side means glazed side panels');
  assert.ok(chip(h, 'opt:Sidelight Glass:Matches the door'), 'a full-height side panel may match the door');
  fire(chip(h, 'opt:Sidelight Type:Unglazed'), 'click');
  await settle();
  assert.strictEqual(h.app.design()['Sidelight Type'].label, 'Unglazed', 'they can pick solid');
  assert.strictEqual(h.updates()[h.updates().length - 1][1].design['Sidelight Type'].label, 'Unglazed', 'and it is saved');
  assert.ok(!chip(h, 'opt:Sidelight Glass:Matches the door'), 'no side glass row on solid panels');
  fire(chip(h, 'opt:Sidelight Type:Glazed'), 'click');
  fire(byText(shell(h), 'Just the door'), 'click');
  await settle();
  assert.strictEqual(h.lastFrame().label, 'No Sidelights');
  assert.strictEqual(h.app.design()['Frame Design'].label, 'No Sidelights');
  assert.deepStrictEqual(h.frameSteps(), [['frame', 'No Sidelights']]);
  assert.strictEqual(h.app.screen, 'quote', 'lands on the quote buttons');
  assert.ok(byText(shell(h), 'Get a no-obligation quote'), 'primary');
  assert.ok(byText(shell(h), 'Request a call back about this door'), 'secondary');
  assert.ok(text(shell(h)).indexOf('GUIDE PRICE LINE') !== -1, 'guide price');

  // ---- both sides + top + half flags: the two joints are ids 20 and 33 ----------------------
  for (var pair of [['bar', 20], ['totop', 33]]) {
    var b = harness('Single Door', 'Abbott');
    fire(chip(b, 'sides:both'), 'click');
    fire(chip(b, 'top:top'), 'click');
    assert.ok(!chip(b, 'joint:bar'), 'no joint until half flag');
    fire(chip(b, 'panel:halfflag'), 'click');
    var jb = chip(b, 'joint:bar'), jt = chip(b, 'joint:totop');
    assert.ok(jb && jt, 'joint chips for half flag with a top light');
    assert.ok(text(jb).indexOf('Bar level with the top of the door') !== -1);
    assert.ok(text(jt).indexOf('Glass runs up to the top') !== -1);
    assert.ok(byTag(jb, 'img') && /frame-20-/.test(byTag(jb, 'img').src) && /frame-33-/.test(byTag(jt, 'img').src), 'each joint shows its drawing');
    fire(chip(b, 'joint:' + pair[0]), 'click');
    await settle();
    assert.strictEqual(b.app.design()['Frame Design'].id, pair[1]);
    assert.strictEqual(b.lastFrame().id, pair[1], 'updated with id ' + pair[1]);
    assert.ok(b.app.stepFor('Sidelight Type'), 'glass rows apply');
    assert.ok(chip(b, 'opt:Sidelight Type:Glazed') || chip(b, 'opt:Sidelight Type:Solid'), 'Sidelight Type row shown');
    var sg = b.app.design()['Sidelight Glass'];
    assert.ok(!sg || sg.label !== 'Matches the door', 'top-light frames never keep Matches the door');
    assert.ok(!chip(b, 'opt:Sidelight Glass:Matches the door'), 'and do not offer it');
    fire(byText(shell(b), 'Next: get my quote'), 'click');
    await settle();
    assert.deepStrictEqual(b.frameSteps(), [['frame', 'Toplight with Half Flag Both']]);
    assert.strictEqual(b.app.screen, 'quote');
  }

  // ---- "Keep customising the door" goes back to the door ------------------------------------
  var k = harness('Single Door', 'Abbott');
  fire(byText(shell(k), 'Keep customising the door'), 'click');
  assert.strictEqual(k.app.screen, 'door');

  // ---- Double Door skips the frame step -----------------------------------------------------
  var dd = harness('Double Door', window.HD_DD_SwipeParts ? fx.customerView().byType['Double Door'].fields['Door Design'][0].label : '');
  assert.strictEqual(dd.app.screen, 'saved');
  var dt = text(shell(dd));
  assert.ok(dt.indexOf('✓ Saved. We’ve emailed you a link to your design.') !== -1);
  assert.ok(dt.indexOf('Does your doorway have glass') === -1, 'no frame question');
  assert.ok(byText(shell(dd), 'Get a no-obligation quote'), 'straight to the quote buttons');

  // ---- quote: opens the form (quoteform), success calls lead() once, then the done screen ----
  var q = harness('Single Door', 'Abbott', [[/\/quote$/, { ok: true, status: 201, body: { ok: true, reference: 'HD-1', token: 'tok' } }]]);
  fire(byText(shell(q), 'Just the door'), 'click');
  await settle();
  fire(byText(shell(q), 'Get a no-obligation quote'), 'click');
  assert.deepStrictEqual(q.steps[q.steps.length - 1], ['quoteform', undefined]);
  var f = byTag(shell(q), 'form');
  assert.ok(input(f, 'name') && input(f, 'postcode') && input(f, 'telephone'), 'name, postcode, phone');
  input(f, 'name').value = 'Ann'; input(f, 'postcode').value = 'AL1 1AA';
  fire(f, 'submit');
  await settle();
  var qc = q.calls.filter(function (c) { return c[0] === 'save/tok/quote'; });
  assert.strictEqual(qc.length, 1);
  assert.strictEqual(qc[0][1].name, 'Ann');
  assert.strictEqual(q.leads, 1, 'lead() once');
  assert.strictEqual(q.app.screen, 'done');
  assert.ok(text(shell(q)).indexOf('Saved — and your price is on its way.') !== -1, 'Swipe 2 done screen');
  assert.ok(!q.steps.some(function (s) { return s[0] === 'callback'; }));

  // ---- call back: name + phone required, fires `callback`, NEVER lead() ----------------------
  var c = harness('Single Door', 'Abbott', [[/\/callback$/, { ok: true, status: 201, body: { ok: true, reference: 'HD-2' } }]]);
  fire(byText(shell(c), 'Just the door'), 'click');
  await settle();
  fire(byText(shell(c), 'Request a call back about this door'), 'click');
  assert.strictEqual(c.app.screen, 'callback');
  var cf = byTag(shell(c), 'form');
  assert.ok(input(cf, 'name') && input(cf, 'telephone') && !input(cf, 'postcode'));
  input(cf, 'name').value = 'Bob';
  fire(cf, 'submit');
  await settle();
  assert.strictEqual(c.calls.filter(function (x) { return /callback$/.test(x[0]); }).length, 0, 'phone is required');
  input(byTag(shell(c), 'form'), 'telephone').value = '01234 567890';
  fire(byTag(shell(c), 'form'), 'submit');
  await settle();
  var cc = c.calls.filter(function (x) { return x[0] === 'save/tok/callback'; });
  assert.strictEqual(cc.length, 1);
  assert.deepStrictEqual([cc[0][1].name, cc[0][1].telephone], ['Bob', '01234 567890']);
  assert.ok(cc[0][1].pageUrl);
  assert.deepStrictEqual(c.steps[c.steps.length - 1], ['callback', undefined]);
  assert.strictEqual(c.leads, 0, 'a call back never calls lead()');
  assert.ok(text(shell(c)).indexOf('Thanks. We’ll call you within one working day about your door.') !== -1);

  // call back field errors from the server
  var ce = harness('Single Door', 'Abbott', [[/\/callback$/, { ok: false, status: 422, body: { code: 'hd_dd_validation', data: { fields: { telephone: 'Please enter a valid phone number.' } } } }]]);
  ce.app.go('callback');
  var cef = byTag(shell(ce), 'form');
  input(cef, 'name').value = 'Bob'; input(cef, 'telephone').value = '1';
  fire(cef, 'submit');
  await settle();
  assert.ok(text(shell(ce)).indexOf('Please enter a valid phone number.') !== -1);
  assert.strictEqual(ce.app.screen, 'callback');
  assert.ok(!ce.steps.some(function (s) { return s[0] === 'callback'; }));

  // ---- call back screen has its heading ------------------------------------------------------
  assert.ok(walk(shell(ce), function (x) { return x.tag === 'h2' && x.textContent === 'Request a call back about this door'; }), 'call back h2');

  // ---- call back after a 409 on the update: the design is already with us, not a dead end ---
  var CB = window.HD_DD_D3Callback;
  var c4 = harness('Single Door', 'Abbott', [[/^save\/tok$/, { ok: false, status: 409, body: { code: 'hd_dd_already_enquiry' } }]]);
  c4.app.select('Frame Design', { label: 'Sidelight Left', id: 2 });   // changed: the update will be sent
  c4.app.go('callback');
  var c4f = byTag(shell(c4), 'form');
  input(c4f, 'name').value = 'Bob'; input(c4f, 'telephone').value = '01234 567890';
  fire(c4f, 'submit');
  await settle();
  assert.strictEqual(c4.updates().length, 1, 'the update was tried');
  assert.strictEqual(c4.app.savedToken, null, 'the 409 closed the record');
  assert.ok(text(shell(c4)).indexOf(CB.COPY.already) !== -1, 'already-with-us state');
  assert.ok(text(shell(c4)).indexOf('Something went wrong') === -1);
  assert.ok(!byTag(shell(c4), 'form'), 'no form left to retry');
  assert.ok(byText(shell(c4), 'Keep customising the door'));
  assert.strictEqual(c4.calls.filter(function (x) { return /callback$/.test(x[0]); }).length, 0);
  assert.ok(!c4.steps.some(function (x) { return x[0] === 'callback'; }) && c4.leads === 0);
  // ... and a 409 from the call back route itself
  var c5 = harness('Single Door', 'Abbott', [[/\/callback$/, { ok: false, status: 409, body: { code: 'hd_dd_already_enquiry', message: 'x' } }]]);
  c5.app.go('callback');
  var c5f = byTag(shell(c5), 'form');
  input(c5f, 'name').value = 'Bob'; input(c5f, 'telephone').value = '01234 567890';
  fire(c5f, 'submit');
  await settle();
  assert.ok(text(shell(c5)).indexOf(CB.COPY.already) !== -1 && !byTag(shell(c5), 'form'));
  assert.strictEqual(c5.app.savedToken, null);
  // ... and with no saved record at all: back to save
  var c6 = harness(null, null);
  c6.app.select('Door Type', 'Single Door'); c6.app.select('Door Design', 'Abbott');
  c6.app.go('callback');
  assert.ok(!byTag(shell(c6), 'form'), 'no form without a record');
  fire(byText(shell(c6), 'Save my design'), 'click');
  assert.strictEqual(c6.app.screen, 'door', 'sent back to save');

  // ---- half-made chips: the design keeps its last complete layout; leaving resyncs the chips --
  var hm = harness('Single Door', 'Abbott');
  fire(chip(hm, 'sides:both'), 'click'); fire(chip(hm, 'top:top'), 'click'); fire(chip(hm, 'panel:glass'), 'click');
  await settle();
  assert.strictEqual(hm.app.design()['Frame Design'].id, 18);
  fire(chip(hm, 'panel:halfflag'), 'click');   // now a joint is needed
  await settle();
  assert.strictEqual(hm.app.design()['Frame Design'].id, 18, 'still the last complete layout');
  assert.strictEqual(hm.lastFrame().id, 18, 'and so is the saved record');
  assert.strictEqual(byText(shell(hm), 'Next: get my quote').disabled, true, 'Next waits for the joint');
  fire(byText(shell(hm), 'Keep customising the door'), 'click');
  assert.strictEqual(hm.app.screen, 'door');
  assert.deepStrictEqual(hm.app.after.sel, { sides: 'both', top: 'top', panel: 'glass' }, 'chips match the design again');

  // ---- the door screen never brings back "Matches the door" on a top-light frame -------------
  var rs = harness('Single Door', 'Abbott');
  ['sides:both', 'top:top', 'panel:halfflag', 'joint:bar'].forEach(function (k) { fire(chip(rs, k), 'click'); });
  rs.app.wiz.select('Sidelight Glass', { label: 'Matches the door', id: null });
  rs.app.go('door');
  rs.app.restyle('Abbott');
  assert.strictEqual(rs.app.design()['Frame Design'].id, 20);
  assert.notStrictEqual(rs.app.design()['Sidelight Glass'].label, 'Matches the door', 'settle swaps it out');
  assert.ok(!window.HD_DD_D3Toolbox.moreGroups(rs.app).some(function (g) { return /Sidelight/.test(g.heading); }), 'side glass is not in More options');

  // ---- loadSaved -------------------------------------------------------------------------
  var saved = (function () { var s = harness('Single Door', 'Abbott'); return JSON.parse(JSON.stringify(s.app.design())); })();
  function opened(kind, search) {
    window.location.search = search || '';
    var o = harness(null, null, [[/^design\//, { ok: true, status: 200, body: { design: saved, flow: 'designer3', kind: kind } }]]);
    o.app.loadSaved('tok');
    return settle().then(function () { return o; });
  }
  var l1 = await opened('save', '');
  assert.strictEqual(l1.app.screen, 'saved');
  assert.strictEqual(l1.app.savedToken, 'tok');
  assert.ok(text(shell(l1)).indexOf('Does your doorway have glass at the side or top?') !== -1);

  var l2 = await opened('save', '?design=tok&price=1');
  assert.strictEqual(l2.app.screen, 'quote');
  var lf = byTag(shell(l2), 'form');
  assert.ok(lf && input(lf, 'postcode'), 'price=1 opens the quote form');
  assert.ok(l2.steps.some(function (s) { return s[0] === 'quoteform'; }));

  var l3 = await opened('callback', '');
  assert.strictEqual(l3.app.savedToken, null);
  assert.ok(text(shell(l3)).indexOf(RS.COPY.sentTitle) !== -1, 'already-sent state on a call back');
  assert.ok(!byText(shell(l3), 'Get a no-obligation quote'), 'no quote button on a sent design');
  var l4 = await opened('enquiry', '?price=1');
  assert.ok(text(shell(l4)).indexOf(RS.COPY.sentTitle) !== -1, 'already-sent state on an enquiry, even with price=1');
  assert.ok(!byTag(shell(l4), 'form'));
  window.location.search = '';

  assert.ok(A.COPY, 'copy exported');
  console.log('d3-after-save.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
