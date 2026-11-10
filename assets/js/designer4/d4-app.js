// assets/js/designer4/d4-app.js
// Designer 4's controller: Designer 3's app with the door left without a handle and the handle
// required before the email is sent. State and routing only (drawing: d4-door.js, d4-steps.js,
// d4-mydesigns.js). Journey: type -> style -> door -> doorway -> details -> done; the emailed
// link opens My designs (screen `designs`).
(function (W) {
	'use strict';

	var D3 = W.HD_DD_Designer3App;
	if (typeof D3 !== 'function') { return; }   // no Designer 3: Designer 4 cannot run (experiment.js)
	var D3P = D3.prototype;
	var LATER = { doorway: 1, details: 1, done: 1, designs: 1 };
	var STEPS = { doorway: 1, details: 1, done: 1 };

	function noop() {}
	function Hd() { return W.HD_DD_D4Handle; }
	function prefsFrom(map) { var out = {}; Object.keys(map || {}).forEach(function (h) { out[h] = [map[h]]; }); return out; }
	function anyMissing(m) { return !m || Object.keys(m).some(function (k) { return !!m[k]; }); }

	function App(root, cv, rm, categories, opts) {
		var o = {};
		Object.keys(opts = opts || {}).forEach(function (k) { o[k] = opts[k]; });
		o.flow = 'designer4';
		D3.call(this, root, cv, rm, categories, o);
		this.store = opts.store || (W.HD_DD_D4Store ? W.HD_DD_D4Store.create({ api: this.api }) : null);
		this.known = false;       // started from My designs: the person is already known
		this.missing = null;      // {name, postcode, phone} still missing, once a designs list has said
		this.previewDue = false;  // the door screen plays the preview when it next draws
		this.newDoor();           // freshDoor: the preview plays once per new door; noHandleSent
		this.timers = opts.timers || { set: function (f, ms) { return setTimeout(f, ms); }, clear: function (t) { clearTimeout(t); } };
		this.matchMedia = opts.matchMedia || (typeof W.matchMedia === 'function' ? function (q) { return W.matchMedia(q); } : null);
	}

	var P = App.prototype = Object.create(D3P);
	P.constructor = App;

	// The door has no handle yet (the catalogue's "No Handle" is selected). A type without that
	// choice always carries a handle, so this is false there.
	Object.defineProperty(P, 'needHandle', {
		get: function () { return !!this.stepFor('Handle') && !(Hd() && Hd().hasHandle(this.design())); }
	});

	P.reducedMotion = function () {
		try { return !!(this.matchMedia && this.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
	};

	// Lever, finger pull, bar: the handles the preview shows (d4-handle.js); may be fewer.
	P.previewLabels = function () {
		var step = this.stepFor('Handle');
		return (step && Hd()) ? Hd().previewLabels(this.model, this.type(), this.design(), step.choices) : [];
	};

	// Select "No Handle" (not one of their picks: no `mine`, no funnel step) unless they chose a real handle.
	P.leaveHandleOff = function () {
		var step = this.stepFor('Handle');
		var none = step && Hd() ? Hd().noHandle(step.choices) : null;
		if (!none) { return false; }
		if (this.mine.Handle && Hd().hasHandle(this.design())) { return false; }
		this.wiz.select('Handle', none);
		return true;
	};

	// A new door: the preview may play again, "nohandle" may be reported again, and the steps
	// after the lead (d4-steps.js: doorway picked, funnel steps fired) start over. It is not a copy
	// (d4-saved.js loadCopy sets that after).
	P.newDoor = function () { this.freshDoor = true; this.noHandleSent = false; this.d4steps = null; this.copy = false; };

	// Let go of the door the ask was saving: its saver is disabled first, so a late update can never
	// send another door under its token. The person who sent it is known from now on.
	P.dropSavedDoor = function () {
		if (this._saver && this._saver.setToken) { this._saver.setToken(null); }
		this._saver = null; this._token = null; this.savedKind = null;
		this.known = true;
	};

	// ---- Choosing -------------------------------------------------------------------------
	// Mirrors Designer 3's chooseType: a different type is a new door. When the door on screen is
	// already a lead, the new type is a NEW door ("Add this door to my estimate"), never an edit of it.
	P.chooseType = function (label) {
		if (this.cv.byType[label] && label !== this.type()) {
			if (this.savedToken) { this.dropSavedDoor(); }
			this.newDoor();
		}
		return D3P.chooseType.call(this, label);
	};

	// Mirrors Designer 3's chooseStyle, with the handle taken off before the door screen draws.
	// A restyle of a door that is already a lead is saved at once, not at the next pick.
	P.chooseStyle = function (label) {
		if (!this.choiceFor('Door Design', label)) { return; }
		var restyled = false;
		if (this.style()) { restyled = this.restyle(label); } else { this.build(label, prefsFrom(this.defaultsFor(label))); }
		if (restyled && this.savedToken && !this.needHandle) { this.saver().update(); }
		if (this.leaveHandleOff() && this.freshDoor) { this.previewDue = true; }
		this.freshDoor = false;
		this.funnel.step('style', label);
		this.go('door');
	};

	// Mirrors Designer 3's pick. A pick stops the preview at once; D3's redraw shows the real
	// design, but a pick of the option already on the door redraws nothing, so redraw here.
	P.pick = function (section, heading, label) {
		var stopped = !!(this.doorView && this.doorView.stopPreview && this.doorView.stopPreview());
		var ok = D3P.pick.call(this, section, heading, label);
		if (!ok && stopped) { this.refresh(); }
		return ok;
	};

	// Mirrors Designer 3's dots. With no handle on the door, the handle dot goes where a handle would be drawn.
	P.dots = function () {
		var H = W.HD_DD_D3Hotspots, stand = this.needHandle ? this.previewLabels()[0] : null;
		if (!stand || !H || !H.display || !this.model) { return D3P.dots.call(this); }
		return H.display(this.model, this.type(), Hd().withHandle(this.design(), stand), this.OPTS, { knocker: !!this.stepFor('Knocker') });
	};

	// ---- The ask (the email is the lead) ------------------------------------------------------
	P.knownPerson = function () {
		var a = this.store && this.store.auth ? this.store.auth() : null;
		return !!(this.known || (a && a.token) || (this.store && this.store.email && this.store.email()));
	};

	// Mirrors Designer 3's saver. While the door has no handle, autosave waits (the ask's update()
	// checks hasHandle: the server refuses a design with no handle); the next handle pick sends it.
	P.saver = function () {
		var self = this, Ask = W.HD_DD_D4Ask;
		if (!this._saver) {
			this._askKnown = !this.copy && this.knownPerson();   // a copy always asks for an email
			this._saver = Ask ? Ask.create({
				store: this.store, cfg: this.cfg(), known: this._askKnown,
				getDesign: function () { return self.design(); },
				getCanvas: function () { return self.canvas || null; },
				whenPainted: function () { return self.whenPainted(); },
				experiment: function () { return self.experiment; },
				hasHandle: function () { return !self.needHandle; },
				onNoHandle: function () { if (self.doorView && self.doorView.bubble) { self.doorView.bubble(); } },
				onLead: function (body) { self.onLead(body); },
				nextStep: function () { return self.savedNext(); }
			}) : { render: noop, saved: function () { return false; }, token: function () { return null; }, update: function () { return Promise.resolve(false); } };
			if (this._token && this._saver.setToken) { this._saver.setToken(this._token); }
		}
		return this._saver;
	};

	// True when the door's type offers side or top lights (a doorway to ask about).
	P.doorwayOffered = function () {
		var F = W.HD_DD_D3Frame, step = this.stepFor('Frame Design');
		return !!(F && F.offered(step ? step.choices : null));
	};

	// The doorway when the type offers side or top lights; else details, or done for a known
	// person with nothing missing.
	P.nextAfterLead = function () {
		if (this.doorwayOffered()) { return 'doorway'; }
		return (this.knownPerson() && this.missing && !anyMissing(this.missing)) ? 'done' : 'details';
	};

	// The saved line's link (a door that is already a lead): its doorway while that is offered and
	// still to answer, else My designs.
	P.savedNext = function () {
		var S = W.HD_DD_D4Steps;
		return (S && S.doorwayDue && S.doorwayDue(this)) ? 'doorway' : 'designs';
	};

	// body.again: the saved line's link (no new lead); body.preview: no REST URL (local preview).
	// A door added by a known person (the "Add this door" ask) is not a second lead. Whether the
	// ask was the known one is read from when it was made: a first lead sets the store's email
	// before this runs.
	P.onLead = function (body) {
		if (body && !body.preview && !body.again) {
			if (this._saver ? this._askKnown : this.knownPerson()) {
				this.funnel.step('door_added');
				this.track('door_added');
			} else {
				this.funnel.step('lead');
				this.funnel.lead();
				this.track('door_lead_submitted');
			}
		}
		if (body && !body.again) { this.reopened = false; this.copy = false; }   // a lead or an added door, this visit
		if (body && body.token && this.store) { this.store.addToken(body.token); }
		this.nudgeOn = false;
		this.go(body && body.again ? this.savedNext() : this.nextAfterLead());
	};

	// ---- Navigation and drawing -------------------------------------------------------------
	// Mirrors Designer 3's go. Remembers whether the doorway or details screen was opened from My
	// designs (not from the door screen in this visit), for Back.
	P.go = function (screen) {
		if (STEPS[screen] && this.screen === 'designs') { this.viaDesigns = true; } else if (!LATER[screen]) { this.viaDesigns = false; }
		return D3P.go.call(this, screen);
	};

	// Mirrors Designer 3's back: the later screens go back to the door, or to My designs when
	// that is where the doorway or details screen was opened from.
	P.back = function () {
		if (this.viaDesigns && (this.screen === 'doorway' || this.screen === 'details')) { return this.go('designs'); }
		if (LATER[this.screen]) { return this.go(this.style() ? 'door' : 'type'); }
		return D3P.back.call(this);
	};

	function screenFn(name) {
		if (name === 'door') { return W.HD_DD_D4Door && W.HD_DD_D4Door.door; }
		if (STEPS[name]) { return W.HD_DD_D4Steps && W.HD_DD_D4Steps[name]; }
		if (name === 'designs') { return W.HD_DD_D4MyDesigns && W.HD_DD_D4MyDesigns.render; }
		return null;
	}

	// Mirrors Designer 3's render. type and style are Designer 3's; the door and later screens are
	// Designer 4's. A screen whose module is still an empty shell gets Designer 3's placeholder.
	P.render = function () {
		if (this.screen !== 'door' && !LATER[this.screen]) {
			D3P.render.call(this);
			if (this.shell) { this.shell.className += ' hd-d4'; }
			return;
		}
		if (this.doorView && this.doorView.destroy) { this.doorView.destroy(); }
		this.doorView = null;
		this.root.innerHTML = '';
		var shell = document.createElement('div');
		shell.className = 'hd-dd hd-d3 hd-d4 hd-d3--' + this.screen + ' hd-d4--' + this.screen;
		this.root.appendChild(shell);
		this.shell = shell;
		var fn = screenFn(this.screen), Sc = W.HD_DD_D3Screens || {};
		if (typeof fn === 'function') {
			var view = fn(this, shell);
			if (this.screen === 'door') { this.doorView = view || null; }
		} else if (this.screen === 'door' && Sc.door) {
			this.doorView = Sc.door(this, shell) || null;
		} else if (Sc.placeholder) {
			Sc.placeholder(this, shell);
		}
	};

	// ---- Entry points (boot.js and My designs) -------------------------------------------------
	// Opening a stored door lives in d4-saved.js. loadSaved: one of this visitor's doors (My
	// designs), screen 'door' (default) or 'doorway'.
	P.loadSaved = function (token, screen) { return W.HD_DD_D4Saved.loadSaved(this, token, screen); };
	// loadCopy: a bare ?design=TOKEN link (boot.js), the door as a copy with nothing saved.
	P.loadCopy = function (token) { return W.HD_DD_D4Saved.loadCopy(this, token); };
	P.openListed = function (token, screen) { return W.HD_DD_D4Saved.openListed(this, token, screen); };

	// The emailed link: {token, k} proves the email, then My designs.
	P.loadDesigns = function (token, k) {
		if (this.store) { this.store.setOwner(token, k); }
		this.go('designs');
	};

	// "Design another door" from My designs: a fresh door, tied to the known person.
	P.startDoor = function () {
		this.dropSavedDoor();
		this.mine = {}; this.auto = {};
		this.wiz = W.HD_DD_Wizard.create(this.cv, W.HD_DD_StepConfig);
		this.reopened = false;
		this.newDoor();
		this.previewDue = false;
		this.nudgeOn = false;
		this.go('type');
	};

	W.HD_DD_Designer4App = App;
})(typeof window !== 'undefined' ? window : this);
