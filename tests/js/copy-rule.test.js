// Copy rule: nothing the customer reads may promise that we won't phone, and the Review
// step's wording is the agreed wording. `node tests/js/copy-rule.test.js`
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..', '..');
function files(dir, ext) {
  var out = [];
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(function (e) {
    var rel = dir + '/' + e.name;
    if (e.isDirectory()) { out = out.concat(files(rel, ext)); }
    else if (e.name.slice(-ext.length) === ext) { out.push(rel); }
  });
  return out;
}

var BANNED = [
  /\bno\s+(phone\s+|sales\s+|cold\s+)?calls?\b/i,
  /\b(won[’']?t|will not|never|don[’']?t)\s+(call|phone|ring)\b/i,
  /\bwon[’']?t\s+(ever\s+)?(be\s+)?(call|calling|phone|phoning|ring|ringing)\b/i,
  /\bonly\s+(call|phone|ring)\s+(you|if)\b/i
];
var sources = files('assets/js', '.js').concat(files('includes', '.php'));
assert.ok(sources.length > 20, 'found the source files');
sources.forEach(function (rel) {
  fs.readFileSync(path.join(root, rel), 'utf8').split('\n').forEach(function (line, i) {
    BANNED.forEach(function (re) {
      assert.ok(!re.test(line), rel + ':' + (i + 1) + ' promises not to call: ' + line.trim());
    });
  });
});

// The agreed wording is in place, and the old quote wording is gone from the Review step.
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
var review = read('assets/js/wizard/review.js');
var swipe = read('assets/js/swipe/swipe-view.js');
var enquiry = read('assets/js/enquiry.js');
[review, swipe].forEach(function (src) {
  assert.ok(src.indexOf('Get my free quote') === -1, 'old CTA removed');
});
assert.ok(review.indexOf('ctx.renderTrust(') !== -1, 'wizard Review step draws the trust block');
assert.ok(swipe.indexOf('HD_DD_Trust.render(') !== -1, 'swipe Review step draws the trust block');
assert.ok(enquiry.indexOf('only used to prepare') === -1, 'no line contradicting the consent line');
assert.ok(enquiry.indexOf('By saving you’re asking us for a price. We’ll use your details to send it and may get in touch about your door.') !== -1, 'consent line verbatim');
assert.ok(enquiry.indexOf("'consent'") === -1 && enquiry.indexOf('hd-dd__consent') === -1, 'no consent tick left in the form');
assert.strictEqual(require('../../assets/js/trust.js').COPY.benefits[2], 'No pressure and no obligation. You decide what happens next.');

console.log('copy-rule.test.js: all assertions passed');
