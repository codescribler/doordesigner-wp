// SwipeApp.go(): where the page scrolls after a screen change, and in what order.
// Landing on Review from the email's "Get my exact price" link must end at the price form, not the top.
// `node tests/js/swipe-go.test.js`
var assert = require('assert');
global.window = { HD_DD_CONFIG: {}, HD_DD_StepConfig: {}, HD_DD_FlowSteps: {}, HD_DD_DesignIndex: {}, HD_DD_Shared: {} };
require('../../assets/js/swipe/swipe-app.js');
var SwipeApp = window.HD_DD_SwipeApp;

function fake(focus) {
  var log = [];
  var f = {
    focusSave: focus,
    screen: null,
    root: { scrollIntoView: function () { log.push('top'); } },
    funnel: { step: function () {} },
    view: { scrollToSave: function () { log.push('form'); } },
    currentScreen: function () { return null; },
    track: function () {},
    render: function () { log.push('render'); }
  };
  f.log = log;
  return f;
}

var a = fake(true);
SwipeApp.prototype.go.call(a, 'review');
assert.deepStrictEqual(a.log, ['render', 'form'], 'price landing: render, then the form; never the top');
assert.strictEqual(a.focusSave, false, 'the flag is spent');

var b = fake(false);
SwipeApp.prototype.go.call(b, 'review');
assert.deepStrictEqual(b.log, ['render', 'top'], 'plain Review: scroll to the top');

var c = fake(true);
SwipeApp.prototype.go.call(c, 'glass');
assert.deepStrictEqual(c.log, ['render', 'top'], 'another screen still scrolls to the top');
assert.strictEqual(c.focusSave, false);

console.log('swipe-go.test.js: all assertions passed');
