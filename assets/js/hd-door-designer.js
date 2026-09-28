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
 *   HD_DD_ApiClient     — REST client (JSON headers, nonce, stale-nonce self-heal)
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

	// Funnel reporter (site-wide hdAnalytics). The WP dependency chain guarantees the
	// module is loaded; the QA harness may omit its script tag, so fall back to a no-op.
	var Funnel = window.HD_DD_Funnel || { step: function () {}, lead: function () {} };

	var Shared = window.HD_DD_Shared;
	var HARDWARE_HEX = Shared.HARDWARE_HEX;

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

	// ---- Option silhouettes -------------------------------------------------
	// Small, code-generated line drawings (shared hd-dd__sil-* palette) so text-only choices
	// — frame shape, glazed/solid sides, hinge/leaf side, letterplate position — read as
	// pictures, not just words. viewBox coordinates are schematic, not to scale.
	function silRound(n) { return Math.round(n * 10) / 10; }
	function silRect(c, X, Y, W, H, R) { return '<rect class="' + c + '" x="' + silRound(X) + '" y="' + silRound(Y) + '" width="' + silRound(W) + '" height="' + silRound(H) + '" rx="' + R + '"/>'; }
	function silLine(c, X1, Y1, X2, Y2) { return '<line class="' + c + '" x1="' + silRound(X1) + '" y1="' + silRound(Y1) + '" x2="' + silRound(X2) + '" y2="' + silRound(Y2) + '"/>'; }
	function silCircle(c, CX, CY, R) { return '<circle class="' + c + '" cx="' + silRound(CX) + '" cy="' + silRound(CY) + '" r="' + R + '"/>'; }

	// Frame-shape silhouette — generated from the option label so the customer sees the layout
	// (side panels, a window above, half-height "flag" panels) instead of guessing from words.
	// opts.sideFill 'solid' draws the side panels closed (for the glazed-vs-solid step) rather
	// than glazed; the window above is always glazed. Uses the same hd-dd__sil-* classes as the
	// type silhouettes so the drawing style matches.
	function frameSil(label, opts) {
		var l = String(label || '');
		var sideCls = (opts && opts.sideFill === 'solid') ? 'hd-dd__sil-solid' : 'hd-dd__sil-glass';
		var both = /double|both/i.test(l), left = both || /left/i.test(l), right = both || /right/i.test(l);
		var half = /half flag/i.test(l), midrail = /midrail/i.test(l), toplight = /toplight/i.test(l);
		var doorW = 40, panelW = 15, gap = 3, doorH = 92, topH = 18, m = 8;
		var lp = left ? (panelW + gap) : 0, rp = right ? (panelW + gap) : 0;
		var innerW = lp + doorW + rp, innerH = (toplight ? topH + gap : 0) + doorH;
		var x = m, y = m, doorTopY = y + (toplight ? topH + gap : 0), doorX = x + lp;
		var s = ['<svg viewBox="0 0 ' + silRound(innerW + m * 2) + ' ' + silRound(innerH + m * 2) + '" class="hd-dd__sil" aria-hidden="true">'];
		s.push(silRect('hd-dd__sil-frame', x - 4, y - 4, innerW + 8, innerH + 8, 3));
		if (toplight) { s.push(silRect('hd-dd__sil-glass', x, y, innerW, topH, 1.5)); }
		if (left) { var lh = half ? doorH * 0.55 : doorH; s.push(silRect(sideCls, x, doorTopY + (doorH - lh), panelW, lh, 1.5));
			if (midrail && !half) { s.push(silLine('hd-dd__sil-line', x, doorTopY + doorH * 0.5, x + panelW, doorTopY + doorH * 0.5)); } }
		s.push(silRect('hd-dd__sil-panel', doorX, doorTopY, doorW, doorH, 2));
		s.push(silLine('hd-dd__sil-line', doorX + 6, doorTopY + doorH * 0.42, doorX + doorW - 6, doorTopY + doorH * 0.42));
		s.push(silRect('hd-dd__sil-handle', doorX + doorW - 8, doorTopY + doorH * 0.5, 4.5, 15, 2.2));
		if (right) { var rx = doorX + doorW + gap, rh = half ? doorH * 0.55 : doorH; s.push(silRect(sideCls, rx, doorTopY + (doorH - rh), panelW, rh, 1.5));
			if (midrail && !half) { s.push(silLine('hd-dd__sil-line', rx, doorTopY + doorH * 0.5, rx + panelW, doorTopY + doorH * 0.5)); } }
		s.push('</svg>');
		return s.join('');
	}
	// The three top-level frame groups map to a representative shape.
	function groupSil(group) {
		var rep = /window above/i.test(group) ? 'Toplight' : (/side panels/i.test(group) ? 'Double Sidelight' : 'No Sidelights');
		return frameSil(rep);
	}

	// Hinge / master-leaf side.
	//  • Double doors (opts.isDouble): show the master (handle) leaf and the other leaf bolted
	//    top + bottom, mirrored with the SAME shouldFlip result the canvas uses (opts.flip) so the
	//    tile and the live preview can never disagree about which leaf carries the handle.
	//  • Single doors: just mark the hinge knuckles on the chosen edge (opts.hingeRight). No handle
	//    is drawn — the live preview shows the handle, and a sidelit door's handle side is fixed by
	//    the frame (shouldFlip ignores the hinge), so drawing one here could contradict the render.
	function hingeSil(opts) {
		var W = 104, H = 132, inner;
		if (opts.isDouble) {
			inner = silRect('hd-dd__sil-frame', 10, 8, 84, 116, 3)
				+ silLine('hd-dd__sil-frame', 52, 10, 52, 122)
				+ silRect('hd-dd__sil-panel', 16, 16, 30, 100, 2)
				+ silRect('hd-dd__sil-panel', 58, 16, 30, 100, 2)
				+ silRect('hd-dd__sil-handle', 45, 58, 4.5, 18, 2.2)
				+ silCircle('hd-dd__sil-bolt', 73, 22, 2.4)
				+ silCircle('hd-dd__sil-bolt', 73, 110, 2.4);
			var body = opts.flip ? '<g transform="translate(' + W + ',0) scale(-1,1)">' + inner + '</g>' : inner;
			return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="hd-dd__sil" aria-hidden="true">' + body + '</svg>';
		}
		var kx = opts.hingeRight ? 72 : 28; // knuckle column on the chosen hinge edge
		inner = silRect('hd-dd__sil-frame', 27, 8, 50, 116, 3)
			+ silRect('hd-dd__sil-panel', 34, 16, 36, 100, 2)
			+ silLine('hd-dd__sil-line', 40, 54, 64, 54)
			+ silLine('hd-dd__sil-line', 40, 78, 64, 78)
			+ silRect('hd-dd__sil-hinge', kx - 2, 24, 4, 11, 1)
			+ silRect('hd-dd__sil-hinge', kx - 2, 60, 4, 11, 1)
			+ silRect('hd-dd__sil-hinge', kx - 2, 96, 4, 11, 1);
		return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="hd-dd__sil" aria-hidden="true">' + inner + '</svg>';
	}

	// Letterplate position — a plain door with the letterbox slot drawn at the middle or the
	// bottom rail, so "Middle vs Bottom" is a picture rather than a guess.
	function letterplatePosSil(label) {
		var slotY = /bottom/i.test(String(label || '')) ? 104 : 64;
		return '<svg viewBox="0 0 104 132" class="hd-dd__sil" aria-hidden="true">'
			+ silRect('hd-dd__sil-frame', 27, 8, 50, 116, 3)
			+ silRect('hd-dd__sil-panel', 34, 16, 36, 100, 2)
			+ silLine('hd-dd__sil-line', 39, 40, 65, 40)
			+ silRect('hd-dd__sil-plate', 40, slotY, 24, 7, 2)
			+ '</svg>';
	}

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	// REST plumbing (JSON headers, nonce, stale-nonce self-heal) lives in HD_DD_ApiClient.
	// The QA harness may omit its script tag — it has no REST endpoint to call anyway.
	var client = window.HD_DD_ApiClient ? window.HD_DD_ApiClient.create({ restUrl: CFG.restUrl || '', nonce: CFG.nonce }) : null;
	function api(path, opts) {
		if (!client) { return Promise.reject(new Error('HD_DD_ApiClient is not loaded')); }
		return client.request(path, opts);
	}

	// ---- App ----------------------------------------------------------------
	function App(root, customerView, renderModel, categories) {
		this.root = root;
		this.customerView = customerView;
		this.renderModel = renderModel || null;
		this.categories = categories || null;
		Shared.enrichCustomerView(customerView, renderModel);
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

		// No point showing a door preview before a style is chosen — the frame + style steps use
		// the full width for their (now visual) option tiles. From the next step on the preview returns.
		var showPreview = st.atReview || (!!design['Door Design'] && key !== 'style' && key !== 'frame');
		this.canvas.hidden = !showPreview;
		if (this.layoutEl) { this.layoutEl.classList.toggle('hd-dd__app--nopreview', !showPreview); }

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
		// The two choice-less funnel steps fire on arrival (the internal 'form' view is
		// reported as 'details'); wizard steps fire on advance instead — see advance().
		if (viewKey === 'review') { Funnel.step('review'); }
		else if (viewKey === 'form') { Funnel.step('details'); }
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
			t.addEventListener('click', function () { self.onSelect('Door Type', { label: label }); });
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

	// Funnel tracking (Microsoft Clarity, if installed) — fire a custom event per view so
	// you can see exactly which step loses people. Best-effort: a no-op if Clarity is absent.
	App.prototype.track = function (name) {
		try { if (typeof window.clarity === 'function') { window.clarity('event', name); } } catch (e) { /* analytics is best-effort */ }
	};

	// ---- Context objects handed to the renderers ----------------------------
	// Furniture ↔ finish compatibility lives in HD_DD_Shared (design-shared.js): Endurance
	// filters handles/letterplates by finish, so a tile is greyed when the pair isn't orderable.
	App.prototype.tileDisabledReason = function (step, choice) {
		return Shared.disabledReason(this.renderModel, this.activeType(), this.wiz.state().design, step.key, choice.label);
	};

	// When the finish changes, drop a now-incompatible handle or letterplate so the preview never
	// shows an item the chosen finish doesn't offer — the customer re-picks (incompatible ones greyed).
	App.prototype.resetFurnitureIfIncompatible = function () {
		Shared.resetFurnitureIfIncompatible(this.renderModel, this.activeType(), this.wiz.state().design);
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
			groupSil: function (group) { return groupSil(group); },
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
		// The type chooser auto-advances (no Continue), so its funnel event fires here.
		if (heading === 'Door Type') { Funnel.step('type', choice.label); this.wiz.selectType(choice.label); this.render(); return; }

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
			// Report the step being left, with the choice (picked or default-accepted)
			// that carries the visitor forward. Steps merely viewed report nothing —
			// that gap is the funnel's drop-off signal.
			if (!st.atReview) {
				var stepLeft = st.steps[st.stepIndex];
				if (stepLeft) { Funnel.step(stepLeft.key, (st.design[stepLeft.heading] || {}).label); }
			}
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
		// Frame shape (side panels / window above) — a generated silhouette of the layout.
		if (step.key === 'frame') {
			return { kind: 'svg', svg: frameSil(choice.label) };
		}
		// Glazed-vs-solid side panels — the actual frame shape, drawn glazed or closed. Endurance
		// labels the closed option "Unglazed" (some catalogues "Solid"); match both.
		if (step.key === 'sidelightType') {
			var frameLabel = (this.wiz.state().design['Frame Design'] || {}).label || 'Double Sidelight';
			return { kind: 'svg', svg: frameSil(frameLabel, { sideFill: /solid|unglaz/i.test(choice.label) ? 'solid' : 'glass' }) };
		}
		// Letterplate position — the slot drawn at the middle or the bottom rail.
		if (step.key === 'letterplatePosition') {
			return { kind: 'svg', svg: letterplatePosSil(choice.label) };
		}
		// Hinge / master-leaf side.
		if (step.key === 'hinge') {
			if (this.activeType() === 'Double Door') {
				// Mirror the leaf drawing with the exact flip the canvas will use, so the tile and
				// the live preview always agree on which leaf carries the handle.
				var hd = this.wiz.state().design, probe = {};
				for (var pk in hd) { if (Object.prototype.hasOwnProperty.call(hd, pk)) { probe[pk] = hd[pk]; } }
				probe[step.heading] = choice;
				var flip = !!(window.HD_DD_RenderModel && this.renderModel &&
					window.HD_DD_RenderModel.shouldFlip(this.renderModel, this.activeType(), probe));
				return { kind: 'svg', svg: hingeSil({ isDouble: true, flip: flip }) };
			}
			return { kind: 'svg', svg: hingeSil({ isDouble: false, hingeRight: /right/i.test(choice.label || '') }) };
		}
		var base = this.assetBase();
		var T = (this.renderModel && this.renderModel.types) ? this.renderModel.types[this.activeType()] : null;
		if (!base || !T) { return null; }

		var BLANKS = '/Assets/CompositeDoors/Images/DoorBlanks/';
		function img(url) { return { kind: 'img', url: encodeURI(url) }; }

		if (step.key === 'style') {
			// Double doors show every design as a composited tile (blank + grey "no glass" apertures,
			// both leaves) so the design is obvious — the bare blank alone can't tell two designs on
			// the same mould apart. Other types keep the lightweight single blank thumbnail.
			if (this.activeType() === 'Double Door' && window.HD_DD_RenderModel) {
				var dd = { 'Door Type': { label: 'Double Door' }, 'Door Design': { label: choice.label }, 'Door Colour (External)': { label: T.baselineColour } };
				var raw = window.HD_DD_RenderModel.assemble(this.renderModel, 'Double Door', dd);
				var maxX = 0, maxY = 0;
				var layers = raw.map(function (l) {
					maxX = Math.max(maxX, (l.cx || 0) + (l.w || 0) / 2);
					maxY = Math.max(maxY, (l.cy || 0) + (l.h || 0) / 2);
					return { url: l.url.replace(/(DoorCassettes\/[^/]+\/Thumbnails\/)[^/]+(\.png)/, '$1NoGlass$2'), cx: l.cx, cy: l.cy, w: l.w, h: l.h, rotation: l.rotation || 0, flipH: !!l.flipH };
				});
				return { kind: 'layers', base: base, stage: { width: Math.ceil(maxX) || 294, height: Math.ceil(maxY) || 318 }, layers: layers };
			}
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
		if (step.key === 'sidelightGlass') {
			var gt2 = this.renderModel && this.renderModel.glassThumbs;
			// "Matches the door" (id null) — show the door's own chosen glass, since that's what
			// the decorative side panels mirror. Otherwise show the obscure/privacy glass pattern.
			if (choice.id == null) {
				var dg = this.wiz.state().design['Door Glass'];
				var dgKey = dg && gt2 && gt2[dg.label];
				if (dg && dgKey) { return img(base + '/Assets/CompositeDoors/Images/DoorGlazing/' + dg.label + '/Thumbnails/' + dgKey + '.png'); }
				return { kind: 'svg', svg: frameSil('Double Sidelight') };
			}
			var sgKey = gt2 && gt2[choice.label];
			if (sgKey) { return img(base + '/Assets/CompositeDoors/Images/DoorGlazing/' + choice.label + '/Thumbnails/' + sgKey + '.png'); }
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
		// type → drawn by the page-1 chooser, not here.
		return null;
	};

	App.prototype.handleImageFromAnyType = function (label) {
		return Shared.handleImageFromAnyType(this.renderModel, label);
	};

	App.prototype.categoryOf = function (label) {
		var map = this.categories && this.categories[this.activeType()];
		return (map && map[label]) || null;
	};

	// ---- Enquiry (form, submit, thank-you) — shared with the swipe flow via HD_DD_Enquiry ----
	App.prototype.enquiryCtl = function () {
		var self = this;
		if (!this._enquiry) {
			this._enquiry = window.HD_DD_Enquiry.create({
				api: api, cfg: CFG, i18n: I18N, funnel: Funnel,
				getDesign: function () { return self.wiz.state().design; },
				getCanvas: function () { return self.canvas; },
				track: function (name) { self.track(name); },
				experiment: function () { return self.experiment || null; },
				onSuccess: function (result) { self.renderSuccess(result); }
			});
		}
		return this._enquiry;
	};

	App.prototype.renderForm = function () { this.enquiryCtl().renderForm(this.body); };

	// The post-submission screen — a self-contained, centred terminal screen (no sticky preview).
	App.prototype.renderSuccess = function (result) {
		var self = this;
		this.setPhase('done');
		this.enquiryCtl().renderSuccess(this.body, result, function () { self.designAnother(); });
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
		this.enquiryCtl().reset();
		this.render();
		try { this.root.scrollIntoView({ block: 'start' }); } catch (e) { /* older browsers */ }
	};

	// Started by boot.js (which loads the data and decides which flow a visitor gets); also
	// constructed directly by the QA harness.
	window.HD_DD_App = App;
})();
