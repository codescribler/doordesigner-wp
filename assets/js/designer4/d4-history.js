// assets/js/designer4/d4-history.js
// The phone's own back button steps back inside the designer instead of leaving the page (and the
// door) behind. While the visitor is past the first screen one extra history entry is kept; when
// Back takes it, the designer goes back a step (or closes the open options sheet) and, if there
// is still somewhere to go back to, the entry is put back. On the first screen Back leaves the
// page as usual. The address never changes.
//
//   HD_DD_D4History.attach(app, win) -> { sync(), detach() }   sync() after every app.go()
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_D4History = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var DEEP = { style: 1, door: 1, doorway: 1, details: 1 };   // screens with a step to go back to

	function attach(app, win) {
		var h = win && win.history;
		if (!h || typeof h.pushState !== 'function' || !win.addEventListener) { return { sync: function () {}, detach: function () {} }; }
		var armed = false;

		function arm() {
			if (armed || !DEEP[app.screen]) { return; }
			try { h.pushState({ hdD4: 1 }, ''); armed = true; } catch (e) { /* history unavailable: Back leaves the page */ }
		}
		function onPop(e) {
			if (e && e.state && e.state.hdD4) { armed = true; return; }   // Forward, back onto our entry
			if (!armed) { return; }
			armed = false;
			var tb = app.screen === 'door' ? app.toolbox : null;
			if (tb && tb.openKey && tb.openKey()) { tb.close(); arm(); return; }
			if (DEEP[app.screen]) { app.back(); }   // go() calls sync(), which re-arms while still deep
		}
		win.addEventListener('popstate', onPop);
		return {
			sync: arm,
			detach: function () { win.removeEventListener('popstate', onPop); }
		};
	}

	return { attach: attach };
}));
