// assets/js/designer4/d4-draft.js
// The door a visitor is part-way through, kept in this browser (localStorage, hd_dd_d4_draft) so a
// reload, a dropped tab or coming back later brings it back instead of starting again. Only a
// door that is not yet a lead is kept: once the email is sent the door lives on the server and
// the draft is cleared. Nothing here is sent anywhere.
//
//   var d = HD_DD_D4Draft.create({ storage?, now? });  d.save(snapshot); d.load(); d.clear();
//   HD_DD_D4Draft.keep(app)      store (or clear) the draft for the app's door as it is now
//   HD_DD_D4Draft.resume(app)    rebuild the kept door and open it; false when there is none
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
	else { root.HD_DD_D4Draft = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (W) {
	'use strict';

	var KEY = 'hd_dd_d4_draft';
	var MAX_AGE = 14 * 24 * 60 * 60 * 1000;   // a door left longer than two weeks starts fresh

	function defaultStorage() {
		try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (e) { return null; }
	}
	function trim(s) { return String(s == null ? '' : s).trim(); }

	function create(o) {
		o = o || {};
		var storage = o.storage === undefined ? defaultStorage() : o.storage;
		var now = o.now || function () { return Date.now(); };
		function clear() { try { storage.removeItem(KEY); } catch (e) { /* no storage */ } }
		return {
			save: function (snap) {
				if (!snap || !snap.type || !snap.style) { return false; }
				try { storage.setItem(KEY, JSON.stringify({ v: 1, at: now(), type: snap.type, style: snap.style, design: snap.design || {}, mine: snap.mine || {}, effort: snap.effort || null })); return true; }
				catch (e) { return false; }
			},
			load: function () {
				try {
					var d = JSON.parse(storage.getItem(KEY));
					if (!d || d.v !== 1 || !d.type || !d.style || typeof d.design !== 'object') { return null; }
					if (!(now() - Number(d.at) < MAX_AGE)) { clear(); return null; }
					return d;
				} catch (e) { return null; }
			},
			clear: clear
		};
	}

	// {heading: {label, id?}} of the door on screen, without anything else the wizard keeps on a choice.
	function designOf(app) {
		var out = {}, d = app.design();
		Object.keys(d).forEach(function (h) {
			if (!d[h] || d[h].label == null) { return; }
			out[h] = d[h].id != null ? { label: d[h].label, id: d[h].id } : { label: d[h].label };
		});
		return out;
	}

	function keep(app) {
		var draft = app.draft;
		if (!draft) { return; }
		// A lead, a door opened from My designs or a copy of someone's link is not a draft.
		if (app.savedToken) { draft.clear(); return; }
		if (app.reopened || app.copy || !app.style()) { return; }
		var mine = {};
		Object.keys(app.mine || {}).forEach(function (h) { mine[h] = app.mine[h]; });
		draft.save({ type: app.type(), style: app.style(), design: designOf(app), mine: mine, effort: app.effort ? app.effort.snapshot() : null });
	}

	function resume(app) {
		var d = app.draft ? app.draft.load() : null;
		if (!d || !app.cv.byType[d.type]) { return false; }
		if (app.doorType && app.doorType !== d.type) { return false; }   // a link to another door type wins
		var prefs = {};
		Object.keys(d.design).forEach(function (h) { prefs[h] = [d.design[h]]; });
		app.wiz.selectType(d.type);
		app.mine = {}; app.auto = {};
		if (!app.build(d.style, prefs)) { app.draft.clear(); app.wiz = W.HD_DD_Wizard ? W.HD_DD_Wizard.create(app.cv, W.HD_DD_StepConfig) : app.wiz; return false; }
		Object.keys(d.mine || {}).forEach(function (h) {
			var cur = app.design()[h];
			if (cur && trim(cur.label) === trim(d.mine[h])) { app.mine[h] = d.mine[h]; }
		});
		// The handle is only theirs if they picked it: a door left before that still has none.
		if (!app.mine.Handle && app.leaveHandleOff) { app.leaveHandleOff(); }
		app.freshDoor = false; app.previewDue = false;
		if (app.effort && d.effort) { app.effort.restore(d.effort); }
		app.resumed = true;
		app.go('door');
		return true;
	}

	return { create: create, keep: keep, resume: resume, KEY: KEY, MAX_AGE: MAX_AGE };
}));
