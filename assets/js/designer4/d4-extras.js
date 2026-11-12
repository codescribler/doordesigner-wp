// assets/js/designer4/d4-extras.js
// What the phone review of 2026-11-12 added to Designer 4's controller, kept out of d4-app.js so
// that file stays short: the kept draft (d4-draft.js), the design effort sent with the lead
// (d4-effort.js), the phone's back button (d4-history.js), the popular-first style screen
// (d4-styles.js) and the toolbox changes (d4-toolbox.js). d4-app.js calls init() from its
// constructor and install() once on its prototype.
(function (W) {
	'use strict';

	function noop() {}

	// Per app: called from the constructor, before its first newDoor().
	function init(app, opts) {
		opts = opts || {};
		var Draft = W.HD_DD_D4Draft, Effort = W.HD_DD_D4Effort, Hist = W.HD_DD_D4History;
		app.draft = opts.draft !== undefined ? opts.draft : (Draft ? Draft.create() : null);
		app.effort = Effort ? Effort.create(opts.now ? { now: opts.now } : null) : null;
		app.history = (Hist && opts.history !== false) ? Hist.attach(app, opts.win || W) : { sync: noop };
		app.hiddenMoreGroups = { glass: 1 };    // the glass has its own row
		app.dotTo = { glass: ['glass'] };       // and its label on the door opens that row
		app.resumed = false;                    // the door on screen came back from the kept draft
		app.allStyles = false;                  // "See all styles" was pressed
		// Time away from the page is not time spent on the door.
		var doc = W.document;
		if (doc && doc.addEventListener && app.effort) {
			doc.addEventListener('visibilitychange', function () {
				if (doc.hidden) { app.effort.leave(); } else if (app.screen === 'door') { app.effort.enter(); }
			});
		}
	}

	function install(App) {
		var P = App.prototype;
		var base = { go: P.go, pick: P.pick, newDoor: P.newDoor, onLead: P.onLead, opened: P.opened };
		function keep(app) { if (W.HD_DD_D4Draft) { try { W.HD_DD_D4Draft.keep(app); } catch (e) { /* the draft is a nicety */ } } }

		P.toolRows = function (rows) { return W.HD_DD_D4Toolbox ? W.HD_DD_D4Toolbox.rows(this, rows) : rows; };
		P.sectionFor = function (key, h) { return W.HD_DD_D4Toolbox ? W.HD_DD_D4Toolbox.section(this, key, h) : null; };
		P.styleScreen = function (shell) {
			if (!W.HD_DD_D4Styles) { return false; }
			W.HD_DD_D4Styles.render(this, shell);
			return true;
		};
		// The glass row reports as "more", where the glass has always sat in the funnel.
		P.opened = function (section) { return base.opened.call(this, section === 'glass' ? 'more' : section); };
		P.onToolbox = function (key, isSheet) {
			if (this.effort) { this.effort.touch(); }
			if (this.doorView && this.doorView.zoom) { this.doorView.zoom(key, isSheet); }
			// The strip of tabs is rebuilt on every draw: keep the open tab in view, in the middle.
			var sh = this.shell, tab = key && sh && sh.querySelector ? sh.querySelector('[data-k="tab:' + key + '"]') : null;
			var strip = tab && tab.parentNode;
			if (strip && strip.clientWidth) { strip.scrollLeft = Math.max(0, tab.offsetLeft - strip.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2); }
		};

		P.newDoor = function () {
			base.newDoor.call(this);
			if (this.effort) { this.effort.reset(); }
			this.resumed = false;
		};

		P.pick = function (section, heading, label) {
			var ok = base.pick.call(this, section, heading, label);
			if (ok) {
				if (this.effort) { this.effort.change(section); }
				if (this.resumed) { this.resumed = false; if (this.doorView && this.doorView.refresh) { this.doorView.refresh(); } }
				keep(this);
			}
			return ok;
		};

		P.go = function (screen) {
			var r = base.go.call(this, screen);
			if (this.effort) { if (this.screen === 'door') { this.effort.enter(); } else { this.effort.leave(); } }
			if (this.screen === 'door') { keep(this); }
			if (this.history) { this.history.sync(); }
			return r;
		};

		P.onLead = function (body) {
			if (body && !body.preview && this.draft) { this.draft.clear(); }
			this.resumed = false;
			return base.onLead.call(this, body);
		};

		// boot.js: bring back the door this browser was part-way through. False when there is none.
		P.resume = function () {
			try { return !!(W.HD_DD_D4Draft && W.HD_DD_D4Draft.resume(this)); } catch (e) { return false; }
		};
	}

	W.HD_DD_D4Extras = { init: init, install: install };
})(typeof window !== 'undefined' ? window : this);
