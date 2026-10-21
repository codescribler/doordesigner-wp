// Source-level checks for the Designer 3 boot wiring. `node tests/js/designer3-wiring.test.js`
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var boot = fs.readFileSync(path.join(__dirname, '..', '..', 'assets/js/boot.js'), 'utf8');
['\'door-designer-v4\'', 'F.ORDER_V4', 'canRunDesigner3(window, rm)', 'HD_DD_Designer3App'].forEach(function (s) {
  assert.ok(boot.indexOf(s) !== -1, 'boot.js contains ' + s);
});
console.log('designer3-wiring ok');
