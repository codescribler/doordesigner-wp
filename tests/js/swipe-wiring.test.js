// Source-level checks that the swipe screens carry the helpers. `node tests/js/swipe-wiring.test.js`
var assert = require('assert');
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); }
var view = read('assets/js/swipe/swipe-view.js');
var app = read('assets/js/swipe/swipe-app.js');
var css = read('assets/css/hd-swipe.css');
var assets = read('includes/class-hd-assets.php');

assert.ok(view.indexOf("'Choose this door: '") !== -1, 'showcase button names the action');
assert.ok(view.indexOf('Happy with this one? Tap Choose.') !== -1, 'prompt above the button');
assert.ok(view.indexOf('window.HD_DD_SwipeHint.create(') !== -1, 'hint is created');
assert.ok(view.indexOf('onUser:') !== -1, 'carousels report user movement');
assert.ok(view.indexOf('hd_sw_nudged') === -1, 'the once-per-browser wobble is gone');
assert.ok(app.indexOf("this.funnel.step('browsed')") !== -1, 'browsed is reported');
assert.ok(/SwipeApp\.prototype\.browsed = function \(\) \{[^}]*this\.chosen/.test(app), 'browsed never fires after a design is chosen');
['.hd-sw-carousel__arrow', '.hd-sw-hint', '.hd-sw-prompt', '.hd-sw-cta.is-pulse'].forEach(function (s) {
  assert.ok(css.indexOf(s) !== -1, 'css has ' + s);
});
assert.ok(/\.hd-sw-cta \{[^}]*border-radius: 999px/.test(css), 'the action button is a pill on phones');
assert.ok(assets.indexOf("'swipehint'") !== -1, 'swipe-hint.js is registered');

assert.ok(/addEventListener\('animationend', function \(\) \{ cta\.classList\.remove\('is-pulse'\)/.test(view), 'the pulse class is removed when the animation ends');
assert.ok(/if \(!app\.pulsedMove && app\.screen === 'design'\)/.test(view), 'the move pulse is gated on the design screen');
assert.ok(/min-width: 820px\)[\s\S]*\.hd-sw-cta\.is-pulse \{ animation: none; \}/.test(css), 'no pulse ring on wider screens');

console.log('swipe-wiring.test.js: all assertions passed');
