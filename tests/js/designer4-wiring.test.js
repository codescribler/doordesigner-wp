// Designer 4 boot wiring. `node tests/js/designer4-wiring.test.js`
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var boot = fs.readFileSync(path.join(__dirname, '..', '..', 'assets/js/boot.js'), 'utf8');
['\'door-designer-v5\'', 'F.ORDER_V5', 'canRunDesigner4(window, rm)', 'HD_DD_Designer4App', 'loadDesigns(', 'loadSaved(', 'Designer 4 unavailable, showing Classic'].forEach(function (s) {
  assert.ok(boot.indexOf(s) !== -1, 'boot.js contains ' + s);
});

var X = require('../../assets/js/experiment.js');
assert.strictEqual(X.storedFlow({ flow: 'designer4' }, { designer4: true }), 'designer4');
assert.strictEqual(X.storedFlow({ flow: 'designer4' }, { designer4: false }), 'classic');
assert.strictEqual(X.storedFlow({ flow: 'designer4' }, { swipe2: true, designer3: true }), 'classic');
assert.strictEqual(X.storedFlow({ flow: 'designer3' }, { designer3: true }), 'designer3');
assert.strictEqual(X.storedFlow({ flow: 'designer3' }, { designer3: false }), 'classic');
assert.strictEqual(X.storedFlow({ flow: 'swipe2' }, true), 'swipe2');
assert.strictEqual(X.storedFlow({}, {}), '');
assert.strictEqual(X.forcedFlow('?flow=designer4', null, null), 'designer4');
assert.strictEqual(X.forcedFlow('?flow=designer3', null, null), 'designer3');
assert.strictEqual(X.forcedFlow('?flow=nope', null, null), '');

// Capability: every module present, plus the Designer 3 needs and the render model.
var D3 = ['HD_DD_Designer3App', 'HD_DD_Preview', 'HD_DD_D3AfterSave', 'HD_DD_D3Save', 'HD_DD_D3Toolbox', 'HD_DD_D3FrameStep'];
var D4 = ['HD_DD_Designer4App', 'HD_DD_D4Handle', 'HD_DD_D4Doorway', 'HD_DD_D4Store', 'HD_DD_D4Ask', 'HD_DD_D4Door', 'HD_DD_D4SideGlass', 'HD_DD_D4DoorwayScreen', 'HD_DD_D4Steps', 'HD_DD_D4MyDesigns'];
var win = {};
D3.concat(D4).forEach(function (k) { win[k] = {}; });
assert.strictEqual(X.canRunDesigner4(win, {}), true);
assert.strictEqual(X.canRunDesigner4(win, null), false);
assert.strictEqual(X.canRunDesigner4(null, {}), false);
D3.concat(D4).forEach(function (k) {
  var w = Object.assign({}, win); delete w[k];
  assert.strictEqual(X.canRunDesigner4(w, {}), false, 'missing ' + k);
});
assert.strictEqual(X.canRunDesigner3(win, {}), true);

// With every module loaded (My designs still a shell), the app is defined and
// Designer 4 can run. Each module defines the global experiment.js checks for.
var files = ['d4-handle', 'd4-doorway', 'd4-store', 'd4-ask', 'd4-door', 'd4-sideglass', 'd4-doorway-screen', 'd4-steps', 'd4-mydesigns', 'd4-app'];
var UMD = { 'd4-handle': 'HD_DD_D4Handle', 'd4-doorway': 'HD_DD_D4Doorway', 'd4-store': 'HD_DD_D4Store', 'd4-ask': 'HD_DD_D4Ask' };
global.window = { HD_DD_Preview: {}, HD_DD_Designer3App: function () {}, HD_DD_D3AfterSave: {}, HD_DD_D3Save: {}, HD_DD_D3Toolbox: {}, HD_DD_D3FrameStep: {} };
files.forEach(function (f) {
  var file = path.join(__dirname, '..', '..', 'assets/js/designer4', f + '.js');
  assert.ok(fs.existsSync(file), f + '.js exists');
  var m = require(file);
  if (UMD[f]) { global.window[UMD[f]] = m; }   // in Node a UMD module exports instead of setting window
  var shell = global.window[{ 'd4-mydesigns': 'HD_DD_D4MyDesigns' }[f]];
  if (f === 'd4-mydesigns') { assert.deepStrictEqual(Object.keys(shell || { x: 1 }), [], f + ' is an empty shell'); }
});
assert.strictEqual(typeof global.window.HD_DD_D4Door.door, 'function', 'd4-door defines the door screen');
assert.strictEqual(typeof global.window.HD_DD_D4SideGlass.rows, 'function', 'd4-sideglass defines the side glass rows');
assert.strictEqual(typeof global.window.HD_DD_D4DoorwayScreen.render, 'function', 'd4-doorway-screen defines the doorway screen');
['strip', 'doorway', 'details', 'done'].forEach(function (k) { assert.strictEqual(typeof global.window.HD_DD_D4Steps[k], 'function', 'd4-steps defines ' + k); });
assert.strictEqual(typeof global.window.HD_DD_Designer4App, 'function', 'd4-app defines the app');
assert.strictEqual(X.canRunDesigner4(global.window, {}), true, 'every Designer 4 global defined: it can run');
D4.forEach(function (k) {
  var w = Object.assign({}, global.window); delete w[k];
  assert.strictEqual(X.canRunDesigner4(w, {}), false, 'loaded, but missing ' + k);
});
console.log('designer4-wiring ok');
