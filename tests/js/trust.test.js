// Review-step social proof + benefits block. `node tests/js/trust.test.js`
var assert = require('assert');

// A minimal document: enough for trust.js to build elements we can inspect.
function node(tag) {
  return {
    tag: tag, className: '', textContent: '', children: [], attrs: {},
    appendChild: function (c) { this.children.push(c); return c; },
    addEventListener: function (type, fn) { this.listeners = this.listeners || {}; this.listeners[type] = fn; },
    setAttribute: function (k, v) { this.attrs[k] = v; }
  };
}
global.document = { createElement: node };
var Trust = require('../../assets/js/trust.js');

function find(n, cls) {
  if (n.className === cls) { return n; }
  for (var i = 0; i < n.children.length; i++) { var r = find(n.children[i], cls); if (r) { return r; } }
  return null;
}
function text(n) { return n.textContent + n.children.map(text).join(''); }

var full = { rating: '10', count: '79', url: 'https://www.checkatrade.com/trades/x', quotes: [{ text: 'Tidy job', by: 'Jo, Hitchin' }, { text: 'Lovely door', by: '' }] };

// Rating line needs both a rating and a count.
assert.deepStrictEqual(Trust.ratingLine(full), { text: '★ 10/10 on Checkatrade · 79 reviews', url: 'https://www.checkatrade.com/trades/x' });
assert.strictEqual(Trust.ratingLine({ rating: '10', count: '' }), null);
assert.strictEqual(Trust.ratingLine({ rating: '', count: '79' }), null);
assert.strictEqual(Trust.ratingLine(undefined), null);
// Only http(s) links are used.
assert.strictEqual(Trust.ratingLine({ rating: '10', count: '79', url: 'javascript:alert(1)' }).url, '');

// One quote, chosen by the random source; never out of range.
assert.strictEqual(Trust.pickQuote(full, function () { return 0; }).text, 'Tidy job');
assert.strictEqual(Trust.pickQuote(full, function () { return 0.99; }).text, 'Lovely door');
assert.strictEqual(Trust.pickQuote(full, function () { return 1; }).text, 'Lovely door');
assert.strictEqual(Trust.pickQuote({ quotes: [] }), null);
assert.strictEqual(Trust.pickQuote(undefined), null);
assert.strictEqual(Trust.pickQuote({ quotes: [null, { text: '' }, { text: 'Good', by: '' }] }, function () { return 0; }).text, 'Good');
assert.strictEqual(Trust.pickQuote({ quotes: [null, { text: '' }] }), null);

// Full render: linked rating, quote with attribution, heading, three benefits.
var c = node('div');
Trust.render(c, full, function () { return 0; });
var rating = find(c, 'hd-dd__trust-rating');
assert.strictEqual(rating.tag, 'a');
assert.strictEqual(rating.href, 'https://www.checkatrade.com/trades/x');
assert.strictEqual(rating.rel, 'noopener');
assert.ok(text(find(c, 'hd-dd__trust-quote')).indexOf('Tidy job') !== -1);
assert.ok(text(find(c, 'hd-dd__trust-quote')).indexOf('Jo, Hitchin') !== -1);
assert.strictEqual(find(c, 'hd-dd__trust-heading').textContent, 'Save this design and get your price');
assert.strictEqual(find(c, 'hd-dd__trust-benefits').children.length, 3);

// A quote with no attribution shows no attribution line.
c = node('div');
Trust.render(c, full, function () { return 0.99; });
assert.strictEqual(find(c, 'hd-dd__trust-quote').children.length, 1);

// No link → the rating is plain text, not a link.
c = node('div');
Trust.render(c, { rating: '10', count: '79', url: '', quotes: [] });
assert.strictEqual(find(c, 'hd-dd__trust-rating').tag, 'div');
assert.strictEqual(find(c, 'hd-dd__trust-quote'), null);

// Nothing configured (or no config at all): the benefits still render, and nothing else.
[undefined, {}, { rating: '', count: '', url: '', quotes: [] }].forEach(function (t) {
  var box = node('div');
  Trust.render(box, t);
  assert.strictEqual(find(box, 'hd-dd__trust-rating'), null);
  assert.strictEqual(find(box, 'hd-dd__trust-quote'), null);
  assert.strictEqual(find(box, 'hd-dd__trust-benefits').children.length, 3);
});

// ---- Save bar above the door picture (a second, earlier save button) --------------------
var pressed = 0;
c = node('div');
var bar = Trust.renderSaveBar(c, full, function () { pressed++; });
assert.strictEqual(c.children.length, 1);
assert.strictEqual(bar.className, 'hd-dd__savebar');
assert.strictEqual(find(c, 'hd-dd__savebar-heading').textContent, 'Your door is ready');
var topBtn = find(c, 'hd-dd__savebar-btn');
// Same words as the button at the foot of the step: one action, one label.
assert.strictEqual(topBtn.textContent, Trust.COPY.cta);
assert.strictEqual(topBtn.tag, 'button');
assert.strictEqual(topBtn.type, 'button');
topBtn.listeners.click();
assert.strictEqual(pressed, 1);
// Proof and reassurance sit right under the button.
assert.strictEqual(find(c, 'hd-dd__savebar-note').textContent, '★ 10/10 on Checkatrade · Free, no obligation');
// No rating configured (or no config at all): the reassurance stands alone.
[undefined, {}, { rating: '10', count: '' }].forEach(function (t) {
  var box = node('div');
  Trust.renderSaveBar(box, t, function () {});
  assert.strictEqual(find(box, 'hd-dd__savebar-note').textContent, 'Free, no obligation');
});

assert.strictEqual(Trust.COPY.cta, 'Save my design & get my price');

console.log('trust.test.js: all assertions passed');
