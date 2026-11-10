// Designer 4 My designs: the page the emailed link opens. Real Designer 3/4 app in the stub DOM of
// the step-screen harness; the store is a recording fake.
// `node tests/js/d4-mydesigns.test.js`
var T = require('./fixtures/d4-steps-harness.js');
var assert = T.assert, has = T.has, all = T.all, walk = T.walk, text = T.text, byCls = T.byCls, allCls = T.allCls, byKey = T.byKey;
var byText = T.byText, fire = T.fire, settle = T.settle, fx = T.fx, Doorway = T.Doorway, node = T.node;
require('../../assets/js/designer4/d4-card.js');
require('../../assets/js/designer4/d4-mydesigns.js');
var MD = window.HD_DD_D4MyDesigns;

function door(over) {
  var d = { token: 'tA', reference: 'HD-2026-000090', name: 'Etna in French Navy', image: 'https://example.test/up/a.png',
    savedAt: '2026-11-10 06:49:12', frame: null, sideGlass: '', status: 'pending' };
  Object.keys(over || {}).forEach(function (k) { d[k] = over[k]; });
  return d;
}
function reply(doors, extra) {
  var body = { email: 'nicola@example.com', owner: true, doors: doors, missing: { name: false, postcode: false, phone: false }, older: false };
  Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
  return { ok: true, status: 200, body: body };
}
function page(listReply) {
  var h = { steps: [], lists: 0, removes: [], opened: [], replies: [listReply], mail: '' };
  h.store = {
    email: function () { return h.mail; }, setEmail: function (e) { h.mail = e; },
    addToken: function () {}, auth: function () { return { tokens: ['tA'] }; },
    list: function () { h.lists++; var r = h.replies.length > 1 ? h.replies.shift() : h.replies[0]; return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); },
    remove: function (t) { h.removes.push(t); return h.removeReply instanceof Error ? Promise.reject(h.removeReply) : Promise.resolve(h.removeReply || { ok: true, status: 200, body: { ok: true } }); }
  };
  h.app = new window.HD_DD_Designer4App(node('div'), fx.customerView(), require('../../data/render-model.json'), null, {
    api: function () { return Promise.resolve({ ok: false }); },
    funnel: { step: function (k, c) { h.steps.push([k, c]); }, lead: function () {} },
    storage: null, store: h.store
  });
  h.app.loadSaved = function (t, screen) { h.opened.push([t, screen]); };
  h.app.startDoor = function () { h.opened.push(['new']); };
  h.app.go('designs');
  h.sh = function () { return h.app.shell; };
  h.cards = function () { return allCls(h.sh(), 'hd-d4-card').filter(function (c) { return !has(c, 'hd-d4-card--new'); }); };
  h.of = function (k) { return h.steps.filter(function (s) { return s[0] === k; }); };
  return h;
}
function btn(n, t) { return byText(n, t); }

