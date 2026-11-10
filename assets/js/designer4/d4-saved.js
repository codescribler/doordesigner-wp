// assets/js/designer4/d4-saved.js
// Opening a stored Designer 4 door (d4-app.js delegates its entry points here).
//
//   HD_DD_D4Saved.loadSaved(app, token, screen)  one of this visitor's doors (My designs): the door
//       as saved, the ask "sent", autosave live. screen: 'door' (default) or 'doorway'.
//   HD_DD_D4Saved.loadCopy(app, token)           a bare ?design=TOKEN link: the door as a copy to
//       look at (app.copy): no session token, no saved token, no autosave, the ordinary email box.
//   HD_DD_D4Saved.openListed(app, token, screen) the list check loadSaved ends with.
(function (W) {
	'use strict';

	function trim(s) { return String(s == null ? '' : s).trim(); }
	function prefsFrom(map) { var out = {}; Object.keys(map || {}).forEach(function (h) { out[h] = [map[h]]; }); return out; }

	// Nothing of a door open before carries over (My designs opens one door after another).
	function reset(app) {
		// A late update from the previous door's saver must never send this door under its token.
		if (app._saver && app._saver.setToken) { app._saver.setToken(null); }
		app._saver = null; app._token = null; app.savedKind = null;
		app.mine = {}; app.auto = {};
		app.newDoor();
		app.freshDoor = false;
		app.previewDue = false;
		app.reopened = true;     // no "we've got your door" line for it (d4-doorway-screen.js)
	}

	// Fetch the stored design and build it. Resolves 'built', 'style' (type only) or 'failed'.
	function build(app, token) {
		return Promise.resolve(app.api('design/' + encodeURIComponent(token), { method: 'GET' })).then(function (res) {
			var saved = res && res.ok && res.body && res.body.design;
			var t = saved && saved['Door Type'] && saved['Door Type'].label;
			var s = saved && saved['Door Design'] && saved['Door Design'].label;
			if (!t || !app.cv.byType[t]) { return 'failed'; }
			app.wiz.selectType(t);
			if (!s || !app.build(s, prefsFrom(saved))) { return 'style'; }
			var defs = app.defaultsFor(s);
			Object.keys(saved).forEach(function (h) { if (h !== 'Door Type' && h !== 'Door Design' && !(defs[h] != null && trim(defs[h]) === trim(saved[h].label))) { app.mine[h] = saved[h].label; } });
			return 'built';
		});
	}

	function loading(app) {
		if (W.HD_DD_D3Screens && W.HD_DD_D3Screens.loading) { W.HD_DD_D3Screens.loading(app); }
	}

	// Mirrors Designer 3's loadSaved. The door as saved (it always has a handle), the ask "sent". A
	// door removed, or whose deal is closed, opens My designs (the list omits removed doors).
	function loadSaved(app, token, screen) {
		var fromDesigns = app.screen === 'designs';
		reset(app);
		// A door that can't be opened from My designs goes back there with a line saying so.
		function failed() { if (fromDesigns) { app.openFailed = true; app.go('designs'); } else { app.render(); } }
		loading(app);
		return build(app, token).then(function (r) {
			if (r === 'failed') { failed(); return; }
			if (r === 'style') { app.go('style'); return; }
			if (app.store) { app.store.addToken(token); }
			return openListed(app, token, screen);
		}).catch(failed);
	}

	// A bare ?design=TOKEN link (wp-admin's "Open in designer", the manager's designUrl, a shared
	// link): the door as a COPY to look at. The token is not added to the session and nothing is
	// saved under it; the ask is the ordinary email box, so an email sent from here is a new door.
	// Removed or closed doors open the same way (there is nothing to protect in a copy). A design
	// that cannot be loaded falls back to the type screen.
	function loadCopy(app, token) {
		reset(app);
		app.copy = true;
		loading(app);
		function failed() { app.copy = false; app.render(); }
		return build(app, token).then(function (r) {
			if (r === 'failed') { failed(); return; }
			app.go(r === 'style' ? 'style' : 'door');
		}).catch(failed);
	}

	function openListed(app, token, screen) {
		function open(res) {
			var body = res && res.ok && res.body;
			if (body && body.missing) { app.missing = body.missing; }
			var doors = body && Array.isArray(body.doors) ? body.doors : null;
			var door = doors ? doors.filter(function (d) { return d && d.token === token; })[0] : null;
			if (doors && (!door || door.status === 'closed')) { app.go('designs'); return; }
			app.savedToken = token;   // the ask shows "saved" and changes save through update()
			if (door && door.frame && W.HD_DD_D4Steps) { W.HD_DD_D4Steps.state(app).answered = true; }   // its doorway is on record
			// A type with no side or top lights has no doorway to answer: the door instead.
			var doorway = screen === 'doorway' && !(door && door.doorway === false) && app.doorwayOffered();
			app.go(doorway ? 'doorway' : 'door');
		}
		if (!app.store || !app.store.list) { open(null); return Promise.resolve(); }
		return Promise.resolve(app.store.list()).then(open, function () { open(null); });
	}

	W.HD_DD_D4Saved = { loadSaved: loadSaved, loadCopy: loadCopy, openListed: openListed };
})(typeof window !== 'undefined' ? window : this);
