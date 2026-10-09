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

// ---- Review screen: reveal, summary, price, proof, two-step form ------------------------
assert.ok(view.indexOf('window.HD_DD_ReviewSave.create(') !== -1, 'Review uses the two-step form');
assert.ok(view.indexOf('P.reviewSummary(') !== -1, 'one-line summary');
assert.ok(view.indexOf('See all options / edit') !== -1, 'the full list is one tap away');
assert.ok(view.indexOf('guidePrice') !== -1, 'guide price is shown');
assert.ok(view.indexOf('HD_DD_Trust.renderProof(') !== -1, 'rating and quote');
assert.ok(view.indexOf('renderSaveBar') === -1 && view.indexOf('savebar') === -1, 'no button above the door');
assert.ok(view.indexOf("'Email me my design'") !== -1, 'floating button on phones');
assert.ok(view.indexOf("app.funnel.step('saved')") !== -1, 'saved is reported');
assert.ok(view.indexOf('app.funnel.lead()') !== -1, 'the quote request is the lead');
assert.ok(app.indexOf("'form'") === -1 && app.indexOf("'details'") === -1, 'the separate form screen is gone');
assert.ok(app.indexOf('self.savedToken = token') !== -1, 'a returning saver goes straight to step 2');
assert.ok(css.indexOf('.hd-sw-summary') !== -1 && css.indexOf('.hd-sw-price') !== -1 && css.indexOf('.hd-sw-savebox') !== -1, 'review styles');
assert.ok(css.indexOf('hd-dd__savebar') === -1, 'the save bar styles are removed');
assert.ok(assets.indexOf("'-reviewsave'") !== -1, 'review-save.js is registered');

console.log('swipe-wiring.test.js: all assertions passed');
