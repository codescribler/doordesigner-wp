/*
 * HD Door Designer — guided wizard bootstrap (Layout C: one step at a time).
 * ------------------------------------------------------------------
 * Thin orchestrator. It does NOT own any pipeline logic — it wires the parts:
 *
 *   HD_DD_Wizard        — state machine (which steps apply, current step, design)
 *   HD_DD_StepConfig    — step catalogue + per-type applicability
 *   HD_DD_StepRenderer  — paints the active step's tiles into the body
 *   HD_DD_Review        — the final summary + "get a quote" CTA
 *   HD_DD_Preview       — canvas compositor that repaints the door each change
 *   HD_DD_RenderModel   — (used by the compositor) layer assembler
 *
 * The App takes its three data sources PRELOADED (customerView, renderModel,
 * categories) so the browser QA harness can construct it directly without REST.
 * startFromConfig() is the WordPress entry: it fetches those three over REST/asset
 * then constructs the App.
 *
 * `design` is keyed by the real Endurance heading -> { label, id }. The wizard owns
 * it; we only read it. One UI-only key, `_styleCategory`, is stored on it by the
 * step renderer (category-first style picker) and stripped before submit.
 */
(function () {
	'use strict';

	var CFG = window.HD_DD_CONFIG || {};
	var I18N = CFG.i18n || {};

	// Hardware-finish swatch chips (no per-finish thumbnail asset exists).
	var HARDWARE_HEX = {
		Chrome: '#cfd2d6', Black: '#222', Gold: '#caa44a',
		'Matt Black': '#2b2b2b', 'Satin Steel': '#b9bcc0', 'Brushed Stainless': '#c4c7cb'
	};

	// Customer-facing display names for internal/trade labels. The stored design keeps
	// the EXACT Endurance label; this only changes what the customer reads on screen.
	var DISPLAY_LABELS = { 'Avantal': 'Aluminium' };
	function displayLabel(label) { return DISPLAY_LABELS[label] || label; }

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	// Drop UI-only keys (anything prefixed with "_") from the design payload.
	function cleanDesign(design) {
		var out = {};
		Object.keys(design).forEach(function (h) { if (h.charAt(0) !== '_') { out[h] = design[h]; } });
		return out;
	}

	function api(path, opts) {
		opts = opts || {};
		var headers = { 'Content-Type': 'application/json' };
		if (CFG.nonce) { headers['X-WP-Nonce'] = CFG.nonce; }
		if (opts.headers) { Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; }); }
		opts.headers = headers;
		return fetch((CFG.restUrl || '') + path, opts).then(function (r) {
			return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
		});
	}

	// ---- App ----------------------------------------------------------------
	function App(root, customerView, renderModel, categories) {
		this.root = root;
		this.customerView = customerView;
		this.renderModel = renderModel || null;
		this.categories = categories || null;
		this.wiz = HD_DD_Wizard.create(customerView, HD_DD_StepConfig);
		this.compositor = null;
		// key of the step painted on the PREVIOUS render — used by the _styleCategory
		// reset rule so the category picker re-shows on a fresh arrival at the style step.
		this._lastKey = null;
		this._built = false;
	}

	App.prototype.assetBase = function () {
		return CFG.assetBase || (this.renderModel && this.renderModel._assetBase) || '';
	};

	App.prototype.activeType = function () {
		var d = this.wiz.state().design;
		return d['Door Type'] ? d['Door Type'].label : '';
	};

	// Build the persistent shell once (progress + back, stage/canvas, body, sticky
	// Continue, hidden enquiry form). Subsequent renders only mutate the body and
	// the control states — no listeners are re-attached, so nothing leaks.
	App.prototype.buildShell = function () {
		var self = this;
		this.root.innerHTML = '';
		var layout = el('div', 'hd-dd hd-dd__app');

		var head = el('div', 'hd-dd__wizhead');
		this.backBtn = el('button', 'hd-dd__back', I18N.back || 'Back');
		this.backBtn.type = 'button';
		this.backBtn.addEventListener('click', function () { self.advance('back'); });
		this.progressEl = el('div', 'hd-dd__progress');
		head.appendChild(this.backBtn);
		head.appendChild(this.progressEl);
		layout.appendChild(head);

		var stage = el('div', 'hd-dd__stage');
		this.canvas = el('canvas', 'hd-dd__canvas');
		stage.appendChild(this.canvas);
		layout.appendChild(stage);
		if (this.renderModel && window.HD_DD_Preview) {
			this.compositor = window.HD_DD_Preview.create(this.canvas, { model: this.renderModel, assetBase: this.assetBase() });
		}

		this.body = el('div', 'hd-dd__body');
		layout.appendChild(this.body);

		this.continueBtn = el('button', 'hd-dd__cta', I18N.next || 'Continue');
		this.continueBtn.type = 'button';
		this.continueBtn.addEventListener('click', function () { self.advance('next'); });
		layout.appendChild(this.continueBtn);

		this.root.appendChild(layout);

		this.form = this.buildFormShell();
		this.root.appendChild(this.form);

		this._built = true;
	};

	// ---- Render loop --------------------------------------------------------
	App.prototype.render = function () {
		if (!this._built) { this.buildShell(); }
		var st = this.wiz.state();
		var design = st.design;

		// No type chosen yet → show the type chooser. The type step is intentionally
		// NOT a counted wizard step (the catalogue has no per-node "Door Type" field),
		// so we render it ourselves and let selectType() drop us at the first real step.
		if (!design['Door Type']) {
			this._lastKey = null;
			this.renderTypeChooser();
			this.progressEl.innerHTML = '';
			this.backBtn.disabled = true;
			this.continueBtn.hidden = true;
			return;
		}

		var activeType = design['Door Type'].label;
		var step = st.atReview ? null : st.steps[st.stepIndex];
		var key = st.atReview ? '__review__' : (step && step.key);

		// _styleCategory reset rule: clear it ONLY on a fresh arrival at the style step
		// (the previous render painted a different step). While we remain on the style
		// step — a category click or a style-tile select re-renders in place — it is
		// preserved so the chosen category's tiles stay visible.
		if (key === 'style' && this._lastKey !== 'style') { delete design._styleCategory; }

		if (st.atReview) {
			HD_DD_Review.render(this.body, this.reviewCtx(st));
			this.continueBtn.hidden = true;
		} else {
			HD_DD_StepRenderer.renderStep(this.body, step, this.stepCtx(st, step));
			this.continueBtn.hidden = false;
			// Guided gate: Continue unlocks once the step is satisfied (or is optional).
			this.continueBtn.disabled = !(step.optional || !!design[step.heading]);
		}

		this.renderProgress(st.progress);
		this.backBtn.disabled = false;

		this.repaintPreview(activeType, design);

		this._lastKey = key;
	};

	App.prototype.renderTypeChooser = function () {
		var self = this;
		this.body.innerHTML = '';
		this.body.appendChild(el('div', 'hd-dd__steptitle', I18N.chooseType || 'What kind of door?'));
		var row = el('div', 'hd-dd__carousel');
		(this.customerView.types || []).forEach(function (label) {
			var t = el('button', 'hd-dd__tile');
			t.type = 'button';
			t.appendChild(el('span', 'hd-dd__tile-label', displayLabel(label)));
			t.addEventListener('click', function () { self.wiz.selectType(label); self.render(); });
			row.appendChild(t);
		});
		this.body.appendChild(row);
	};

	App.prototype.renderProgress = function (p) {
		this.progressEl.innerHTML = '';
		var total = (p && p.total) || 0;
		var current = (p && p.current) || 0;
		for (var i = 1; i <= total; i++) {
			this.progressEl.appendChild(el('span', 'hd-dd__seg' + (i <= current ? ' is-on' : '')));
		}
	};

	App.prototype.repaintPreview = function (type, design) {
		if (!this.compositor || !type) { return; }
		try { this.compositor.render(type, design); } catch (e) { /* tolerate a missing asset */ }
	};

	// ---- Context objects handed to the renderers ----------------------------
	App.prototype.stepCtx = function (st, step) {
		var self = this;
		return {
			design: st.design,
			heading: step.heading,
			thumbFor: function (s, c) { return self.thumbFor(s, c); },
			onSelect: function (heading, choice) { self.onSelect(heading, choice); },
			categoryOf: function (label) { return self.categoryOf(label); },
			rerender: function () { self.render(); }
		};
	};

	App.prototype.reviewCtx = function (st) {
		var self = this;
		return {
			steps: st.steps,
			design: st.design,
			typeLabel: st.design['Door Type'] ? displayLabel(st.design['Door Type'].label) : '',
			onEdit: function (key) { self.wiz.jumpTo(key); self.render(); },
			onSubmitClick: function () { self.mountReviewSubmit(); }
		};
	};

	// A tile tap. Door-type tiles live in the chooser and call selectType directly;
	// this guard keeps onSelect correct should a "Door Type" heading ever flow through.
	App.prototype.onSelect = function (heading, choice) {
		if (heading === 'Door Type') { this.wiz.selectType(choice.label); this.render(); return; }

		// The wizard's select() runs pruneInvalid(), which strips any design key that
		// isn't a current step heading — including the step renderer's UI-only
		// `_styleCategory`. Capture it and, when we're choosing a style (so we stay on
		// the category-first style step), restore it so the chosen category's tiles
		// remain visible with the new selection highlighted rather than bouncing back
		// to the category picker.
		var savedCat = this.wiz.state().design._styleCategory;
		this.wiz.select(heading, choice);
		if (heading === 'Door Design' && savedCat != null) {
			this.wiz.state().design._styleCategory = savedCat;
		}
		this.render();
	};

	App.prototype.advance = function (dir) {
		var st = this.wiz.state();
		if (dir === 'back') {
			// Backing out of the first real step returns to the type chooser. The wizard
			// has no "clear type", so we re-create it (changing type resets the design
			// anyway, so nothing meaningful is lost).
			if (!st.atReview && st.stepIndex === 0) {
				this.wiz = HD_DD_Wizard.create(this.customerView, HD_DD_StepConfig);
				this._lastKey = null;
			} else {
				this.wiz.back();
			}
		} else {
			this.wiz.next();
		}
		this.render();
	};

	// ---- Thumbnails ---------------------------------------------------------
	// {kind:'img', url} | {kind:'swatch', color} | null. Image URLs hotlink from the
	// asset base; when it's empty (or the render model is absent) image kinds return
	// null and the tile falls back to a label only.
	App.prototype.thumbFor = function (step, choice) {
		if (step.key === 'hardware') {
			return { kind: 'swatch', color: HARDWARE_HEX[choice.label] || '#ccc' };
		}
		var base = this.assetBase();
		var T = (this.renderModel && this.renderModel.types) ? this.renderModel.types[this.activeType()] : null;
		if (!base || !T) { return null; }

		var BLANKS = '/Assets/CompositeDoors/Images/DoorBlanks/';
		function img(url) { return { kind: 'img', url: encodeURI(url) }; }

		if (step.key === 'style') {
			var s = T.styles[choice.label];
			if (s && s.mould) { return img(base + BLANKS + s.mould + '/Thumbnails/' + T.baselineColour + '.jpg'); }
			return null;
		}
		if (step.key === 'extColour' || step.key === 'intColour') {
			if (T.baselineMould) { return img(base + BLANKS + T.baselineMould + '/Thumbnails/' + choice.label + '.jpg'); }
			return null;
		}
		if (step.key === 'glazing') {
			var design = this.wiz.state().design;
			var st = T.styles[design['Door Design'] && design['Door Design'].label];
			if (st && st.cassetteKey) {
				return img(base + '/Assets/CompositeDoors/Images/DoorGlazing/' + choice.label + '/Thumbnails/' + st.cassetteKey + '.png');
			}
			return null;
		}
		if (step.key === 'handle') {
			var h = T.handles[choice.label];
			if (h && h.url) { return img(base + '/' + h.url); }
			return null;
		}
		if (step.key === 'knocker') {
			var k = T.knockers[choice.label];
			if (k && k.url) { return img(base + '/' + k.url); }
			return null;
		}
		// type, frame, letterplate, hinge, sidelightGlass → label/icon only.
		return null;
	};

	App.prototype.categoryOf = function (label) {
		var map = this.categories && this.categories[this.activeType()];
		return (map && map[label]) || null;
	};

	// ---- Enquiry form (revealed from the review CTA) ------------------------
	App.prototype.mountReviewSubmit = function () {
		if (!this.form) { return; }
		this.form.hidden = false;
		try { this.form.scrollIntoView({ behavior: 'smooth' }); } catch (e) { /* older browsers */ }
	};

	App.prototype.buildFormShell = function () {
		var self = this;
		var form = document.createElement('form');
		form.id = 'hd-dd-form';
		form.className = 'hd-dd__form';
		form.hidden = true;
		form.setAttribute('novalidate', 'novalidate');
		form.appendChild(el('h3', 'hd-dd__form-title', I18N.enquire || 'Enquire about this door'));

		[
			{ name: 'name', label: 'Name', type: 'text', autocomplete: 'name' },
			{ name: 'telephone', label: 'Telephone', type: 'tel', autocomplete: 'tel' },
			{ name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
			{ name: 'postcode', label: 'Post code', type: 'text', autocomplete: 'postal-code' }
		].forEach(function (fld) {
			var row = el('label', 'hd-dd__form-row');
			row.appendChild(el('span', 'hd-dd__form-label', fld.label));
			var input = document.createElement('input');
			input.className = 'hd-dd__form-input';
			input.type = fld.type;
			input.name = fld.name;
			input.required = true;
			input.setAttribute('autocomplete', fld.autocomplete);
			row.appendChild(input);
			var err = el('span', 'hd-dd__form-error');
			err.setAttribute('data-error-for', fld.name);
			row.appendChild(err);
			form.appendChild(row);
		});

		// Honeypot (bots fill it; humans never see it).
		var hp = document.createElement('input');
		hp.type = 'text';
		hp.name = 'hd_hp';
		hp.className = 'hd-dd__hp';
		hp.tabIndex = -1;
		hp.setAttribute('autocomplete', 'off');
		hp.setAttribute('aria-hidden', 'true');
		form.appendChild(hp);

		var consent = el('label', 'hd-dd__consent');
		var cb = document.createElement('input');
		cb.type = 'checkbox';
		cb.name = 'consent';
		cb.required = true;
		consent.appendChild(cb);
		consent.appendChild(el('span', null, I18N.consent || 'I agree to be contacted about this enquiry.'));
		form.appendChild(consent);

		var submit = el('button', 'hd-dd__submit', I18N.enquire || 'Send enquiry');
		submit.type = 'submit';
		form.appendChild(submit);
		form.appendChild(el('div', 'hd-dd__form-status'));
		var statusEl = form.querySelector('.hd-dd__form-status');
		statusEl.setAttribute('role', 'status');
		statusEl.setAttribute('aria-live', 'polite');

		form.addEventListener('submit', function (e) { e.preventDefault(); self.submit(form); });
		return form;
	};

	App.prototype.submit = function (form) {
		var statusEl = form.querySelector('.hd-dd__form-status');
		var submitBtn = form.querySelector('.hd-dd__submit');
		var f = form.elements; // named access (form.name is shadowed by the control named "name").
		var data = {
			name: f['name'].value,
			telephone: f['telephone'].value,
			email: f['email'].value,
			postcode: f['postcode'].value,
			consent: f['consent'].checked,
			hd_hp: f['hd_hp'].value,
			design: cleanDesign(this.wiz.state().design)
		};

		// QA harness has no WordPress REST endpoint — acknowledge without posting.
		if (!CFG.restUrl) {
			statusEl.textContent = I18N.previewOnly || 'Preview mode — enquiry not sent.';
			return;
		}

		statusEl.textContent = '…';
		submitBtn.disabled = true;
		api('enquiry', { method: 'POST', body: JSON.stringify(data) }).then(function (res) {
			submitBtn.disabled = false;
			if (res.ok && res.body && res.body.ok) {
				form.innerHTML = '';
				form.appendChild(el('div', 'hd-dd__success', res.body.message || 'Thank you — your design has been sent.'));
				return;
			}
			Array.prototype.forEach.call(form.querySelectorAll('.hd-dd__form-error'), function (n) { n.textContent = ''; });
			var fieldErrors = res.body && res.body.data && res.body.data.fields;
			if (fieldErrors) {
				Object.keys(fieldErrors).forEach(function (k) {
					var n = form.querySelector('[data-error-for="' + k + '"]');
					if (n) { n.textContent = fieldErrors[k]; }
				});
			}
			statusEl.textContent = (res.body && res.body.message) || I18N.genericError || 'Something went wrong.';
		}).catch(function () {
			submitBtn.disabled = false;
			statusEl.textContent = I18N.genericError || 'Something went wrong.';
		});
	};

	// ---- WordPress entry ----------------------------------------------------
	function startFromConfig(root) {
		var catUrl = CFG.catalogueUrl || (CFG.restUrl + 'catalogue');
		var rmUrl = CFG.renderModelUrl || (CFG.restUrl + 'render-model');
		Promise.all([
			fetch(catUrl).then(function (r) { return r.json(); }),
			fetch(rmUrl).then(function (r) { return r.json(); }).catch(function () { return null; }),
			window.HD_DD_CATEGORIES ? Promise.resolve(window.HD_DD_CATEGORIES)
				: (CFG.categoriesUrl ? fetch(CFG.categoriesUrl).then(function (r) { return r.json(); }).catch(function () { return null; }) : Promise.resolve(null))
		]).then(function (res) {
			var cv = res[0] && res[0].catalogue ? res[0].catalogue : res[0];
			var rm = (res[1] && res[1].available && res[1].model) ? res[1].model : null;
			if (!cv || !cv.byType) {
				root.textContent = (CFG.i18n && CFG.i18n.notLoaded) || 'The door designer is being set up.';
				return;
			}
			new App(root, cv, rm, res[2]).render();
		}).catch(function () {
			root.textContent = (CFG.i18n && CFG.i18n.notLoaded) || 'The door designer is being set up.';
		});
	}

	// Expose for the QA harness; auto-start every shortcode container.
	window.HD_DD_App = App;
	document.addEventListener('DOMContentLoaded', function () {
		Array.prototype.forEach.call(document.querySelectorAll('[data-hd-door-designer]'), startFromConfig);
	});
})();
