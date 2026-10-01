// The save form's field set, default design name and POST body. `node tests/js/enquiry-form.test.js`
var assert = require('assert');
var Enquiry = require('../../assets/js/enquiry.js');

// Field order and which are required: phone is last and optional; there is no consent field.
assert.deepStrictEqual(Enquiry.FIELDS.map(function (f) { return f.name; }), ['designName', 'name', 'email', 'postcode', 'telephone']);
assert.deepStrictEqual(Enquiry.FIELDS.filter(function (f) { return !f.required; }).map(function (f) { return f.name; }), ['telephone']);
assert.strictEqual(Enquiry.FIELDS[0].maxLength, 80);
assert.strictEqual(Enquiry.FIELDS[4].label, 'Phone (optional)');

// Default design name: "<design> in <outside colour>", trimmed (Endurance labels carry trailing spaces).
assert.strictEqual(Enquiry.defaultDesignName({ 'Door Design': { label: 'Ketu' }, 'Door Colour (External)': { label: 'Anthracite Grey ' } }), 'Ketu in Anthracite Grey');
assert.strictEqual(Enquiry.defaultDesignName({ 'Door Style': { label: 'Avantal 1' }, 'Door Colour': { label: 'Black' } }), 'Avantal 1 in Black');
assert.strictEqual(Enquiry.defaultDesignName({ 'Door Design': { label: 'Ketu' } }), 'Ketu');
assert.strictEqual(Enquiry.defaultDesignName({}), 'My door');
assert.strictEqual(Enquiry.defaultDesignName(null), 'My door');
// A long default is cut to the field's limit.
assert.strictEqual(Enquiry.defaultDesignName({ 'Door Design': { label: new Array(101).join('x') } }).length, 80);

// POST body: UI-only "_" keys are stripped from the design; no consent; phone may be empty.
var body = Enquiry.buildData(
  { designName: ' Front door option 1 ', name: 'Sam', email: 'sam@example.com', postcode: 'AL1 1AA', telephone: '', hd_hp: '' },
  { 'Door Design': { label: 'Ketu', id: 12 }, _styleCategory: 'Glazed' },
  'https://example.test/door-designer/'
);
assert.deepStrictEqual(Object.keys(body).sort(), ['design', 'designName', 'email', 'hd_hp', 'name', 'pageUrl', 'postcode', 'telephone']);
assert.strictEqual(body.designName, 'Front door option 1');
assert.strictEqual(body.telephone, '');
assert.strictEqual(body.design._styleCategory, undefined);
assert.strictEqual(body.design['Door Design'].id, 12);
assert.strictEqual(body.pageUrl, 'https://example.test/door-designer/');

console.log('enquiry-form.test.js: all assertions passed');
