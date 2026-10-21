// assets/js/designer3/d3-app.js
// Designer 3's controller: state, navigation and analytics. Drawing lives in d3-screens.js
// (type, style and door screens), d3-toolbox.js and d3-save.js; the screens after saving are
// HD_DD_D3AfterSave's (Task 10) and show a placeholder until it is loaded.
//
// Journey: type -> style -> door (complete, pre-picked) -> saved -> frame -> quote / callback -> done.
// Choices are stored through the classic HD_DD_Wizard, so validity, pruning and the enquiry
// payload are exactly the classic flow's.
(function (W) {
	'use strict';

	var OPTS = { toplights: true };   // the same opts for the preview, the dots and the flip
	var SECTIONS = { colour: 1, handle: 1, letterplate: 1, knocker: 1, more: 1 };
	var LATER = ['saved', 'frame', 'quote', 'callback', 'done'];

	function noop() {}
	function trim(s) { return String(s == null ? '' : s).trim(); }

	function App(root, cv, rm, categories, opts) {
		opts = opts || {};
		var S = W.HD_DD_Shared;
		this.root = root;
		this.cv = (S && S.enrichCustomerView) ? S.enrichCustomerView(cv, rm) : cv;
		this.model = rm || null;
		this.categories = categories || null;
		this.api = opts.api;
		this.funnel = opts.funnel || { step: noop, lead: noop };
		this.experiment = opts.experiment || null;
		this.flow = opts.flow || 'designer3';
		this.doorType = opts.doorType && this.cv.byType[opts.doorType] ? opts.doorType : '';
		this.nudge = W.HD_DD_D3Nudge ? W.HD_DD_D3Nudge.create({ after: 3, storage: opts.storage }) : { change: function () { return false; }, dismiss: noop };
		this.wiz = W.HD_DD_Wizard.create(this.cv, W.HD_DD_StepConfig);
		this.screen = 'type';
		this.mine = {};          // headings the visitor picked in the toolbox (not the defaults)
		this.auto = {};          // furniture we swapped in after a finish change
		this.shown = false;      // `shown` fired this visit
		this.nudgeOn = false;    // the save prompt is on screen
		this.nudgeShown = 0;
		this.savedToken = null;  // the saved-design record this visit works on
		this.savedKind = null;   // kind of the row a saved link opened
		this.lastResult = null;
		this.doorView = null;    // the drawn door screen, refreshed in place on each change
		this._saver = null;
	}

	var P = App.prototype;
	P.OPTS = OPTS;
	P.cfg = function () { return W.HD_DD_CONFIG || {}; };
	P.assetBase = function () { return this.cfg().assetBase || (this.model && this.model._assetBase) || ''; };
	P.design = function () { return this.wiz.state().design; };
	P.type = function () { var d = this.design()['Door Type']; return d ? d.label : ''; };
	P.style = function () { var d = this.design()['Door Design']; return d ? d.label : ''; };
	P.node = function () { return this.cv.byType[this.type()] || null; };
	P.types = function () { var cv = this.cv; return (cv.types || Object.keys(cv.byType)).filter(function (t) { return !!cv.byType[t]; }); };
	P.styles = function () { var n = this.node(); return (n && n.fields['Door Design']) || []; };
	P.stepFor = function (heading) { return this.wiz.state().steps.filter(function (s) { return s.heading === heading; })[0] || null; };
	P.stepByKey = function (key) { return this.wiz.state().steps.filter(function (s) { return s.key === key; })[0] || null; };

	// The catalogue choice for a wanted {label, id?} on a step: by id when given (Frame Design
	// labels repeat), else by trimmed label.
	P.choiceFor = function (heading, want) {
		var step = this.stepFor(heading);
		var list = step ? step.choices : (heading === 'Door Design' ? this.styles() : null);
		if (!list || !want) { return null; }
		var w = typeof want === 'string' ? { label: want } : want;
		if (w.id != null) { var byId = list.filter(function (c) { return c.id === w.id && trim(c.label) === trim(w.label); })[0]; if (byId) { return byId; } }
		return list.filter(function (c) { return trim(c.label) === trim(w.label); })[0] || null;
	};

	P.defaultsFor = function (style) {
		var D = W.HD_DD_D3Defaults;
		return D ? D.resolve(this.node(), this.model, this.type(), style, this.cfg().d3Defaults || {}) : {};
	};

	// Build the door for a style from preferences {heading: [wanted, ...]} (first valid wins).
	// Rebuilt from the type up, so the wizard prunes anything the style doesn't offer.
	P.build = function (style, prefs) {
		this.wiz.selectType(this.type());
		var c = this.choiceFor('Door Design', style);
		if (!c) { return false; }
		this.wiz.select('Door Design', c);
		var tried = { 'Door Type': true, 'Door Design': true };
		for (var guard = 0; guard < 60; guard++) {
			var step = this.wiz.state().steps.filter(function (s) { return !tried[s.heading]; })[0];
			if (!step) { break; }
			tried[step.heading] = true;
			var list = prefs[step.heading] || [];
			for (var i = 0; i < list.length; i++) {
				var hit = this.choiceFor(step.heading, list[i]);
				if (hit) { this.wiz.select(step.heading, hit); break; }
			}
		}
		this.settle();
		return true;
	};

	// After any change: keep the handle/letterplate available in the finish (like-for-like,
	// and the visitor's own pick back when it is), then give every empty step a value, so the
	// door on screen is always complete.
	P.settle = function () {
		var self = this, S = W.HD_DD_Shared;
		if (S && this.model) {
			[['Handle', 'handle'], ['Letterplate', 'letterplate']].forEach(function (p) {
				var step = self.stepFor(p[0]);
				if (!step) { return; }
				var d = self.design();
				var cur = d[p[0]] ? d[p[0]].label : '';
				var bad = cur && S.disabledReason(self.model, self.type(), d, p[1], cur);
				var mine = self.mine[p[0]] || '';
				var pick = S.pickFurniture(self.model, self.type(), d, p[1], step.choices, bad ? '' : cur, bad ? cur : '', mine, self.auto[p[0]] || '');
				var c = pick && self.choiceFor(p[0], pick);
				if (!c) { return; }
				self.wiz.select(p[0], c);
				if (pick === mine) { delete self.auto[p[0]]; } else { self.auto[p[0]] = pick; }
			});
		}
		for (var guard = 0; guard < 20; guard++) {
			var d2 = this.design();
			var empty = this.wiz.state().steps.filter(function (s) { return !d2[s.heading] && s.choices.length; })[0];
			if (!empty) { break; }
			this.wiz.select(empty.heading, this.choiceFor(empty.heading, empty.defaultLabel) || empty.choices[0]);
		}
	};

	function prefsFrom(map) {
		var out = {};
		Object.keys(map || {}).forEach(function (h) { out[h] = [map[h]]; });
		return out;
	}

	// ---- Choosing -------------------------------------------------------------------------
	P.chooseType = function (label) {
		if (!this.cv.byType[label]) { return; }
		var same = label === this.type();
		if (!same) { this.wiz.selectType(label); this.mine = {}; this.auto = {}; }
		this.funnel.step('type', label);
		this.go('style');
	};

	P.chooseStyle = function (label) {
		if (!this.choiceFor('Door Design', label)) { return; }
		// Back on the grid after customising: keep what they chose, like the toolbox does.
		if (this.style()) { this.restyle(label); } else { this.build(label, prefsFrom(this.defaultsFor(label))); }
		this.funnel.step('style', label);
		this.go('door');
	};

	// select(heading, label): type and style move the journey on; anything else changes the door.
	P.select = function (heading, label) {
		if (heading === 'Door Type') { return this.chooseType(label); }
		if (heading === 'Door Design' && this.screen !== 'door') { return this.chooseStyle(label); }
		if (heading === 'Door Design') { return this.restyle(label); }
		var c = this.choiceFor(heading, label);
		if (!c) { return false; }
		this.wiz.select(heading, c);
		this.settle();
		this.refresh();
		return true;
	};

	// Swap the style: keep each current choice the new style still offers, use the new style's
	// defaults for the rest. The letterplate position follows the style unless they set it.
	P.restyle = function (style) {
		var cur = this.design();
		var defs = this.defaultsFor(style);
		var prefs = prefsFrom(defs);
		var mine = this.mine;
		Object.keys(cur).forEach(function (h) {
			if (h === 'Door Type' || h === 'Door Design') { return; }
			if (h === 'Letterplate Position' && !mine[h]) { return; }
			prefs[h] = [cur[h]].concat(prefs[h] || []);
		});
		this.build(style, prefs);
		this.refresh();
		return true;
	};

	// A toolbox (or dot) pick: changes the door, reports the section, counts for the nudge.
	P.pick = function (section, heading, label) {
		var d = this.design();
		if (d[heading] && trim(d[heading].label) === trim(label)) { return false; }
		this.mine[heading] = label;
		var ok = heading === 'Door Design' ? this.restyle(label) : this.select(heading, label);
		if (!ok) { delete this.mine[heading]; return false; }
		if (SECTIONS[section]) { this.funnel.step(section, label); }
		if (this.nudge.change()) { this.nudgeOn = true; this.nudgeShown++; this.refresh(); }
		this.saver().update();
		return true;
	};

	P.dismissNudge = function () { this.nudge.dismiss(); this.nudgeOn = false; this.refresh(); };

	// Dots over the drawn door, mirrored with it when the hinge side flips the picture.
	P.dots = function () {
		var H = W.HD_DD_D3Hotspots, RM = W.HD_DD_RenderModel;
		if (!H || !this.model) { return []; }
		var d = this.design();
		var list = H.spots(this.model, this.type(), d, OPTS);
		var flip = !!(RM && RM.shouldFlip(this.model, this.type(), d, OPTS));
		var hasKnocker = !!this.stepFor('Knocker');
		list = list.filter(function (s) { return s.key !== 'knocker' || hasKnocker; });
		list = this.unstackGlass(list, d);
		return list.map(function (s) { return { key: s.key, x: flip ? 1 - s.x : s.x, y: s.y }; });
	};

	// The glass dot sits at the middle of all the glass, which on a door with a row of small
	// windows can land on the letterplate's dot. Then use the middle of one window instead.
	P.unstackGlass = function (list, d) {
		var H = W.HD_DD_D3Hotspots, RM = W.HD_DD_RenderModel;
		var glass = list.filter(function (s) { return s.key === 'glass'; })[0];
		if (!glass || !RM) { return list; }
		var layers = RM.assemble(this.model, this.type(), d, OPTS);
		var st = H.stageOf(layers, this.model.types[this.type()]);
		var others = list.filter(function (s) { return s !== glass; });
		var GAP = 16; // stage units (a door is ~160 wide): about a dot's width on screen
		function clear(x, y) { return others.every(function (o) { return Math.abs(o.x - x) * st.width > GAP || Math.abs(o.y - y) * st.height > GAP; }); }
		if (clear(glass.x, glass.y)) { return list; }
		var pane = layers.filter(function (l) { return l.slot === 'DoorGlazing' && clear(l.cx / st.width, l.cy / st.height); })[0];
		if (!pane) { return list; }
		return list.map(function (s) { return s === glass ? { key: 'glass', x: pane.cx / st.width, y: pane.cy / st.height } : s; });
	};

	// ---- Saving ---------------------------------------------------------------------------
	P.saver = function () {
		var self = this;
		if (!this._saver) {
			var Save = W.HD_DD_D3Save;
			this._saver = Save ? Save.create({
				api: this.api, cfg: this.cfg(), flow: this.flow, token: this.savedToken,
				getDesign: function () { return self.design(); },
				getCanvas: function () { return self.canvas || null; },
				experiment: function () { return self.experiment; },
				onSaved: function (body) { self.onSaved(body); }
			}) : { render: noop, saved: function () { return false; }, token: function () { return null; }, update: function () { return Promise.resolve(false); } };
		}
		return this._saver;
	};

	P.onSaved = function (body) {
		if (body && !body.preview && !body.again) {   // `again`: already saved, moving on once more
			this.savedToken = body.token || this.savedToken;
			this.funnel.step('saved');
			this.track('door_saved');
		}
		this.nudgeOn = false;
		this.go('saved');
	};

	// ---- Navigation and drawing -------------------------------------------------------------
	function muted() { return !!(W.HD_DD_Funnel && W.HD_DD_Funnel.muted && W.HD_DD_Funnel.muted()); }
	P.track = function (name) {
		if (muted()) { return; }
		try { if (typeof W.clarity === 'function') { W.clarity('event', name); } } catch (e) { /* best-effort */ }
	};

	P.go = function (screen) {
		this.screen = screen;
		this.render();
		this.track('door_step_' + screen);
		if (screen === 'door' && !this.shown) { this.shown = true; this.funnel.step('shown'); }
		try { if (this.root && this.root.scrollIntoView) { this.root.scrollIntoView({ block: 'start', behavior: 'smooth' }); } } catch (e) { /* older browsers */ }
	};

	P.back = function () {
		if (this.screen === 'door') { return this.go('style'); }
		if (this.screen === 'style') { return this.go('type'); }
		if (LATER.indexOf(this.screen) !== -1) { return this.go('door'); }
	};

	P.render = function () {
		// A door_type link (data-door-type) starts on that type's style grid.
		if (this.screen === 'type' && this.doorType && !this.type()) {
			this.wiz.selectType(this.doorType);
			this.funnel.step('type', this.doorType);
			this.screen = 'style';
		}
		var Sc = W.HD_DD_D3Screens || {};
		var After = W.HD_DD_D3AfterSave || {};
		this.doorView = null;
		this.root.innerHTML = '';
		var shell = document.createElement('div');
		shell.className = 'hd-dd hd-d3 hd-d3--' + this.screen;
		this.root.appendChild(shell);
		this.shell = shell;
		if (this.screen === 'type' && Sc.type) { Sc.type(this, shell); }
		else if (this.screen === 'style' && Sc.style) { Sc.style(this, shell); }
		else if (this.screen === 'door' && Sc.door) { this.doorView = Sc.door(this, shell) || null; }
		else if (typeof After[this.screen] === 'function') { After[this.screen](this, shell, this.lastResult); }
		else if (Sc.placeholder) { Sc.placeholder(this, shell); }
	};

	// Redraw the door, dots, toolbox and save prompt in place (no rebuild, the open section stays).
	P.refresh = function () { if (this.screen === 'door' && this.doorView && this.doorView.refresh) { this.doorView.refresh(); } };

	// ---- Saved design ("revisit your design" link) ---------------------------------------------
	P.loadSaved = function (token) {
		var self = this;
		if (W.HD_DD_D3Screens && W.HD_DD_D3Screens.loading) { W.HD_DD_D3Screens.loading(this); }
		Promise.resolve(this.api('design/' + encodeURIComponent(token), { method: 'GET' })).then(function (res) {
			var saved = res && res.ok && res.body && res.body.design;
			var t = saved && saved['Door Type'] && saved['Door Type'].label;
			var s = saved && saved['Door Design'] && saved['Door Design'].label;
			if (!t || !self.cv.byType[t]) { self.render(); return; }
			self.wiz.selectType(t);
			if (!s || !self.build(s, prefsFrom(saved))) { self.go('style'); return; }
			Object.keys(saved).forEach(function (h) { if (h !== 'Door Type' && h !== 'Door Design') { self.mine[h] = saved[h].label; } });
			self.savedKind = res.body.kind || null;
			if (res.body.kind === 'save') { self.savedToken = token; }
			self.go('saved');
		}).catch(function () { self.render(); });
	};

	W.HD_DD_Designer3App = App;
})(typeof window !== 'undefined' ? window : this);
