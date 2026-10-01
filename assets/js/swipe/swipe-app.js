// assets/js/swipe/swipe-app.js
// The swipe flow's controller: state, navigation, analytics. Rendering lives in swipe-view.js.
//
// Order: showcase (pick a design) → door type (+ hinge) → colour → glass → handle (+ finish)
// → letterplate → knocker → side panels → your door → enquiry form. Choices are stored through
// the classic HD_DD_Wizard, so validity rules, defaults and pruning are exactly the classic
// flow's; the enquiry payload is identical.
(function () {
	'use strict';

	var CFG = window.HD_DD_CONFIG || {};
	var SC = window.HD_DD_StepConfig;
	var FS = window.HD_DD_FlowSteps;
	var DI = window.HD_DD_DesignIndex;
	var Shared = window.HD_DD_Shared;

	// The colour designs are shown in on the showcase (and the colour the door starts in).
	var SHOWCASE_COLOUR = { composite: 'Anthracite Grey', aluminium: 'Signal Grey (Smooth)' };

	function SwipeApp(root, customerView, renderModel, categories, opts) {
		opts = opts || {};
		this.root = root;
		this.cv = Shared.enrichCustomerView(customerView, renderModel);
		this.model = renderModel || null;
		this.index = DI.build(customerView, categories);
		this.funnel = opts.funnel || { step: function () {}, lead: function () {} };
		this.experiment = opts.experiment || null;
		this.api = opts.api;
		this.filter = opts.doorType === 'Avantal' ? 'Aluminium' : 'All';
		this.preferType = opts.doorType && opts.doorType !== 'Avantal' ? opts.doorType : null;
		this.view = window.HD_DD_SwipeView.create(this);
		this.reset();
	}

	SwipeApp.prototype.reset = function () {
		this.wiz = HD_DD_Wizard.create(this.cv, SC);
		this.chosen = null;       // the showcase design entry
		this.memory = {};         // every choice made this run, so switching type can restore them
		this.auto = {};           // furniture we substituted after a finish change (not the customer's pick)
		this.wanted = {};         // furniture that was on the door before a finish change removed it
		this.screen = 'design';   // 'design' | screen key | 'review' | 'form' | 'done'
		this.showcaseAt = 0;
		this.viewed = {};         // designs brought to the centre of the showcase
	};

	SwipeApp.prototype.assetBase = function () { return CFG.assetBase || (this.model && this.model._assetBase) || ''; };
	SwipeApp.prototype.design = function () { return this.wiz.state().design; };
	SwipeApp.prototype.type = function () { var d = this.design()['Door Type']; return d ? d.label : ''; };
	SwipeApp.prototype.node = function () { return this.cv.byType[this.type()]; };
	SwipeApp.prototype.screens = function () { return this.chosen ? FS.screens(this.node(), this.design(), SC) : []; };
	SwipeApp.prototype.currentScreen = function () {
		var list = this.screens();
		return list[this.screenPos(list)] || null;
	};
	// Position of the current screen in a screens() list (screens() builds fresh objects, so
	// match by key, never by identity). -1 when not on an option screen.
	SwipeApp.prototype.screenPos = function (list) {
		for (var i = 0; i < list.length; i++) { if (list[i].key === this.screen) { return i; } }
		return -1;
	};

	SwipeApp.prototype.showcaseList = function () {
		var f = this.filter;
		return this.index.designs.filter(function (d) { return DI.matches(d, f); });
	};

	// The door a showcase card shows: the design as its first type, in the showcase colour.
	SwipeApp.prototype.showcaseDesign = function (d) {
		var type = DI.typesFor(d)[0];
		var probe = { 'Door Type': { label: type }, 'Door Design': { label: d.types[type] } };
		probe['Door Colour (External)'] = { label: SHOWCASE_COLOUR[d.family] };
		// Glazed designs are shown glazed — without glass their apertures read as solid panels.
		var glass = this.showcaseGlass(type, probe['Door Design'].label);
		if (glass) { probe['Door Glass'] = { label: glass }; }
		return { type: type, design: probe };
	};

	// A neutral, representative glass for the showcase: Satin when the design offers it, else
	// the first real glass on its list. null for solid designs.
	SwipeApp.prototype.showcaseGlass = function (type, styleLabel) {
		var node = this.cv.byType[type];
		var list = (node && node.glazingByStyle && node.glazingByStyle[styleLabel]) || [];
		var real = list.filter(function (c) { return !/unglazed/i.test(c.label); });
		if (!real.length) { return null; }
		var satin = real.filter(function (c) { return c.label === 'Satin'; })[0];
		return (satin || real[0]).label;
	};

	function muted() { return !!(window.HD_DD_Funnel && window.HD_DD_Funnel.muted && window.HD_DD_Funnel.muted()); }
	SwipeApp.prototype.track = function (name) {
		if (muted()) { return; } // ?notrack — the owner's own visits
		try { if (typeof window.clarity === 'function') { window.clarity('event', name); } } catch (e) { /* best-effort */ }
	};
	SwipeApp.prototype.tag = function (k, v) {
		if (muted()) { return; }
		try { if (typeof window.clarity === 'function') { window.clarity('set', k, String(v)); } } catch (e) { /* best-effort */ }
	};

	// ---- Choosing ------------------------------------------------------------
	SwipeApp.prototype.pickDesign = function (d) {
		var types = DI.typesFor(d);
		var type = (this.preferType && types.indexOf(this.preferType) !== -1) ? this.preferType : types[0];
		var prev = this.chosen ? this.design() : null;
		this.chosen = d;
		this.funnel.step('design', d.name);
		this.tag('hd_designs_viewed', Object.keys(this.viewed).length || 1);
		this.setType(type, prev);
		if (!this.design()['Door Colour (External)']) { this.selectLabel('Door Colour (External)', SHOWCASE_COLOUR[d.family]); }
		// Keep the glass the showcase showed, so the door doesn't change as they move on.
		var glass = this.showcaseGlass(this.type(), this.design()['Door Design'].label);
		if (glass && !this.design()['Door Glass']) { this.selectLabel('Door Glass', glass); }
		this.go(this.screens()[0].key);
	};

	// Switch door type while keeping every earlier choice that still applies to the new type.
	SwipeApp.prototype.setType = function (type, prev) {
		var keep = {};
		var mem = this.memory, src = prev || this.design();
		Object.keys(mem).forEach(function (k) { keep[k] = mem[k]; });
		Object.keys(src).forEach(function (k) { keep[k] = src[k]; });
		this.wiz.selectType(type);
		// Keep an aluminium cassette variant already chosen for this design; else the default.
		var style = this.chosen.types[type];
		var kept = keep['Door Design'] && keep['Door Design'].label;
		if (kept && this.chosen.variants.some(function (v) { return v.label === kept; })) { style = kept; }
		this.selectLabel('Door Design', style);
		var attempted = { 'Door Type': true, 'Door Design': true };
		for (var guard = 0; guard < 60; guard++) {
			var step = this.wiz.state().steps.filter(function (s) { return !attempted[s.heading]; })[0];
			if (!step) { break; }
			attempted[step.heading] = true;
			if (keep[step.heading]) { this.selectLabel(step.heading, keep[step.heading].label); }
		}
		this.settle();
		var sc = this.currentScreen();
		if (sc) { this.ensureDefaults(sc); }
	};

	// Aluminium: switch to another cassette colour of the same design, keeping everything else.
	SwipeApp.prototype.setVariant = function (label) {
		var prev = {};
		var cur = this.design();
		Object.keys(cur).forEach(function (k) { prev[k] = cur[k]; });
		prev['Door Design'] = { label: label };
		this.setType(this.type(), prev);
	};

	SwipeApp.prototype.selectLabel = function (heading, label) {
		var step = this.wiz.state().steps.filter(function (s) { return s.heading === heading; })[0];
		var list = step ? step.choices : (heading === 'Door Design' ? this.node().fields['Door Design'] : null);
		var c = (list || []).filter(function (x) { return x.label === label; })[0];
		if (c) { this.wiz.select(heading, c); return true; }
		return false;
	};

	SwipeApp.prototype.select = function (heading, choice) {
		this.memory[heading] = choice;
		delete this.wanted[heading]; delete this.auto[heading];
		this.wiz.select(heading, choice);
		this.settle();
		// A choice can reveal new sub-choices (sidelit frame → glazed/solid); give them a value.
		var sc = this.currentScreen();
		if (sc) { this.ensureDefaults(sc); }
	};

	// After any change: drop furniture the finish can't take, and fill single-answer steps.
	SwipeApp.prototype.settle = function () {
		var self = this;
		var d = this.design();
		var before = { Handle: d['Handle'] ? d['Handle'].label : '', Letterplate: d['Letterplate'] ? d['Letterplate'].label : '' };
		Shared.resetFurnitureIfIncompatible(this.model, this.type(), d);
		this.keepFurniture(before);
		FS.autoPicks(this.node(), this.design(), SC).forEach(function (p) { self.wiz.select(p[0], p[1]); });
	};

	// A hardware-finish change can remove the chosen handle/letterplate (it isn't made in that
	// finish). Replace it like-for-like — never a lever with a pull bar — and bring the
	// customer's own pick back as soon as a finish offers it again (Shared.pickFurniture).
	SwipeApp.prototype.keepFurniture = function (before) {
		var self = this;
		[['Handle', 'handle'], ['Letterplate', 'letterplate']].forEach(function (pair) {
			var heading = pair[0];
			var step = self.wiz.state().steps.filter(function (s) { return s.key === pair[1]; })[0];
			if (!step) { return; }
			var d = self.design();
			var cur = d[heading] ? d[heading].label : '';
			var dropped = (before[heading] && !cur) ? before[heading] : '';
			// What to bring back: the customer's own pick, else what was on the door before we
			// first had to swap it (a default they happily kept counts too).
			if (dropped && !self.memory[heading] && !self.wanted[heading]) { self.wanted[heading] = dropped; }
			var mine = self.memory[heading] ? self.memory[heading].label : (self.wanted[heading] || '');
			var pick = Shared.pickFurniture(self.model, self.type(), d, pair[1], step.choices, cur, dropped, mine, self.auto[heading] || '');
			if (!pick) { return; }
			var c = step.choices.filter(function (x) { return x.label === pick; })[0];
			if (!c) { return; }
			self.wiz.select(heading, c);
			if (pick === mine) { delete self.auto[heading]; delete self.wanted[heading]; } else { self.auto[heading] = pick; }
		});
	};

	// Every carousel/toggle on a screen shows a real selection: fill any required step on it
	// that has nothing picked yet with the choice the carousel starts centred on.
	SwipeApp.prototype.ensureDefaults = function (screen) {
		var self = this;
		[screen.main].concat(screen.subs).forEach(function (step) {
			if (!step || self.design()[step.heading]) { return; }
			var list = step === screen.main ? self.choicesFor(step) : step.choices;
			if (list.length) { self.wiz.select(step.heading, list[0]); }
		});
		this.settle();
	};

	// Choices a carousel shows. Handles/letterplates that don't come in the chosen finish are
	// left out entirely (a swipe list has no room for greyed-out tiles).
	SwipeApp.prototype.choicesFor = function (step) {
		if (step.key !== 'handle' && step.key !== 'letterplate') { return step.choices; }
		var self = this, d = this.design();
		var ok = step.choices.filter(function (c) { return !Shared.disabledReason(self.model, self.type(), d, step.key, c.label); });
		return ok.length ? ok : step.choices;
	};

	// ---- Navigation ----------------------------------------------------------
	SwipeApp.prototype.go = function (key) {
		this.screen = key;
		var sc = this.currentScreen();
		if (sc) { this.ensureDefaults(sc); }
		this.render();
		this.track('door_step_' + key);
		if (key === 'review') { this.funnel.step('review'); }
		if (key === 'form') { this.funnel.step('details'); }
		// Opening the save form scrolls to the form itself (see the view), not back to the top.
		if (key !== 'form') {
			try { this.root.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* older browsers */ }
		}
	};

	SwipeApp.prototype.next = function () {
		var list = this.screens();
		var cur = this.currentScreen();
		if (cur) {
			var self = this;
			FS.funnelEvents(cur, this.design()).forEach(function (ev) { self.funnel.step(ev[0], ev[1]); });
		}
		var i = this.screenPos(list);
		this.go(i + 1 < list.length ? list[i + 1].key : 'review');
	};

	SwipeApp.prototype.back = function () {
		if (this.screen === 'form') { return this.go('review'); }
		var list = this.screens();
		if (this.screen === 'review') { return this.go(list.length ? list[list.length - 1].key : 'design'); }
		var i = this.screenPos(list);
		this.go(i > 0 ? list[i - 1].key : 'design');
	};

	SwipeApp.prototype.nextLabel = function () {
		var list = this.screens();
		var i = this.screenPos(list);
		return i + 1 < list.length ? 'Love it · next: ' + list[i + 1].short : 'Love it · see my door';
	};

	SwipeApp.prototype.progress = function () {
		var list = this.screens();
		var total = (list.length || 7) + 1;
		if (this.screen === 'design') { return { current: 1, total: total }; }
		var i = this.screenPos(list);
		return { current: i === -1 ? total : i + 2, total: total };
	};

	SwipeApp.prototype.render = function () { this.view.render(); };

	// ---- Saved design ("revisit your design" link) ---------------------------------
	SwipeApp.prototype.loadSaved = function (token) {
		var self = this;
		this.view.loading();
		this.api('design/' + encodeURIComponent(token), { method: 'GET' }).then(function (res) {
			var saved = res.ok && res.body && res.body.design;
			var t = saved && saved['Door Type'] && saved['Door Type'].label;
			var s = saved && saved['Door Design'] && saved['Door Design'].label;
			var d = s ? DI.designForLabel(self.index, s) : null;
			if (!d || !d.types[t]) { self.render(); return; }
			self.chosen = d;
			self.setType(t, saved);
			self.go('review');
		}).catch(function () { self.render(); });
	};

	window.HD_DD_SwipeApp = SwipeApp;
})();
