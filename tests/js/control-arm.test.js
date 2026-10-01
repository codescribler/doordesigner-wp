// The classic flow is the control in the Classic vs Swipe A/B test, so it must stay the
// ORIGINAL designer: its own Review step and the original "Get your free quote" form.
// New Review-step work belongs to the swipe flow. `node tests/js/control-arm.test.js`
var assert = require('assert');
var fs = require('fs');
var path = require('path');

function read(rel) { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); }
var classic = read('assets/js/hd-door-designer.js');
var review = read('assets/js/wizard/review.js');
var quote = read('assets/js/enquiry-quote.js');
var swipe = read('assets/js/swipe/swipe-view.js');

// Classic Review step: the original button and note, none of the save-form additions.
assert.ok(review.indexOf("'Get my free quote'") !== -1, 'classic Review keeps its original button');
assert.ok(review.indexOf('Free, no-obligation quote') !== -1, 'classic Review keeps its original note');
['HD_DD_Trust', 'renderTrust', 'savebar', 'savebox', 'Save my design'].forEach(function (s) {
  assert.ok(review.indexOf(s) === -1, 'classic review.js has no "' + s + '"');
  assert.ok(classic.indexOf(s) === -1, 'classic hd-door-designer.js has no "' + s + '"');
});

// Classic uses the original quote form, not the swipe flow's save form.
assert.ok(classic.indexOf('window.HD_DD_QuoteEnquiry.create(') !== -1, 'classic uses the original quote form');
assert.ok(classic.indexOf('window.HD_DD_Enquiry.') === -1, 'classic does not use the save form');

// The original form: four required fields, a consent tick, and the marker that makes the
// server apply the original rules.
['Telephone', "name: 'consent'", "cb.type = 'checkbox'", 'Send my free quote request', "form: 'quote'"].forEach(function (s) {
  assert.ok(quote.replace(/cb\.name = 'consent'/, "name: 'consent'").indexOf(s) !== -1, 'original quote form has ' + s);
});
assert.ok(quote.indexOf('designName') === -1, 'the original form has no design-name field');

// And the swipe flow is the one carrying the new work.
['HD_DD_Trust.render(', 'HD_DD_Trust.renderSaveBar(', 'window.HD_DD_Enquiry.create('].forEach(function (s) {
  assert.ok(swipe.indexOf(s) !== -1, 'swipe flow has ' + s);
});

console.log('control-arm.test.js: all assertions passed');
