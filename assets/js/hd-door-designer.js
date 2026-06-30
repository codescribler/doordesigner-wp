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

	// Hardware-finish swatch chips — a representative colour per Endurance finish (the
	// asset host has no per-finish swatch image). A subtle gradient gives a metallic read.
	var HARDWARE_HEX = {
		'Chrome':          'linear-gradient(135deg,#e9edf1,#aab0b8)',
		'Black':           '#1f1f1f',
		'Gold':            'linear-gradient(135deg,#e0c06a,#b8902f)',
		'Stainless Steel': 'linear-gradient(135deg,#cdd1d6,#a3a8ae)',
		'Antique Black':   '#2b2722',
		'Graphite':        '#4c5054',
		'Bronze':          'linear-gradient(135deg,#8a6a48,#5d422a)',
		'Forged Black':    '#1b1b1b',
		'Pewter':          'linear-gradient(135deg,#9a9ca0,#74777b)',
		'Matt Black':      '#2b2b2b',
		'Satin Brass':     'linear-gradient(135deg,#c6a86a,#9c7f45)'
	};

	// Customer-facing display names for internal/trade labels. The stored design keeps
	// the EXACT Endurance label; this only changes what the customer reads on screen.
	var DISPLAY_LABELS = { 'Avantal': 'Aluminium' };
	function displayLabel(label) { return DISPLAY_LABELS[label] || label; }

	// Page-1 door-type chooser: a refined, style-neutral silhouette + a one-line
	// description per type, so a layperson grasps the choice (single / double / stable /
	// aluminium) without a specific STYLE being pushed on them before the style step.
	var TYPE_SIL = {
		'Single Door':
			'<svg viewBox="0 0 110 210" class="hd-dd__sil" aria-hidden="true">' +
				'<rect class="hd-dd__sil-frame" x="22" y="10" width="66" height="190" rx="3"/>' +
				'<rect class="hd-dd__sil-panel" x="30" y="20" width="50" height="170" rx="2"/>' +
				'<line class="hd-dd__sil-line" x1="36" y1="64" x2="74" y2="64"/>' +
				'<line class="hd-dd__sil-line" x1="36" y1="108" x2="74" y2="108"/>' +
				'<line class="hd-dd__sil-line" x1="36" y1="152" x2="74" y2="152"/>' +
				'<rect class="hd-dd__sil-handle" x="72" y="104" width="5" height="20" rx="2.5"/>' +
			'</svg>',
		'Double Door':
			'<svg viewBox="0 0 110 210" class="hd-dd__sil" aria-hidden="true">' +
				'<rect class="hd-dd__sil-frame" x="10" y="10" width="90" height="190" rx="3"/>' +
				'<line class="hd-dd__sil-frame" x1="55" y1="12" x2="55" y2="198"/>' +
				'<rect class="hd-dd__sil-panel" x="17" y="20" width="32" height="170" rx="2"/>' +
				'<rect class="hd-dd__sil-panel" x="61" y="20" width="32" height="170" rx="2"/>' +
				'<rect class="hd-dd__sil-handle" x="48" y="100" width="5" height="24" rx="2.5"/>' +
				'<rect class="hd-dd__sil-handle" x="57" y="100" width="5" height="24" rx="2.5"/>' +
			'</svg>',
		'Stable Door':
			'<svg viewBox="0 0 110 210" class="hd-dd__sil" aria-hidden="true">' +
				'<rect class="hd-dd__sil-frame" x="22" y="10" width="66" height="190" rx="3"/>' +
				'<rect class="hd-dd__sil-panel" x="30" y="20" width="50" height="78" rx="2"/>' +
				'<rect class="hd-dd__sil-panel" x="30" y="112" width="50" height="78" rx="2"/>' +
				'<rect class="hd-dd__sil-split" x="26" y="99" width="58" height="12" rx="2"/>' +
				'<rect class="hd-dd__sil-handle" x="72" y="70" width="5" height="18" rx="2.5"/>' +
				'<rect class="hd-dd__sil-handle" x="72" y="124" width="5" height="18" rx="2.5"/>' +
			'</svg>',
		'Avantal':
			'<svg viewBox="0 0 110 210" class="hd-dd__sil" aria-hidden="true">' +
				'<rect class="hd-dd__sil-frame hd-dd__sil-frame--slim" x="24" y="10" width="62" height="190" rx="2"/>' +
				'<rect class="hd-dd__sil-glass" x="31" y="17" width="48" height="158" rx="1.5"/>' +
				'<line class="hd-dd__sil-mullion" x1="55" y1="17" x2="55" y2="175"/>' +
				'<rect class="hd-dd__sil-kick" x="31" y="180" width="48" height="14" rx="1.5"/>' +
				'<rect class="hd-dd__sil-handle" x="74" y="70" width="4.5" height="70" rx="2.2"/>' +
			'</svg>'
	};
	var TYPE_DESC = {
		'Single Door': 'One solid leaf — the classic front door.',
		'Double Door': 'Two leaves that open from the centre — wide, grand entrances.',
		'Stable Door': 'Split across the middle — open the top half on its own.',
		'Avantal': 'Sleek aluminium with slim frames and more glass.'
	};

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	// "Chrome, Gold & Graphite" — for the "…only" note on greyed handle tiles.
	function formatColourList(arr) {
		if (!arr || !arr.length) { return ''; }
		if (arr.length === 1) { return arr[0]; }
		return arr.slice(0, -1).join(', ') + ' & ' + arr[arr.length - 1];
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
		// Mark, per type, the styles whose mould offers the Middle/Bottom letterplate-position
		// choice (from the render model) so the wizard can show that step only where it applies.
		if (renderModel && renderModel.types && customerView && customerView.byType) {
			var sideByKey = renderModel.sideDesignByKey || {};
			Object.keys(customerView.byType).forEach(function (t) {
				var rmStyles = (renderModel.types[t] || {}).styles || {};
				var posStyles = {};
				var decoStyles = {}; // styles that can show a decorative (door-matching) sidelight
				Object.keys(rmStyles).forEach(function (s) {
					// 'bottom' = a glazed style whose Middle plate covers the glass (default it to the
					// bottom rail); 'middle' = the plate's natural central spot is already clear.
					if (rmStyles[s].letterplateBottomCy != null) { posStyles[s] = rmStyles[s].letterplateDefaultBottom ? 'bottom' : 'middle'; }
					if (rmStyles[s].cassetteKey && sideByKey[rmStyles[s].cassetteKey]) { decoStyles[s] = true; }
				});
				customerView.byType[t].letterplatePosStyles = posStyles;
				customerView.byType[t].decorativeSideStyles = decoStyles;
			});
		}
		this.wiz = HD_DD_Wizard.create(customerView, HD_DD_StepConfig);
		this.compositor = null;
		// key of the step painted on the PREVIOUS render — used by the _styleCategory
		// reset rule so the category picker re-shows on a fresh arrival at the style step.
		this._lastKey = null;
		this._lastView = null; // last view name sent to analytics (funnel de-dup)
		this._built = false;
	}

	App.prototype.assetBase = function () {
		return CFG.assetBase || (this.renderModel && this.renderModel._assetBase) || '';
	};

	App.prototype.activeType = function () {
		var d = this.wiz.state().design;
		return d['Door Type'] ? d['Door Type'].label : '';
	};

	// ---- Reload a saved design (the "revisit your design" email link) -------
	// Fetches the stored design for a token and re-applies it choice-by-choice, validating
	// each against the CURRENT catalogue. Anything retired since it was saved is skipped and
	// listed in a plain-English banner; the customer lands on the review (if complete) or on
	// the first thing that needs their attention.
	App.prototype.loadSavedDesign = function (token) {
		var self = this;
		this.root.textContent = (I18N.loadingDesign) || 'Loading your saved design…';
		api('design/' + encodeURIComponent(token), { method: 'GET' }).then(function (res) {
			if (res.ok && res.body && res.body.design) {
				self.applySavedDesign(res.body.design);
			} else {
				self._reloadNote = { notFound: true };
				self.render();
			}
		}).catch(function () {
			self._reloadNote = { notFound: true };
			self.render();
		});
	};

	App.prototype.applySavedDesign = function (design) {
		var typeLabel = design['Door Type'] && design['Door Type'].label;
		if (!typeLabel || !this.customerView.byType || !this.customerView.byType[typeLabel]) {
			this._reloadNote = { notFound: true }; // the saved door type itself is gone
			this.render();
			return;
		}
		this.wiz.selectType(typeLabel);

		// Apply one saved choice per pass, re-reading the applicable steps each time so steps
		// that only appear after an earlier choice (glazing depends on style, etc.) are caught.
		var dropped = [];
		var attempted = { 'Door Type': true };
		var guard = 0;
		while (guard++ < 60) {
			var steps = this.wiz.state().steps;
			var acted = false;
			for (var i = 0; i < steps.length; i++) {
				var step = steps[i];
				if (attempted[step.heading]) { continue; }
				attempted[step.heading] = true;
				var saved = design[step.heading];
				if (saved && saved.label) {
					var match = null;
					for (var c = 0; c < step.choices.length; c++) {
						if (step.choices[c].label === saved.label) { match = step.choices[c]; break; }
					}
					if (match) { this.wiz.select(step.heading, match); }
					else { dropped.push({ name: step.name || step.label, label: saved.label }); }
				}
				acted = true;
				break; // re-read steps() — a selection may have revealed/removed later steps
			}
			if (!acted) { break; }
		}

		this.resetFurnitureIfIncompatible(); // a reloaded handle/letterplate may not come in the reloaded finish

		// Land on the first required step still missing a choice (so they can complete it),
		// else straight on the review. The banner explains anything that was dropped.
		var st = this.wiz.state();
		var firstGap = null;
		for (var j = 0; j < st.steps.length; j++) {
			var s = st.steps[j];
			if (!s.optional && !st.design[s.heading]) { firstGap = s.key; break; }
		}
		this._reloadNote = dropped.length ? { dropped: dropped } : null;
		if (firstGap) { this.wiz.jumpTo(firstGap); } else { this.wiz.goToReview(); }
		this.render();
	};

	// The "things changed since you saved this" banner, prepended to the body.
	App.prototype.renderReloadNote = function () {
		if (!this._reloadNote || !this.body) { return; }
		var self = this;
		var note = el('div', 'hd-dd__reload-note');
		var close = el('button', 'hd-dd__reload-close', '×'); close.type = 'button';
		close.setAttribute('aria-label', 'Dismiss');
		close.addEventListener('click', function () { self._reloadNote = null; self.render(); });
		note.appendChild(close);
		if (this._reloadNote.notFound) {
			note.appendChild(el('div', 'hd-dd__reload-title', "We couldn't find that saved design — let's start fresh."));
		} else {
			var dropped = this._reloadNote.dropped || [];
			note.appendChild(el('div', 'hd-dd__reload-title', 'A few things have changed since you saved this design:'));
			var ul = el('ul', 'hd-dd__reload-list');
			dropped.forEach(function (d) {
				ul.appendChild(el('li', null, 'Your ' + d.name + ' (“' + d.label + '”) is no longer available — please choose again.'));
			});
			note.appendChild(ul);
			note.appendChild(el('div', 'hd-dd__reload-foot', 'Everything else has loaded — just re-pick the items above to finish your design.'));
		}
		this.body.insertBefore(note, this.body.firstChild);
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
		this.head = head;
		this.layoutEl = layout;

		var stage = el('div', 'hd-dd__stage');
		// Hero image — shown before a door type is chosen (when the canvas is empty), so
		// the first screen looks like a real door rather than a blank box.
		this.heroImg = el('img', 'hd-dd__hero');
		this.heroImg.alt = 'Composite front door';
		this.heroImg.loading = 'lazy';
		this.heroImg.hidden = true;
		if (CFG.heroImage) { this.heroImg.onerror = function () { self.heroImg.hidden = true; }; this.heroImg.src = CFG.heroImage; }
		stage.appendChild(this.heroImg);
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
		this._built = true;

		// The mobile layout pins the header and sticks the preview directly beneath it.
		// Measure the header so the sticky `top` tracks its real height (it's a single
		// short row, but this stays correct if the progress bar ever wraps or the theme
		// changes the font). Re-measure on resize.
		this.syncHeadHeight();
		if (!this._headResizeBound) {
			this._headResizeBound = true;
			var self2 = this;
			window.addEventListener('resize', function () { self2.syncHeadHeight(); });
		}
	};

	// Publish the header height as a custom property the CSS uses for the sticky offset.
	App.prototype.syncHeadHeight = function () {
		if (!this.head || !this.layoutEl) { return; }
		var h = this.head.offsetHeight;
		if (h) { this.layoutEl.style.setProperty('--hd-head-h', h + 'px'); }
	};

	// Tag the shell with the current phase so the stylesheet can lay each one out
	// appropriately (e.g. on phones a wizard step is two-column preview-left, while the
	// form/review stay full-width). Keeps the scoping/token classes intact.
	App.prototype.setPhase = function (phase) {
		if (this.layoutEl) { this.layoutEl.className = 'hd-dd hd-dd__app hd-dd__app--' + phase; }
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
			this._lastKey = null; this._atForm = false; this._frameGroup = null;
			this.setPhase('type');
			if (this.heroImg && CFG.heroImage) { this.heroImg.hidden = false; }
			this.canvas.hidden = true;
			this.renderTypeChooser();
			this.renderReloadNote(); // e.g. "we couldn't find that saved design — let's start fresh"
			this.progressEl.innerHTML = '';
			this.backBtn.hidden = true; // first page — nothing to go back to
			this.continueBtn.hidden = true;
			this.trackView('start');
			return;
		}
		if (this.heroImg) { this.heroImg.hidden = true; }
		this.canvas.hidden = false;

		var activeType = design['Door Type'].label;
		var step = st.atReview ? null : st.steps[st.stepIndex];
		var key = st.atReview ? '__review__' : (step && step.key);

		// _styleCategory reset rule: clear it ONLY on a fresh arrival at the style step
		// (the previous render painted a different step). While we remain on the style
		// step — a category click or a style-tile select re-renders in place — it is
		// preserved so the chosen category's tiles stay visible.
		if (key === 'style' && this._lastKey !== 'style') { delete design._styleCategory; }
		if (key === 'frame' && this._lastKey !== 'frame') { this._frameGroup = null; }

		if (st.atReview) {
			// The enquiry form renders in the body (not a separate block) so the door
			// preview stays visible right up to the moment of submission.
			this.setPhase(this._atForm ? 'form' : 'review');
			if (this._atForm) { this.renderForm(); } else { HD_DD_Review.render(this.body, this.reviewCtx(st)); }
			this.continueBtn.hidden = true;
		} else {
			this._atForm = false;
			this.setPhase('step');
			HD_DD_StepRenderer.renderStep(this.body, step, this.stepCtx(st, step));
			this.continueBtn.hidden = false;
			// Guided gate: Continue unlocks once the step is satisfied (or is optional).
			this.continueBtn.disabled = !(step.optional || !!design[step.heading]);
			// Optional extras (letterplate, knocker, inside colour) are pre-filled with a
			// sensible default. The primary action always reads "Continue" — flipping it to
			// "Skip" on optional steps confused people (it wasn't clear why it changed); the
			// optional nature is signalled by the step's hint ("…Optional.") instead.
			this.continueBtn.textContent = (I18N.next || 'Continue');
		}

		if (!this._atForm) { this.renderReloadNote(); } // reload banner sits above the step / review

		this.renderProgress(st.progress);
		this.backBtn.hidden = false;
		this.backBtn.disabled = false;

		this.repaintPreview(activeType, design);

		// One funnel event per distinct view, so the analytics show where people drop off.
		this.trackView(st.atReview ? (this._atForm ? 'form' : 'review') : key);

		this._lastKey = key;

		// Measure the header LAST — the Back button is now visible, so the height reflects
		// the real (back + progress) row the sticky preview must clear beneath it.
		this.syncHeadHeight();
	};

	// Fire a Clarity event the first time each view is shown in a run, de-duped so
	// re-renders of the same step (a tile click, a category switch) don't double-count.
	App.prototype.trackView = function (viewKey) {
		if (!viewKey || viewKey === this._lastView) { return; }
		this._lastView = viewKey;
		this.track('door_step_' + viewKey);
	};

	App.prototype.renderTypeChooser = function () {
		var self = this;
		this.body.innerHTML = '';
		this.body.appendChild(el('div', 'hd-dd__intro', I18N.intro || 'Design your door and get a free, no-obligation quote — it takes about two minutes.'));
		this.body.appendChild(el('div', 'hd-dd__steptitle', I18N.chooseType || 'What kind of door?'));
		var row = el('div', 'hd-dd__carousel hd-dd__typegrid');
		(this.customerView.types || []).forEach(function (label) {
			var t = el('button', 'hd-dd__tile hd-dd__typetile');
			t.type = 'button';
			var media = el('div', 'hd-dd__tile-media');
			if (TYPE_SIL[label]) { media.innerHTML = TYPE_SIL[label]; }
			t.appendChild(media);
			// Show the raw label (so the aluminium range reads "Avantal"); the description
			// line carries the plain-English clarification ("aluminium").
			t.appendChild(el('span', 'hd-dd__tile-label', label));
			if (TYPE_DESC[label]) { t.appendChild(el('span', 'hd-dd__tile-desc', TYPE_DESC[label])); }
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

	// A PNG snapshot of the composited door for the enquiry — downscaled to a sensible width
	// and flattened onto the stage colour so it reads in any email client. Returns null if the
	// canvas is empty or (on dev hotlinking) cross-origin-tainted, in which case we submit the
	// spec without an image rather than block the customer.
	App.prototype.snapshotDoor = function () {
		var cv = this.canvas;
		if (!cv || !cv.width || !cv.height) { return null; }
		try {
			var maxW = 480;
			var scale = Math.min(1, maxW / cv.width);
			var out = document.createElement('canvas');
			out.width = Math.round(cv.width * scale);
			out.height = Math.round(cv.height * scale);
			var ctx = out.getContext('2d');
			ctx.fillStyle = '#f3f3f1';
			ctx.fillRect(0, 0, out.width, out.height);
			ctx.drawImage(cv, 0, 0, out.width, out.height);
			return out.toDataURL('image/png');
		} catch (e) { return null; }
	};

	// Funnel tracking (Microsoft Clarity, if installed) — fire a custom event per view so
	// you can see exactly which step loses people. Best-effort: a no-op if Clarity is absent.
	App.prototype.track = function (name) {
		try { if (typeof window.clarity === 'function') { window.clarity('event', name); } } catch (e) { /* analytics is best-effort */ }
	};

	// ---- Context objects handed to the renderers ----------------------------
	// --- Furniture ↔ hardware-finish compatibility --------------------------
	// A recolourable furniture item (handle or letterplate) only comes in the finishes whose
	// image file actually exists: a lever in all seven standard finishes, an architectural lever
	// or letterplate in just Chrome/Gold/Graphite. Returns the finish LABELS it's offered in, or
	// null when it has no recolour variants at all — a FIXED/product item (a stainless pull, a
	// "Pewter Monkey Tail", a "Forged Black …"): those carry their finish in the product itself
	// and are left unconstrained here. (Whether a fixed product is valid with a mismatched finish
	// is an Endurance validator question, not a missing-file one — see docs/orderability-audit.md.)
	App.prototype.furnitureAvailableColours = function (furnMap, label) {
		var model = this.renderModel;
		if (!furnMap || !furnMap[label] || !window.HD_DD_RenderModel) { return null; }
		var info = window.HD_DD_RenderModel.furnitureColourInfo(model, furnMap[label].url);
		if (!info) { return null; }
		var tokenToLabel = {};
		for (var lbl in model.hardwareColours) {
			if (Object.prototype.hasOwnProperty.call(model.hardwareColours, lbl)) { tokenToLabel[model.hardwareColours[lbl]] = lbl; }
		}
		// An alternate token (the finger pull's MattSilver) stands in for a canonical finish token
		// (Satin), so resolve it before mapping to a finish label — else that finish looks unavailable.
		var aliases = model.furnitureColourAliases || {};
		return info.variants.map(function (t) { return tokenToLabel[aliases[t] || t]; }).filter(Boolean);
	};
	App.prototype.handleAvailableColours = function (label) {
		var T = (this.renderModel && this.renderModel.types) ? this.renderModel.types[this.activeType()] : null;
		return T ? this.furnitureAvailableColours(T.handles, label) : null;
	};

	// The finish LABELS a handle/letterplate is offered in, read from Endurance's exact per-finish
	// lists (model.finishFurniture). Returns null when we have no such data (caller then falls back
	// to the variant-token heuristic). The labels carry the odd trailing space, so match trimmed.
	App.prototype.furnitureFinishes = function (label, kind) {
		var ff = this.renderModel && this.renderModel.finishFurniture;
		if (!ff) { return null; }
		var target = String(label).trim();
		var out = [];
		for (var fin in ff) {
			if (!Object.prototype.hasOwnProperty.call(ff, fin)) { continue; }
			var list = ff[fin][kind] || [];
			for (var i = 0; i < list.length; i++) { if (String(list[i]).trim() === target) { out.push(fin); break; } }
		}
		return out;
	};

	// Why a handle/letterplate tile is greyed out (or null if selectable). Endurance filters these
	// lists by finish, so we offer exactly what it offers for the chosen finish — guaranteeing the
	// pair is orderable. Falls back to the recolour-variant heuristic when per-finish data is absent.
	App.prototype.tileDisabledReason = function (step, choice) {
		if (step.key !== 'handle' && step.key !== 'letterplate') { return null; }
		var hw = this.wiz.state().design['Hardware Type'];
		if (!hw) { return null; }
		var kind = step.key === 'handle' ? 'handles' : 'letterplates';
		var finishes = this.furnitureFinishes(choice.label, kind);
		if (finishes !== null) {
			// `[]` = an item we model that Endurance never lists (label drift) — don't block it.
			if (!finishes.length || finishes.indexOf(hw.label) !== -1) { return null; }
			return formatColourList(finishes) + ' only';
		}
		var model = this.renderModel;
		var T = model && model.types ? model.types[this.activeType()] : null;
		if (!T) { return null; }
		var avail = this.furnitureAvailableColours(step.key === 'handle' ? T.handles : T.letterplates, choice.label);
		if (!avail || avail.indexOf(hw.label) !== -1) { return null; }
		return formatColourList(avail) + ' only';
	};

	// When the finish changes, drop a now-incompatible handle or letterplate so the preview never
	// shows an item the chosen finish doesn't offer — it falls back to the default and the customer
	// re-picks (incompatible ones greyed). Mirrors how the Endurance designer resets the handle.
	App.prototype.resetFurnitureIfIncompatible = function () {
		var design = this.wiz.state().design;
		var model = this.renderModel;
		var hw = design['Hardware Type'];
		if (!hw || !model) { return; }
		var T = model.types ? model.types[this.activeType()] : null;
		var self = this;
		[['Handle', 'handles'], ['Letterplate', 'letterplates']].forEach(function (pair) {
			var sel = design[pair[0]];
			if (!sel) { return; }
			var finishes = self.furnitureFinishes(sel.label, pair[1]);
			if (finishes !== null) {
				if (finishes.length && finishes.indexOf(hw.label) === -1) { delete design[pair[0]]; }
				return;
			}
			if (!T) { return; }
			var avail = self.furnitureAvailableColours(pair[0] === 'Handle' ? T.handles : T.letterplates, sel.label);
			if (avail && avail.indexOf(hw.label) === -1) { delete design[pair[0]]; }
		});
	};

	App.prototype.stepCtx = function (st, step) {
		var self = this;
		return {
			design: st.design,
			heading: step.heading,
			thumbFor: function (s, c) { return self.thumbFor(s, c); },
			tileDisabledReason: function (s, c) { return self.tileDisabledReason(s, c); },
			onSelect: function (heading, choice) { self.onSelect(heading, choice); },
			categoryOf: function (label) { return self.categoryOf(label); },
			groupOf: function (label) { return HD_DD_StepConfig.frameGroup(label); },
			frameGroup: function () { return self._frameGroup || null; },
			setFrameGroup: function (g) { self._frameGroup = g; self.render(); },
			clearChoice: function (heading) { delete self.wiz.state().design[heading]; self._frameGroup = null; self.render(); },
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
			onSubmitClick: function () { self._atForm = true; self.render(); try { self.root.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* older browsers */ } }
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
		// Changing the finish can leave the chosen handle/letterplate without that colour — drop it
		// so the preview doesn't show it reverted to its default finish.
		if (heading === 'Hardware Type') { this.resetFurnitureIfIncompatible(); }
		this.render();
	};

	App.prototype.advance = function (dir) {
		var st = this.wiz.state();
		if (dir === 'back') {
			// On the enquiry form, Back returns to the review summary (not a wizard step).
			if (st.atReview && this._atForm) { this._atForm = false; this.render(); return; }
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
		// Land each new step at the top. After picking an option low in a long list, the
		// next step's title + question would otherwise stay scrolled off-screen above the
		// fold (especially on mobile, where the door preview fills the top of the viewport).
		try { this.root.scrollIntoView({ block: 'start' }); } catch (e) { /* older browsers */ }
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
			// Prefer the clearest glass image (probed per glass) so the picker shows the
			// pattern; fall back to the chosen style's own aperture crop.
			var gt = this.renderModel && this.renderModel.glassThumbs;
			var key = (gt && gt[choice.label]) || (st && st.cassetteKey);
			if (key) {
				return img(base + '/Assets/CompositeDoors/Images/DoorGlazing/' + choice.label + '/Thumbnails/' + key + '.png');
			}
			return null;
		}
		if (step.key === 'handle') {
			var h = T.handles[choice.label];
			// Handle products look identical on every door type, but some types (e.g.
			// double doors) didn't capture every handle's layer — borrow the image from
			// whichever type has it so every handle shows a thumbnail.
			var hurl = ( h && h.url ) || this.handleImageFromAnyType( choice.label );
			if (hurl) { return img(base + '/' + hurl); }
			return null;
		}
		if (step.key === 'knocker') {
			var k = T.knockers[choice.label];
			if (k && k.url) { return img(base + '/' + k.url); }
			return null;
		}
		if (step.key === 'letterplate') {
			var lp = T.letterplates && T.letterplates[choice.label];
			if (lp && lp.url) { return img(base + '/' + lp.url); }
			return null;
		}
		// type, frame, hinge, sidelightGlass → label/icon only.
		return null;
	};

	// Borrow a handle's image from any door type that captured it (handle products are
	// identical across types). Used for thumbnails only — the canvas keeps each type's
	// own captured geometry, falling back to the baseline handle when a type lacks one.
	App.prototype.handleImageFromAnyType = function (label) {
		var types = this.renderModel && this.renderModel.types;
		if (!types) { return null; }
		for (var t in types) {
			if (Object.prototype.hasOwnProperty.call(types, t)) {
				var hh = types[t].handles && types[t].handles[label];
				if (hh && hh.url) { return hh.url; }
			}
		}
		return null;
	};

	App.prototype.categoryOf = function (label) {
		var map = this.categories && this.categories[this.activeType()];
		return (map && map[label]) || null;
	};

	// ---- Enquiry form (rendered in the body so the door preview stays visible) -----
	App.prototype.renderForm = function () {
		this.body.innerHTML = '';
		this.body.appendChild(el('div', 'hd-dd__steptitle', I18N.formTitle || 'Get your free quote'));
		this.body.appendChild(el('div', 'hd-dd__form-reassure',
			I18N.reassure || 'Free and no-obligation — no payment now. We just need a few details to send your tailored quote.'));
		if (!this._formEl) { this._formEl = this.buildForm(); }
		this.body.appendChild(this._formEl);
	};

	// The post-submission screen — shown while the customer is most engaged. Confirms,
	// points to the revisit link, frames price, and invites another design.
	App.prototype.renderSuccess = function (result) {
		var self = this;
		this.setPhase('done'); // a self-contained, centred terminal screen (no sticky preview)
		this.body.innerHTML = '';
		var wrap = el('div', 'hd-dd__thanks');
		// Their designed door, inline at the top — a confirmation visual that reads top-to-bottom
		// (the wizard's sticky preview is hidden in this phase, so nothing is cut off).
		if (this._designImage) {
			var pic = el('img', 'hd-dd__thanks-img');
			pic.src = this._designImage;
			pic.alt = 'Your door design';
			wrap.appendChild(pic);
		}
		wrap.appendChild(el('div', 'hd-dd__thanks-title', 'Thank you — your design is on its way to us.'));
		wrap.appendChild(el('div', 'hd-dd__thanks-text',
			'We’ll be in touch shortly with your free, no-obligation quote — usually within one working day. We’ve also emailed you a copy with a link to revisit or tweak this design.'));
		wrap.appendChild(el('div', 'hd-dd__thanks-price',
			'As a guide, a fully fitted composite door installed by qualified fitters typically ranges from £1,000 to £4,000 depending on the options you choose.'));

		var again = el('button', 'hd-dd__thanks-again', 'Design another door');
		again.type = 'button';
		again.addEventListener('click', function () { self.designAnother(); });
		wrap.appendChild(again);
		wrap.appendChild(el('div', 'hd-dd__thanks-note', 'Quoting for more than one door? Design the next one now — we already have your details.'));

		// A reliable, bookmarkable revisit link (works even if the email doesn't arrive).
		if (result && result.token) {
			var link = el('a', 'hd-dd__thanks-link', 'Revisit this design');
			link.href = window.location.origin + window.location.pathname + '?design=' + encodeURIComponent(result.token);
			wrap.appendChild(link);
		}

		this.body.appendChild(wrap);
		this.backBtn.hidden = true;
		this.continueBtn.hidden = true;
		// Land at the top so the whole message reads from "Thank you" — not part-scrolled.
		try { this.root.scrollIntoView({ block: 'start' }); } catch (e) { /* older browsers */ }
	};

	// "Design another door" — fresh wizard, but keep the entered contact details (the form
	// pre-fills from them) so a second/third quote is quick.
	App.prototype.designAnother = function () {
		this.wiz = HD_DD_Wizard.create(this.customerView, HD_DD_StepConfig);
		this._lastKey = null;
		this._atForm = false;
		this._frameGroup = null;
		this._reloadNote = null;
		this._formEl = null; // rebuild so the form pre-fills from _lastContact
		this.render();
		try { this.root.scrollIntoView({ block: 'start' }); } catch (e) { /* older browsers */ }
	};

	App.prototype.buildForm = function () {
		var self = this;
		var form = document.createElement('form');
		form.id = 'hd-dd-form';
		form.className = 'hd-dd__form';
		form.setAttribute('novalidate', 'novalidate');

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
			// Pre-fill from the previous submission so "Design another door" is quick.
			if (self._lastContact && self._lastContact[fld.name] != null) { input.value = self._lastContact[fld.name]; }
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

		var submit = el('button', 'hd-dd__submit', I18N.submit || 'Send my free quote request');
		submit.type = 'submit';
		form.appendChild(submit);
		form.appendChild(el('div', 'hd-dd__form-trust',
			I18N.trust || 'No spam, ever — your details are only used to prepare your quote.'));
		form.appendChild(el('div', 'hd-dd__form-status'));
		var statusEl = form.querySelector('.hd-dd__form-status');
		statusEl.setAttribute('role', 'status');
		statusEl.setAttribute('aria-live', 'polite');

		form.addEventListener('submit', function (e) { e.preventDefault(); self.submit(form); });
		return form;
	};

	App.prototype.submit = function (form) {
		var self = this;
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
			design: cleanDesign(this.wiz.state().design),
			// The designer's own page (no query) — the server validates it's same-origin and
			// builds the "revisit your design" email link from it.
			pageUrl: window.location.origin + window.location.pathname
		};

		// Capture what the door actually LOOKS like so the request for quote carries the image,
		// not just the spec. Production serves the layers same-origin (the proxy) so the canvas
		// exports cleanly; guard anyway so a stray cross-origin layer can never block a submit.
		var snapshot = this.snapshotDoor();
		if (snapshot) { data.image = snapshot; }
		this._designImage = snapshot || null; // shown on the thank-you screen

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
				self.track('door_quote_submitted'); // the conversion event — the whole funnel's goal
				// Keep their details so "Design another door" doesn't make them re-type.
				self._lastContact = { name: data.name, telephone: data.telephone, email: data.email, postcode: data.postcode };
				self.renderSuccess(res.body);
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
			var app = new App(root, cv, rm, res[2]);
			// ?design=<token> reloads a previously saved design (the "revisit" email link).
			var saved = null;
			try { saved = new URLSearchParams(window.location.search).get('design'); } catch (e) { saved = null; }
			if (saved) { app.loadSavedDesign(saved); } else { app.render(); }
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
