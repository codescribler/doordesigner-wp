// assets/js/designer3/d3-after-save.js
// Designer 3's screens after the email save. The app routes go('saved'|'frame'|'quote'|
// 'callback'|'done') here (HD_DD_Designer3App.render).
//   saved:    "✓ Saved…", then straight into the frame question (d3-frame-step.js) or, when the
//             type offers no side/top lights (Double Door), straight to the quote buttons.
//   quote:    guide price, trust block, "Get a no-obligation quote" (Swipe 2's quote form,
//             HD_DD_ReviewSave) and "Request a call back about this door" (d3-callback.js).
//   done:     Swipe 2's thank-you (HD_DD_Enquiry.renderSuccess), or the call back's thanks.
// Per-visit screen state lives on app.after (HD_DD_D3FrameStep.state); the design stays in the
// app's wizard. The quote's success is the A/B conversion (funnel.lead()); a call back is not.
//
//   HD_DD_D3AfterSave.saved(app, el); .frame(app, el); .quote(app, el); .callback(app, el);
//   .done(app, el, result); .landing(app, search) -> screen to open a saved link on
(function (W) {
	'use strict';

	var COPY = {
		saved: '✓ Saved. We’ve emailed you a link to your design.',
		frameQ: 'Does your doorway have glass at the side or top?',
		frameWhy: 'It helps us price it properly.',
		justDoor: 'Just the door',
		justDoorNote: 'No glass beside or above the door',
		keep: 'Keep customising the door',
		quoteTitle: 'Get a price for this exact door',
		quote: 'Get a no-obligation quote',
		callback: 'Request a call back about this door',
		sentCallback: 'We’ll call you about it within one working day. Change anything and you can send us the new version.',
		needSave: 'Save your design first, then we can call you about it.',
		save: 'Save my design'
	};
	var SENT = { enquiry: 1, callback: 1 };

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}
	function FS() { return W.HD_DD_D3FrameStep; }
	function TB() { return W.HD_DD_D3Toolbox; }
	function state(app) { return FS().state(app); }
	function button(cls, txt, onClick) {
		var b = el('button', cls, txt);
		b.type = 'button';
		b.addEventListener('click', onClick);
		return b;
	}
	// Opened from a link to a design already sent to us, and not saved again since.
	function sentKind(app) { return !app.savedToken && !!SENT[app.savedKind]; }

	function openQuote(app) {
		var st = state(app);
		if (!st.quoteOpen) { app.funnel.step('quoteform'); }
		st.quoteOpen = true;
	}

	// ---- Pieces -----------------------------------------------------------------------------
	// Back to the door with the design as it is (half-made chips fall back to the frame on it).
	function keepLink(app) { return button('hd-d3-textlink', COPY.keep, function () { FS().sync(app); app.go('door'); }); }

	function title(shell, text, help) {
		var head = el('div', 'hd-d3-head');
		head.appendChild(el('h2', 'hd-d3-title', text));
		shell.appendChild(head);
		if (help) { shell.appendChild(el('p', 'hd-d3-help', help)); }
	}

	// The door (drawn with the top lights) beside a column for the step.
	function layout(app, shell) {
		var wrap = el('div', 'hd-d3-after');
		var box = el('div', 'hd-d3-stage hd-d3-stage--after');
		var frame = el('div', 'hd-d3-frame');
		var canvas = el('canvas', 'hd-d3-canvas');
		frame.appendChild(canvas); box.appendChild(frame); wrap.appendChild(box);
		var side = el('div', 'hd-d3-after__side');
		wrap.appendChild(side);
		shell.appendChild(wrap);
		app.canvas = canvas;   // the snapshot sent with save updates and shown on the thank-you
		var comp = (W.HD_DD_Preview && app.model) ? W.HD_DD_Preview.create(canvas, { model: app.model, assetBase: app.assetBase() }) : null;
		function paint() { if (comp) { try { comp.render(app.type(), app.design(), app.OPTS); } catch (e) { /* missing asset */ } } }
		setTimeout(paint, 0);
		return { side: side, paint: paint };
	}

	function frameBody(app, shell) {
		title(shell, COPY.frameQ, COPY.frameWhy);
		var L = layout(app, shell);
		var just = button('hd-d3-just', null, function () { FS().justTheDoor(app); });
		just.appendChild(el('span', 'hd-d3-just__label', COPY.justDoor));
		just.appendChild(el('span', 'hd-d3-just__note', COPY.justDoorNote));
		L.side.appendChild(just);
		var box = el('div', 'hd-d3-framebox');
		L.side.appendChild(box);
		function redraw() {
			var keep = TB() ? TB().focusedKey([box]) : null;
			box.innerHTML = '';
			FS().chips(app, box, redraw);
			if (TB()) { TB().restoreFocus([box], keep); }
			L.paint();
		}
		redraw();
		L.side.appendChild(keepLink(app));
	}

	// Swipe 2's "already sent" state (a call back gets its own line: no price is on its way).
	function sentState(app, host) {
		var RS = W.HD_DD_ReviewSave;
		if (app.savedKind === 'enquiry' && RS) {
			RS.create({ api: app.api, cfg: app.cfg(), alreadySent: true, getDesign: function () { return app.design(); } }).render(host);
			return;
		}
		var wrap = el('div', 'hd-sw-save__sent');
		wrap.appendChild(el('div', 'hd-sw-save__title', RS ? RS.COPY.sentTitle : ''));
		wrap.appendChild(el('div', 'hd-dd__form-trust', COPY.sentCallback));
		host.appendChild(wrap);
	}

	// Swipe 2's quote form on this record (made again when the record changes).
	function quoteForm(app) {
		var st = state(app);
		if (st.rs && st.rsToken === app.savedToken) { return st.rs; }
		st.rsToken = app.savedToken;
		st.rs = W.HD_DD_ReviewSave.create({
			api: app.api, cfg: app.cfg(), flow: app.flow, token: app.savedToken || null, alreadySent: false,
			getDesign: function () { return app.design(); },
			getCanvas: function () { return app.canvas || null; },
			experiment: function () { return app.experiment; },
			// Only when the record was closed (a 409) and they give their email again here.
			onSaved: function (r) { app.savedToken = r.token; app.savedKind = 'save'; st.rsToken = app.savedToken; },
			onQuoted: function (result, image) {
				app.track('door_quote_submitted');   // the conversion event
				app.funnel.lead();
				app.lastResult = result;
				app.lastImage = image || (W.HD_DD_Enquiry ? W.HD_DD_Enquiry.snapshot(app.canvas) : null);
				st.doneKind = 'quote';
				app.savedToken = null; app.savedKind = 'enquiry';   // that record is an enquiry now
				app.go('done');
			}
		});
		return st.rs;
	}

	function quoteBody(app, shell) {
		var st = state(app), CFG = app.cfg();
		title(shell, COPY.quoteTitle);
		var side = layout(app, shell).side;
		if (sentKind(app)) { sentState(app, side); side.appendChild(keepLink(app)); return; }
		var guide = CFG.trust && CFG.trust.guidePrice;
		if (guide) { side.appendChild(el('p', 'hd-sw-price', guide)); }
		if (W.HD_DD_Trust) { W.HD_DD_Trust.renderProof(side, CFG.trust); }
		var box = el('div', 'hd-sw-savebox hd-d3-quotebox');
		side.appendChild(box);
		if (st.quoteOpen && W.HD_DD_ReviewSave) {
			quoteForm(app).render(box);
			setTimeout(function () { quoteForm(app).focus(); }, 0);
		} else {
			box.appendChild(button('hd-d3-cta', COPY.quote, function () { openQuote(app); app.render(); }));
		}
		side.appendChild(button('hd-d3-cta hd-d3-cta--secondary', COPY.callback, function () { app.go('callback'); }));
		side.appendChild(keepLink(app));
	}

	// ---- Screens ----------------------------------------------------------------------------
	function saved(app, shell) {
		if (sentKind(app)) { return quoteBody(app, shell); }
		shell.appendChild(el('p', 'hd-d3-savedline', COPY.saved));
		if (FS().offered(app)) { frameBody(app, shell); } else { quoteBody(app, shell); }
	}
	function frame(app, shell) { if (FS().offered(app)) { frameBody(app, shell); } else { quoteBody(app, shell); } }
	function quote(app, shell) { quoteBody(app, shell); }

	// No record to ask about: closed elsewhere (already with us), or never saved (save first).
	function noRecord(app, st, side) {
		if (st.closed || sentKind(app)) {
			if (sentKind(app)) { sentState(app, side); }
			else {
				var wrap = el('div', 'hd-sw-save__sent');
				wrap.appendChild(el('div', 'hd-sw-save__title', W.HD_DD_D3Callback.COPY.already));
				side.appendChild(wrap);
			}
			side.appendChild(keepLink(app));
			return;
		}
		side.appendChild(el('p', 'hd-d3-help', COPY.needSave));
		side.appendChild(button('hd-d3-cta', COPY.save, function () { app.go('door'); }));
	}

	function callback(app, shell) {
		var st = state(app), C = W.HD_DD_D3Callback;
		title(shell, COPY.callback);
		var side = layout(app, shell).side;
		if (!app.savedToken) { noRecord(app, st, side); return; }
		st.closed = false;
		if (!st.cb || st.cbToken !== app.savedToken) {
			st.cbToken = app.savedToken;
			st.cb = C.create({
				api: app.api, cfg: app.cfg(), token: app.savedToken,
				getDesign: function () { return app.design(); },
				ensure: function () { return app.saver().update(); },
				closed: function () { return !app.savedToken; },   // a 409 on update clears the token
				onClosed: function () { st.closed = true; app.savedToken = null; app.render(); },
				onNoToken: function () { app.render(); },
				onDone: function (result) {
					app.funnel.step('callback');   // a lead for the business, NOT the A/B conversion: never lead()
					app.track('door_callback_requested');
					app.lastResult = result;
					st.doneKind = 'callback';
					app.savedToken = null; app.savedKind = 'callback';
					app.go('done');
				}
			});
		}
		st.cb.render(side);
		side.appendChild(button('hd-d3-textlink', COPY.quote, function () { openQuote(app); app.go('quote'); }));
		side.appendChild(keepLink(app));
		setTimeout(function () { st.cb.focus(); }, 0);
	}

	// "Design another door": a fresh door, unsaved, from the type screen.
	function startAgain(app) {
		app.savedToken = null; app.savedKind = null; app.after = null;
		app.mine = {}; app.auto = {};
		app.wiz = W.HD_DD_Wizard.create(app.cv, W.HD_DD_StepConfig);
		app.go('type');
	}

	function done(app, shell, result) {
		if (state(app).doneKind === 'callback') {
			W.HD_DD_D3Callback.thanks(shell);
			shell.appendChild(keepLink(app));
			return;
		}
		W.HD_DD_Enquiry.create({ api: app.api, cfg: app.cfg(), i18n: app.cfg().i18n || {}, getDesign: function () { return app.design(); } })
			.renderSuccess(shell, result, function () { startAgain(app); }, app.lastImage);
	}

	// Where a saved link opens: the saved screen; with ?price=1 the quote form itself. A design
	// already sent (enquiry or call back) shows the "already sent" state instead.
	function landing(app, search) {
		app.after = null;
		state(app);
		if (sentKind(app)) { return 'saved'; }
		if (app.savedToken && /[?&]price=1(&|#|$)/.test(String(search || ''))) { openQuote(app); return 'quote'; }
		return 'saved';
	}

	W.HD_DD_D3AfterSave = { saved: saved, frame: frame, quote: quote, callback: callback, done: done, landing: landing, COPY: COPY };
})(typeof window !== 'undefined' ? window : this);
