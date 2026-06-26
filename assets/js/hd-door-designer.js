/*
 * HD Door Designer — front-end app controller.
 * ------------------------------------------------------------------
 * Mounts into [data-hd-door-designer], fetches the compact customer catalogue
 * over REST, drives the cascading 12-field picker (with the per-type rules), and
 * ends in the enquiry form which POSTs the design (keyed by exact Endurance
 * headings) back to the plugin.
 *
 * The visual door preview (faithful layer compositing) is wired separately once
 * the upgraded extractor's layer model is in — renderPreview() is the seam.
 */
(function () {
	'use strict';

	var CFG = window.HD_DD_CONFIG || {};
	var I18N = CFG.i18n || {};

	// Cascade step order. `heading` is the exact Endurance field key (or a token
	// resolved per type). Steps render only when visible() passes for the type.
	var STEPS = [
		{ key: 'type', heading: 'Door Type', label: 'Door type' },
		{ key: 'frame', heading: 'Frame Design', label: 'Frame shape', visible: function (c) { return c.flags.hasFrameShape; } },
		{ key: 'style', heading: 'Door Design', label: 'Door style' },
		{ key: 'extColour', heading: 'Door Colour (External)', label: 'Door colour' },
		{ key: 'intColour', heading: 'Door Colour (Internal)', label: 'Internal colour', visible: function (c) { return c.flags.hasInternalColour; } },
		{ key: 'sidelightType', heading: 'Sidelight Type', label: 'Sidelight', source: 'sidelightType', visible: function (c) { return c.sidelit; } },
		{ key: 'sidelightGlass', heading: 'Sidelight Glass', label: 'Sidelight glass', source: 'sidelightGlass', visible: function (c) { return c.sidelit; } },
		{ key: 'glazing', heading: 'Door Glass', label: 'Glazing', source: 'glazing' },
		{ key: 'hinge', heading: '__hinge__', label: 'Hinge side' },
		{ key: 'frameColour', heading: 'Frame Colour', label: 'Frame colour' },
		{ key: 'hardware', heading: 'Hardware Type', label: 'Hardware colour' },
		{ key: 'handle', heading: 'Handle', label: 'Handle' },
		{ key: 'letterplate', heading: 'Letterplate', label: 'Letter plate' },
		{ key: 'knocker', heading: 'Knocker', label: 'Knocker', source: 'knocker', visible: function (c) { return c.flags.hasKnocker; } }
	];

	function el(tag, attrs, children) {
		var node = document.createElement(tag);
		attrs = attrs || {};
		Object.keys(attrs).forEach(function (k) {
			if (k === 'class') { node.className = attrs[k]; }
			else if (k === 'text') { node.textContent = attrs[k]; }
			else if (attrs[k] === true) { node.setAttribute(k, k); }
			else if (attrs[k] !== false && attrs[k] != null) { node.setAttribute(k, attrs[k]); }
		});
		(children || []).forEach(function (c) { if (c) { node.appendChild(c); } });
		return node;
	}

	function api(path, opts) {
		opts = opts || {};
		opts.headers = Object.assign({ 'Content-Type': 'application/json', 'X-WP-Nonce': CFG.nonce }, opts.headers || {});
		return fetch(CFG.restUrl + path, opts).then(function (r) {
			return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
		});
	}

	function App(root) {
		this.root = root;
		this.catalogue = null;      // customer view { types, byType }
		this.state = { design: {} }; // heading -> { label, id }
	}

	App.prototype.start = function () {
		var self = this;
		Promise.all([
			api('catalogue'),
			api('render-model').catch(function () { return { ok: false }; })
		]).then(function (r) {
			var cat = r[0], rm = r[1];
			if (!cat.ok || !cat.body || !cat.body.available || !cat.body.catalogue) {
				self.renderUnavailable();
				return;
			}
			self.catalogue = cat.body.catalogue;
			self.renderModel = (rm && rm.ok && rm.body && rm.body.available) ? rm.body.model : null;
			self.renderShell();
			var seed = self.root.getAttribute('data-door-type');
			self.selectType(seed && self.typeNode(seed) ? seed : self.catalogue.types[0]);
		}).catch(function () { self.renderUnavailable(); });
	};

	App.prototype.renderUnavailable = function () {
		this.root.innerHTML = '';
		this.root.appendChild(el('div', { class: 'hd-dd__notice', text: I18N.notLoaded || 'The door designer is being set up.' }));
	};

	// --- Catalogue accessors -------------------------------------------------
	App.prototype.typeNode = function (type) {
		return this.catalogue.byType && this.catalogue.byType[type] ? this.catalogue.byType[type] : null;
	};
	App.prototype.activeType = function () {
		return this.state.design['Door Type'] ? this.state.design['Door Type'].label : '';
	};
	App.prototype.selectedLabel = function (heading) {
		return this.state.design[heading] ? this.state.design[heading].label : '';
	};

	// Resolve the choices + actual heading for a step, given the active type.
	App.prototype.resolveStep = function (step) {
		var type = this.activeType();
		var node = this.typeNode(type);
		if (!node) { return null; }

		var heading = step.heading;
		var choices = null;

		if (step.source === 'glazing') {
			var style = this.selectedLabel('Door Design');
			if (style && node.glazingByStyle && node.glazingByStyle[style]) { choices = node.glazingByStyle[style]; }
			else if (node.fields['Door Glass']) { choices = node.fields['Door Glass']; }
		} else if (step.source === 'knocker') {
			// Per-style knocker availability (empty for styles like Kit/Sanford Georgian);
			// falls back to the full list until the per-style data is captured.
			var kstyle = this.selectedLabel('Door Design');
			if (kstyle && node.knockerByStyle && node.knockerByStyle[kstyle]) { choices = node.knockerByStyle[kstyle]; }
			else if (node.fields['Knocker']) { choices = node.fields['Knocker']; }
		} else if (step.source === 'sidelightType' || step.source === 'sidelightGlass') {
			choices = node.sidelights ? node.sidelights[step.source] : null;
		} else if (heading === '__hinge__') {
			heading = node.hingeSideField || 'Door Hinged On';
			choices = node.fields[heading];
		} else {
			choices = node.fields[heading];
		}

		return choices && choices.length ? { heading: heading, choices: choices } : null;
	};

	// Context flags used by step.visible().
	App.prototype.stepContext = function () {
		var node = this.typeNode(this.activeType()) || {};
		var shape = this.selectedLabel('Frame Design');
		return {
			flags: {
				hasFrameShape: !!node.hasFrameShape,
				hasInternalColour: !!node.hasInternalColour,
				hasKnocker: !!node.hasKnocker
			},
			sidelit: !!node.hasFrameShape && /sidelight|half flag/i.test(shape || '')
		};
	};

	// --- Render --------------------------------------------------------------
	App.prototype.renderShell = function () {
		this.root.innerHTML = '';
		var layout = el('div', { class: 'hd-dd__layout' });

		var stage = el('div', { class: 'hd-dd__stage' });
		if (this.renderModel && window.HD_DD_Preview) {
			this.canvas = el('canvas', { class: 'hd-dd__canvas' });
			stage.appendChild(this.canvas);
			this.compositor = window.HD_DD_Preview.create(this.canvas, {
				model: this.renderModel,
				assetBase: CFG.assetBase || this.renderModel._assetBase || ''
			});
		}
		this.previewEl = el('div', { class: 'hd-dd__preview' });
		stage.appendChild(this.previewEl);

		var panel = el('div', { class: 'hd-dd__panel' });
		this.stepsEl = el('div', { class: 'hd-dd__steps' });
		panel.appendChild(this.stepsEl);
		panel.appendChild(this.buildCta());

		layout.appendChild(stage);
		layout.appendChild(panel);
		this.root.appendChild(layout);
		this.root.appendChild(this.buildFormShell());
	};

	App.prototype.selectType = function (type) {
		var node = this.typeNode(type);
		if (!node) { return; }
		var typeChoice = (node.fields['Door Type'] || []).filter(function (c) { return c.label === type; })[0]
			|| { label: type, id: null };
		this.state.design = {}; // changing type resets the whole design.
		this.state.design['Door Type'] = { label: typeChoice.label, id: typeChoice.id };
		this.renderSteps();
	};

	App.prototype.renderSteps = function () {
		var self = this;
		this.stepsEl.innerHTML = '';
		var ctx = this.stepContext();

		STEPS.forEach(function (step) {
			if (step.visible && !step.visible(ctx)) { return; }
			var resolved = self.resolveStep(step);
			if (!resolved) { return; }
			self.stepsEl.appendChild(self.renderField(step, resolved.heading, resolved.choices));
		});

		this.renderPreview();
	};

	App.prototype.renderField = function (step, heading, choices) {
		var self = this;
		var wrap = el('fieldset', { class: 'hd-dd__field', 'data-step': step.key });
		wrap.appendChild(el('legend', { class: 'hd-dd__field-legend', text: step.label }));
		var grid = el('div', { class: 'hd-dd__choices' });

		choices.forEach(function (choice) {
			var selected = self.selectedLabel(heading) === choice.label;
			var btn = el('button', {
				type: 'button',
				class: 'hd-dd__choice' + (selected ? ' is-selected' : ''),
				'aria-pressed': selected ? 'true' : 'false',
				title: choice.label
			});
			btn.appendChild(el('span', { class: 'hd-dd__choice-label', text: choice.label }));
			btn.addEventListener('click', function () { self.select(step, heading, choice); });
			grid.appendChild(btn);
		});

		wrap.appendChild(grid);
		return wrap;
	};

	App.prototype.select = function (step, heading, choice) {
		if (step.key === 'type') { this.selectType(choice.label); return; }

		this.state.design[heading] = { label: choice.label, id: choice.id != null ? choice.id : null };

		// Style change invalidates glazing (per-style lists) and may drop a knocker
		// the new style doesn't offer.
		if (step.key === 'style') {
			delete this.state.design['Door Glass'];
			this.pruneKnocker(choice.label);
		}
		// Frame-shape change may hide sidelight steps → drop stale sidelight picks.
		if (step.key === 'frame' && !/sidelight|half flag/i.test(choice.label)) {
			delete this.state.design['Sidelight Type'];
			delete this.state.design['Sidelight Glass'];
		}
		this.renderSteps();
	};

	// Drop a selected knocker if the newly chosen style doesn't offer it.
	App.prototype.pruneKnocker = function (styleLabel) {
		var node = this.typeNode(this.activeType());
		var list = node && node.knockerByStyle ? node.knockerByStyle[styleLabel] : null;
		var cur = this.state.design['Knocker'];
		if (list && cur && !list.some(function (k) { return k.label === cur.label; })) {
			delete this.state.design['Knocker'];
		}
	};

	// --- Preview (interim: design summary; swapped for the compositor later) ---
	App.prototype.renderPreview = function () {
		// Paint the composited door (if the render model + assets are available).
		if (this.compositor) {
			try { this.compositor.render(this.activeType(), this.state.design); } catch (e) { /* keep the summary */ }
		}
		if (!this.previewEl) { return; }
		this.previewEl.innerHTML = '';
		this.previewEl.appendChild(el('div', { class: 'hd-dd__preview-note', text: 'Your design' }));

		var list = el('dl', { class: 'hd-dd__summary' });
		var self = this;
		STEPS.forEach(function (step) {
			var resolved = self.resolveStep(step);
			var heading = resolved ? resolved.heading : step.heading;
			var val = self.selectedLabel(heading);
			if (!val) { return; }
			list.appendChild(el('dt', { text: step.label }));
			list.appendChild(el('dd', { text: val }));
		});
		this.previewEl.appendChild(list);
	};

	// --- CTA + enquiry form --------------------------------------------------
	App.prototype.buildCta = function () {
		var cta = el('button', { type: 'button', class: 'hd-dd__cta', text: I18N.enquire || 'Enquire about this door' });
		cta.addEventListener('click', function () {
			var form = document.getElementById('hd-dd-form');
			if (form) { form.hidden = false; form.scrollIntoView({ behavior: 'smooth' }); }
		});
		return cta;
	};

	App.prototype.buildFormShell = function () {
		var self = this;
		var form = el('form', { id: 'hd-dd-form', class: 'hd-dd__form', hidden: true, novalidate: true });
		form.appendChild(el('h3', { class: 'hd-dd__form-title', text: I18N.enquire || 'Enquire about this door' }));

		[
			{ name: 'name', label: 'Name', type: 'text', autocomplete: 'name' },
			{ name: 'telephone', label: 'Telephone', type: 'tel', autocomplete: 'tel' },
			{ name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
			{ name: 'postcode', label: 'Post code', type: 'text', autocomplete: 'postal-code' }
		].forEach(function (f) {
			var row = el('label', { class: 'hd-dd__form-row' });
			row.appendChild(el('span', { class: 'hd-dd__form-label', text: f.label }));
			row.appendChild(el('input', { class: 'hd-dd__form-input', type: f.type, name: f.name, autocomplete: f.autocomplete, required: true }));
			row.appendChild(el('span', { class: 'hd-dd__form-error', 'data-error-for': f.name }));
			form.appendChild(row);
		});

		form.appendChild(el('input', { type: 'text', name: 'hd_hp', tabindex: '-1', autocomplete: 'off', class: 'hd-dd__hp', 'aria-hidden': 'true' }));

		var consentRow = el('label', { class: 'hd-dd__consent' });
		consentRow.appendChild(el('input', { type: 'checkbox', name: 'consent', required: true }));
		consentRow.appendChild(el('span', { text: I18N.consent || 'I agree to be contacted about this enquiry.' }));
		form.appendChild(consentRow);

		form.appendChild(el('button', { type: 'submit', class: 'hd-dd__submit', text: I18N.enquire || 'Send enquiry' }));
		form.appendChild(el('div', { class: 'hd-dd__form-status', role: 'status', 'aria-live': 'polite' }));

		form.addEventListener('submit', function (e) { e.preventDefault(); self.submit(form); });
		return form;
	};

	App.prototype.submit = function (form) {
		var self = this;
		var statusEl = form.querySelector('.hd-dd__form-status');
		var submitBtn = form.querySelector('.hd-dd__submit');
		var f = form.elements; // access named controls safely (form.name is shadowed by the form's own name).
		var data = {
			name: f['name'].value,
			telephone: f['telephone'].value,
			email: f['email'].value,
			postcode: f['postcode'].value,
			consent: f['consent'].checked,
			hd_hp: f['hd_hp'].value,
			design: this.state.design
		};
		statusEl.textContent = '…';
		submitBtn.disabled = true;

		api('enquiry', { method: 'POST', body: JSON.stringify(data) }).then(function (res) {
			submitBtn.disabled = false;
			if (res.ok && res.body && res.body.ok) {
				form.innerHTML = '';
				form.appendChild(el('div', { class: 'hd-dd__success', text: res.body.message || 'Thank you — your design has been sent.' }));
				return;
			}
			form.querySelectorAll('.hd-dd__form-error').forEach(function (n) { n.textContent = ''; });
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

	document.addEventListener('DOMContentLoaded', function () {
		var roots = document.querySelectorAll('[data-hd-door-designer]');
		Array.prototype.forEach.call(roots, function (root) { new App(root).start(); });
	});
})();
