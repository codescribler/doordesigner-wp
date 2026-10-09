// Review-step social proof: the rating line and one real customer quote. `node tests/js/trust.test.js`
var assert = require('assert');

function node(tag) {
  return {
    tag: tag, className: '', textContent: '', children: [], attrs: {},
    appendChild: function (c) { this.children.push(c); return c; },
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

var full = { rating: '10', count: '79', url: 'https://www.checkatrade.com/trades/x', quotes: [{ text: 'Tidy job', by: 'Checkatrade review, Hitchin' }, { text: 'Lovely door', by: '' }] };

// Rating line needs both a rating and a count; only http(s) links are used.
assert.deepStrictEqual(Trust.ratingLine(full), { text: '★ 10/10 on Checkatrade · 79 reviews', url: 'https://www.checkatrade.com/trades/x' });
assert.strictEqual(Trust.ratingLine({ rating: '10', count: '' }), null);
assert.strictEqual(Trust.ratingLine({ rating: '', count: '79' }), null);
assert.strictEqual(Trust.ratingLine(undefined), null);
assert.strictEqual(Trust.ratingLine({ rating: '10', count: '79', url: 'javascript:alert(1)' }).url, '');

// One quote, chosen by the random source; never out of range; junk entries skipped.
assert.strictEqual(Trust.pickQuote(full, function () { return 0; }).text, 'Tidy job');
assert.strictEqual(Trust.pickQuote(full, function () { return 1; }).text, 'Lovely door');
assert.strictEqual(Trust.pickQuote({ quotes: [] }), null);
assert.strictEqual(Trust.pickQuote(undefined), null);
assert.strictEqual(Trust.pickQuote({ quotes: [null, { text: '' }, { text: 'Good', by: '' }] }, function () { return 0; }).text, 'Good');

// Proof block: linked rating and a quote with its attribution — and nothing else.
var c = node('div');
var box = Trust.renderProof(c, full, function () { return 0; });
assert.strictEqual(box.className, 'hd-dd__trust');
var rating = find(c, 'hd-dd__trust-rating');
assert.strictEqual(rating.tag, 'a');
assert.strictEqual(rating.href, 'https://www.checkatrade.com/trades/x');
assert.strictEqual(rating.rel, 'noopener');
assert.ok(text(find(c, 'hd-dd__trust-quote')).indexOf('Tidy job') !== -1);
assert.ok(text(find(c, 'hd-dd__trust-quote')).indexOf('Checkatrade review, Hitchin') !== -1);
assert.strictEqual(find(c, 'hd-dd__trust-benefits'), null, 'the old benefits list is gone');

// No attribution: no attribution line. No link: plain text.
c = node('div');
Trust.renderProof(c, full, function () { return 0.99; });
assert.strictEqual(find(c, 'hd-dd__trust-quote').children.length, 1);
c = node('div');
Trust.renderProof(c, { rating: '10', count: '79', url: '', quotes: [] });
assert.strictEqual(find(c, 'hd-dd__trust-rating').tag, 'div');
assert.strictEqual(find(c, 'hd-dd__trust-quote'), null);

// Nothing configured: nothing is added to the page at all.
[undefined, {}, { rating: '', count: '', url: '', quotes: [] }].forEach(function (t) {
  var b = node('div');
  assert.strictEqual(Trust.renderProof(b, t), null);
  assert.strictEqual(b.children.length, 0);
});

assert.strictEqual(Trust.render, undefined, 'the benefits block is retired');
assert.strictEqual(Trust.renderSaveBar, undefined, 'the top save bar is retired');

console.log('trust.test.js: all assertions passed');
