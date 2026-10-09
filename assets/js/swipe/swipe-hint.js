// assets/js/swipe/swipe-hint.js
// A pill over the first carousel that says the doors can be swiped. It goes the moment the
// visitor moves the carousel; if they have not after a few seconds, onIdle lets the caller
// wobble the cards while the pill stays.
//
//   var hint = HD_DD_SwipeHint.create(holder, { touch: true, onIdle: function () { carousel.nudge(); } });
//   hint.dismiss();
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_SwipeHint = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var DELAY = 4000;

	function text(touch) { return touch ? 'Swipe to see more doors' : 'Use the arrows to see more'; }

	function create(container, o) {
		o = o || {};
		var timers = o.timers || {
			set: function (fn, ms) { return setTimeout(fn, ms); },
			clear: function (id) { clearTimeout(id); }
		};
		var pill = document.createElement('div');
		pill.className = 'hd-sw-hint';
		pill.setAttribute('aria-hidden', 'true'); // the helper line above the carousel says the same
		var hand = document.createElement('span');
		hand.className = 'hd-sw-hint__hand';
		hand.textContent = '☞';
		var label = document.createElement('span');
		label.className = 'hd-sw-hint__text';
		label.textContent = text(!!o.touch);
		pill.appendChild(hand);
		pill.appendChild(label);
		container.appendChild(pill);

		var gone = false;
		var timer = timers.set(function () {
			timer = null;
			if (!gone && o.onIdle) { o.onIdle(); }
		}, o.delay == null ? DELAY : o.delay);

		function dismiss() {
			if (gone) { return; }
			gone = true;
			if (timer != null) { timers.clear(timer); timer = null; }
			if (pill.parentNode) { pill.parentNode.removeChild(pill); }
		}

		return { el: pill, dismiss: dismiss, dismissed: function () { return gone; } };
	}

	return { create: create, text: text };
}));