(async function () {
  assert.strictEqual(typeof MD.render, 'function', 'HD_DD_D4MyDesigns.render');

  // ---- two pending doors and an estimate_sent one ------------------------------------------
  var h = page(reply([door(), door({ token: 'tB', name: 'Etna in Anthracite Grey', savedAt: '2026-01-03 23:59:00' }),
    door({ token: 'tC', name: 'Skiddaw in Red', status: 'estimate_sent', frame: { id: 5, label: 'Half Flag Right' } })]));
  assert.deepStrictEqual(h.of('mydesigns'), [['mydesigns', undefined]], 'mydesigns step fired');
  await settle();
  var sh = h.sh();
  assert.strictEqual(h.lists, 1);
  assert.ok(byCls(sh, 'hd-d4-designs'), 'page wrapper');
  var head = walk(sh, function (x) { return x.tag === 'h2' && x.textContent === 'Your designs'; });
  assert.ok(head && has(head.parentNode, 'hd-d4-designs__head'), 'heading in the head');
  assert.ok(text(sh).indexOf('Saved to nicola@example.com') !== -1);
  assert.ok(text(sh).indexOf('We\'ll email your price for each door here. Remove any you\'ve gone off, and tell us about glass beside or above the door for a closer price.') !== -1, 'lead line');
  assert.strictEqual(h.mail, 'nicola@example.com', 'store.setEmail from the reply');
  assert.deepStrictEqual(h.app.missing, { name: false, postcode: false, phone: false }, 'app.missing from the reply');
  var cards = h.cards();
  assert.strictEqual(cards.length, 3);
  assert.strictEqual(byCls(cards[0], 'hd-d4-card__name').textContent, 'Etna in French Navy');
  assert.strictEqual(byCls(cards[0], 'hd-d4-card__date').textContent, 'Saved 10 Nov');
  assert.strictEqual(byCls(cards[1], 'hd-d4-card__date').textContent, 'Saved 3 Jan');
  assert.strictEqual(byCls(cards[0], 'hd-d4-card__tag').textContent, 'Price on its way');
  assert.strictEqual(byCls(cards[1], 'hd-d4-card__tag').textContent, 'Price on its way');
  assert.strictEqual(byCls(cards[2], 'hd-d4-card__tag').textContent, 'Estimate sent');
  var pic = byCls(cards[0], 'hd-d4-card__pic');
  assert.ok(pic && pic.tag === 'img' && pic.alt === '' && pic.src === 'https://example.test/up/a.png', 'door picture');
  assert.ok(btn(cards[0], 'Open and adjust') && btn(cards[0], 'Remove'), 'live door: open and remove');
  assert.ok(btn(cards[2], 'Open and adjust') && btn(cards[2], 'Remove'), 'estimate sent: still changeable');
  assert.ok(byCls(cards[0].parentNode, 'hd-d4-cards') || has(cards[0].parentNode, 'hd-d4-cards'), 'cards in the list');
  assert.ok(!byCls(sh, 'hd-d4-designs__missing'), 'nothing missing: no details prompt');
  assert.ok(!byCls(sh, 'hd-d4-designs__older'), 'older false: no line');

  // ---- the doorway: prompt with no frame, caption and Change with one ----------------------
  var ask = byCls(cards[0], 'hd-d4-card__doorway');
  assert.ok(ask, 'doorway prompt');
  assert.strictEqual(text(ask).replace(/\s+/g, ' ').trim(), 'Does your doorway have glass at the side or top? Tell us for a closer price ›');
  var askBtn = ask.tag === 'button' ? ask : walk(ask, function (x) { return x.tag === 'button'; });
  fire(askBtn, 'click');
  assert.deepStrictEqual(h.opened.pop(), ['tA', 'doorway'], 'the prompt opens that door at the doorway');
  var known = byCls(cards[2], 'hd-d4-card__doorway');
  assert.ok(text(known).indexOf(Doorway.CAPTIONS[5]) !== -1, 'caption for frame id 5');
  assert.ok(text(known).indexOf('Does your doorway') === -1, 'no prompt once answered');
  fire(btn(cards[2], 'Change'), 'click');
  assert.deepStrictEqual(h.opened.pop(), ['tC', 'doorway'], 'Change opens the doorway');
  fire(btn(cards[1], 'Open and adjust'), 'click');
  assert.deepStrictEqual(h.opened.pop(), ['tB', 'door'], 'Open and adjust opens the door screen');

  // ---- Remove asks first; Keep it restores; Remove calls store.remove once ------------------
  fire(btn(h.cards()[1], 'Remove'), 'click');
  var rc = h.cards()[1];
  assert.ok(has(rc, 'is-removing'), 'the card swaps to the question');
  assert.ok(text(rc).indexOf('Remove Etna in Anthracite Grey?') !== -1);
  assert.ok(text(rc).indexOf('We won\'t price this one.') !== -1);
  assert.ok(!btn(rc, 'Open and adjust'), 'question only');
  assert.strictEqual(document.activeElement && document.activeElement.attrs['data-k'], 'keep:tB', 'focus on Keep it');
  assert.strictEqual(h.cards().length, 3);
  fire(btn(rc, 'Keep it'), 'click');
  rc = h.cards()[1];
  assert.ok(!has(rc, 'is-removing') && btn(rc, 'Open and adjust'), 'Keep it restores the card');
  assert.strictEqual(document.activeElement.attrs['data-k'], 'remove:tB', 'focus back on Remove');
  assert.strictEqual(h.removes.length, 0);

  // a failure restores the card with a message and keeps the door
  h.removeReply = { ok: false, status: 500, body: {} };
  fire(btn(rc, 'Remove'), 'click');
  rc = h.cards()[1];
  var yes = btn(rc, 'Remove'), keep = btn(rc, 'Keep it');
  fire(yes, 'click');
  assert.ok(yes.disabled && keep.disabled, 'both buttons disabled while it runs');
  fire(yes, 'click');
  await settle();
  assert.deepStrictEqual(h.removes, ['tB'], 'one request');
  rc = h.cards()[1];
  assert.ok(btn(rc, 'Open and adjust'), 'restored');
  assert.ok(text(rc).indexOf('Sorry, that didn\'t work. Please try again.') !== -1, 'failure message');
  assert.strictEqual(h.of('door_removed').length, 0);
  assert.strictEqual(h.lists, 1, 'no reload after a failure');

  // success: door_removed, the list reloaded, the card gone, focus on the heading
  h.removeReply = null;
  h.replies = [reply([door(), door({ token: 'tC', name: 'Skiddaw in Red', status: 'estimate_sent', frame: { id: 5, label: 'Half Flag Right' } })])];
  fire(btn(rc, 'Remove'), 'click');
  fire(btn(h.cards()[1], 'Remove'), 'click');
  await settle();
  assert.deepStrictEqual(h.removes, ['tB', 'tB']);
  assert.strictEqual(h.of('door_removed').length, 1, 'door_removed fired');
  assert.strictEqual(h.lists, 2, 'list reloaded');
  assert.strictEqual(h.cards().length, 2);
  assert.ok(text(h.sh()).indexOf('Etna in Anthracite Grey') === -1, 'the card is gone');
  assert.ok(document.activeElement && document.activeElement.tag === 'h2' && document.activeElement.textContent === 'Your designs', 'focus on the heading');
  assert.strictEqual(document.activeElement.attrs.tabindex, '-1');

  // ---- while a remove is in flight, the other cards' actions are ignored --------------------
  var b = page(reply([door(), door({ token: 'tB', name: 'Etna in Anthracite Grey' })]));
  await settle();
  var settleRemove;
  b.removeReply = new Promise(function (r) { settleRemove = r; });
  fire(btn(b.cards()[0], 'Remove'), 'click');
  fire(btn(b.cards()[0], 'Remove'), 'click');       // the confirm button: the request starts
  var other = b.cards()[1];
  fire(btn(other, 'Remove'), 'click');
  fire(btn(other, 'Open and adjust'), 'click');
  fire(walk(byCls(other, 'hd-d4-card__doorway'), function (x) { return x.tag === 'button'; }) || byCls(other, 'hd-d4-card__doorway'), 'click');
  assert.deepStrictEqual(b.opened, [], 'open and doorway ignored while busy');
  assert.ok(has(b.cards()[0], 'is-removing'), 'the busy card keeps its question');
  assert.ok(!has(b.cards()[1], 'is-removing'), 'the other card did not swap');
  assert.ok(btn(b.cards()[0], 'Remove').disabled && btn(b.cards()[0], 'Keep it').disabled, 'still disabled');
  settleRemove({ ok: false, status: 500, body: {} });
  await settle();
  assert.ok(!has(b.cards()[0], 'is-removing') && btn(b.cards()[0], 'Open and adjust'), 'settled: restored');
  fire(btn(b.cards()[1], 'Open and adjust'), 'click');
  assert.deepStrictEqual(b.opened, [['tB', 'door']], 'actions work again once settled');

  // ---- a door that won't open: back on My designs with a line, mydesigns not counted again ---
  var o = page(reply([door()]));
  await settle();
  o.app.loadSaved = window.HD_DD_Designer4App.prototype.loadSaved;   // the real one; the api fails
  assert.ok(!byCls(o.sh(), 'hd-d4-designs__notice'), 'no line before');
  fire(btn(o.cards()[0], 'Open and adjust'), 'click');
  await settle();
  assert.strictEqual(o.app.screen, 'designs');
  var notice = byCls(o.sh(), 'hd-d4-designs__notice');
  assert.ok(notice, 'the could-not-open line');
  assert.strictEqual(notice.textContent, 'Sorry, we couldn\'t open that door. Please try again.');
  assert.strictEqual(notice.attrs.role, 'alert');
  assert.strictEqual(o.of('mydesigns').length, 1, 'mydesigns fired once');
  assert.strictEqual(o.cards().length, 1, 'the list is shown again');
  o.app.go('designs');
  assert.ok(!byCls(o.sh(), 'hd-d4-designs__notice'), 'the line is for that one return only');

  // ---- design another door -----------------------------------------------------------------
  var nw = byCls(h.sh(), 'hd-d4-card--new');
  assert.ok(nw && text(nw).indexOf('Design another door') !== -1);
  fire(nw.tag === 'button' ? nw : walk(nw, function (x) { return x.tag === 'button'; }), 'click');
  assert.deepStrictEqual(h.opened.pop(), ['new'], 'startDoor');
  assert.strictEqual(h.of('door_added').length, 0, 'door_added is the app\'s, on the lead');

  // ---- a closed door: picture, name and date only ------------------------------------------
  var c = page(reply([door({ status: 'closed', frame: null }), door({ token: 'tD', status: 'closed', frame: { id: 5, label: 'X' } })]));
  await settle();
  c.cards().forEach(function (cc) {
    assert.ok(has(cc, 'is-closed'));
    assert.ok(!btn(cc, 'Remove') && !btn(cc, 'Open and adjust') && !btn(cc, 'Change'), 'closed: no actions');
    assert.ok(!byCls(cc, 'hd-d4-card__tag') && !byCls(cc, 'hd-d4-card__doorway'), 'closed: no tag, no doorway');
    assert.ok(byCls(cc, 'hd-d4-card__pic') && byCls(cc, 'hd-d4-card__name') && byCls(cc, 'hd-d4-card__date'));
    assert.strictEqual(all(cc, function (x) { return x.tag === 'button'; }).length, 0);
  });

  // ---- one details prompt; older line; never a name, phone or postcode ----------------------
  var m = page(reply([door(), door({ token: 'tB' })], {
    missing: { name: false, postcode: true, phone: false }, older: true,
    name: 'Ann Smith', phone: '01234 567890', postcode: 'AL1 1AA', details: { name: 'Ann Smith', phone: '01234 567890', postcode: 'AL1 1AA' }
  }));
  m.replies[0].body.doors[0].phone = '01234 567890';
  m.replies[0].body.doors[0].postcode = 'AL1 1AA';
  m.replies[0].body.doors[0].customer = 'Ann Smith';
  await settle();
  var prompts = allCls(m.sh(), 'hd-d4-designs__missing');
  assert.strictEqual(prompts.length, 1, 'exactly one details prompt');
  var pb = prompts[0].tag === 'button' ? prompts[0] : walk(prompts[0], function (x) { return x.tag === 'button'; });
  assert.ok(byCls(m.sh(), 'hd-d4-designs__older'));
  assert.ok(text(m.sh()).indexOf('Your earlier designs are behind the link in your email.') !== -1);
  ['Ann', 'Smith', '01234', '567890', 'AL1', '1AA'].forEach(function (s) { assert.ok(text(m.sh()).indexOf(s) === -1, 'never shows ' + s); });
  all(m.sh(), function () { return true; }).forEach(function (x) {
    Object.keys(x.attrs).forEach(function (k) { assert.ok(!/Ann|01234|AL1/.test(x.attrs[k]), 'no detail in an attribute'); });
  });
  fire(pb, 'click');
  assert.strictEqual(m.app.screen, 'details', 'the prompt opens details');

  // ---- picture only from https or this site -------------------------------------------------
  var p = page(reply([door({ image: 'http://evil.test/a.png' }), door({ token: 'tB', image: '/wp-content/up/b.png' }),
    door({ token: 'tE', image: 'javascript:alert(1)' }), door({ token: 'tF', image: '//evil.test/c.png' }), door({ token: 'tG', image: '' })]));
  await settle();
  var pics = p.cards().map(function (cc) { var i = byCls(cc, 'hd-d4-card__pic'); return i ? i.src : null; });
  assert.deepStrictEqual(pics, [null, '/wp-content/up/b.png', null, null, null]);

  // ---- an empty list: only the Design another door card -----------------------------------
  var e = page(reply([]));
  await settle();
  assert.strictEqual(e.cards().length, 0);
  assert.strictEqual(allCls(e.sh(), 'hd-d4-card--new').length, 1);

  // ---- a failed load: a retry line that loads again -----------------------------------------
  var f = page({ ok: false, status: 500, body: {} });
  await settle();
  assert.strictEqual(f.cards().length, 0);
  assert.ok(!byCls(f.sh(), 'hd-d4-card--new'), 'nothing listed on a failure');
  var retry = byKey(f.sh(), 'retry');
  assert.ok(retry && retry.tag === 'button', 'retry button');
  f.replies = [reply([door()])];
  fire(retry, 'click');
  await settle();
  assert.strictEqual(f.lists, 2);
  assert.strictEqual(f.cards().length, 1, 'loaded on retry');
  var r2 = page(new Error('offline'));
  await settle();
  assert.ok(byKey(r2.sh(), 'retry'), 'a rejected list also offers a retry');

  // ---- a reply arriving after leaving the page draws nothing --------------------------------
  var late = page(reply([door()]));
  var oldShell = late.sh();
  late.app.go('details');
  await settle();
  assert.strictEqual(late.app.screen, 'details');
  assert.strictEqual(allCls(oldShell, 'hd-d4-card').length, 0, 'the late list is ignored');
  assert.strictEqual(late.app.missing === null || late.app.missing === undefined, true, 'and changes nothing');

  // ---- no confirm() or alert() --------------------------------------------------------------
  ['d4-mydesigns.js', 'd4-card.js'].forEach(function (f) {
    var src = require('fs').readFileSync(require('path').join(__dirname, '../../assets/js/designer4', f), 'utf8');
    assert.ok(!/\b(confirm|alert)\s*\(/.test(src), f + ': no browser dialogs');
  });

  // ---- the card's date and picture rules ----------------------------------------------------
  var Card = window.HD_DD_D4Card;
  assert.strictEqual(Card.shortDate('2026-12-31 00:00:00'), '31 Dec');
  assert.strictEqual(Card.shortDate('2026-13-01 00:00:00'), '');
  assert.strictEqual(Card.shortDate('yesterday'), '');
  assert.strictEqual(Card.shortDate(null), '');
  assert.strictEqual(Card.picture('/\\evil.test/x.png'), '');
  assert.strictEqual(Card.picture('HTTPS://example.test/x.png'), 'HTTPS://example.test/x.png');
  // a frame id with no caption falls back to the frame's label
  var fb = page(reply([door({ frame: { id: 999, label: 'Some Frame' } })]));
  await settle();
  assert.ok(text(byCls(fb.cards()[0], 'hd-d4-card__doorway')).indexOf('Some Frame') !== -1, 'label fallback');
  // a date that isn't the expected shape: no date line
  var nd = page(reply([door({ savedAt: '' })]));
  await settle();
  assert.ok(!byCls(nd.cards()[0], 'hd-d4-card__date'));

  console.log('d4-mydesigns.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
