// assets/js/enquiry.js
// The "save my design & get my price" form, submit, thank-you screen and door snapshot —
// used by the swipe flow. The swipe flow now draws its form with swipe/review-save.js and uses this module for the door snapshot and the thank-you screen; the form below is kept only until it is removed in a follow-up. (The classic flow is the A/B control and keeps the original quote
// form in enquiry-quote.js.) A save is an enquiry: it is stored, emailed to us, and counts as a lead.
//
//   var enq = HD_DD_Enquiry.create({
//     api, cfg, i18n,
//     getDesign(),        // the design map to submit (UI-only "_" keys are stripped here)
//     getCanvas(),        // the composited door canvas to snapshot (or null)
//     funnel,             // HD_DD_Funnel instance — lead() fires on a successful save
//     track(name),        // Clarity event
//     experiment(),       // {experimentId, visitorId, arm} or null
//     onSuccess(result)   // called after a successful save
//   });
//   enq.renderForm(container); enq.renderSuccess(container, result, onAgain); enq.reset();
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_Enquiry = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	function cleanDesign(design) {
		var out = {};
		Object.keys(design).forEach(function (h) { if (h.charAt(0) !== '_') { out[h] = design[h]; } });
		return out;
	}

	// A PNG snapshot of the composited door for the enquiry — downscaled to a sensible width
	// and flattened onto the stage colour so it reads in any email client. null if the canvas
	// is empty or cross-origin-tainted: the spec is submitted without an image rather than block.
	function snapshot(cv) {
		if (!cv || !cv.width || !cv.height) { return null; }
		try {
			var scale = Math.min(1, 480 / cv.width);
			var out = document.createElement('canvas');
			out.width = Math.round(cv.width * scale);
			out.height = Math.round(cv.height * scale);
			var ctx = out.getContext('2d');
			ctx.fillStyle = '#f3f3f1';
			ctx.fillRect(0, 0, out.width, out.height);
			ctx.drawImage(cv, 0, 0, out.width, out.height);
			return out.toDataURL('image/png');
		} catch (e) { return null; }
	}

	// Display order. Phone is last and optional; there is no consent tick (see the line under
	// the button). designName is the customer's own label for this door.
	var FIELDS = [
		{ name: 'designName', label: 'Design name', type: 'text', autocomplete: 'off', required: true, maxLength: 80 },
		{ name: 'name', label: 'Your name', type: 'text', autocomplete: 'name', required: true },
		{ name: 'email', label: 'Email', type: 'email', autocomplete: 'email', required: true },
		{ name: 'postcode', label: 'Post code', type: 'text', autocomplete: 'postal-code', required: true },
		{ name: 'telephone', label: 'Phone (optional)', type: 'tel', autocomplete: 'tel', required: false }
	];

	// "Ketu in Anthracite Grey" — the same default HD_DD_Enquiry::default_design_name() uses.
	function defaultDesignName(design) {
		function pick(headings) {
			for (var i = 0; i < headings.length; i++) {
				var c = design && design[headings[i]];
				var label = c && c.label != null ? String(c.label).trim() : '';
				if (label) { return label; }
			}
			return '';
		}
		var style = pick(['Door Design', 'Door Style']);
		var colour = pick(['Door Colour (External)', 'Door Colour']);
		if (!style) { return 'My door'; }
		return (colour ? style + ' in ' + colour : style).slice(0, 80);
	}

	// The POST body for /enquiry from the form's values.
	function buildData(values, design, pageUrl) {
		return {
			designName: String(values.designName || '').trim(),
			name: values.name,
			email: values.email,
			postcode: values.postcode,
			telephone: values.telephone || '',
			hd_hp: values.hd_hp || '',
			design: cleanDesign(design || {}),
			// The designer's own page (no query) — the server validates it's same-origin and
			// builds the "open my design" email link from it.
			pageUrl: pageUrl
		};
	}

	function create(o) {
		var I18N = o.i18n || {};
		var CFG = o.cfg || {};
		var formEl = null;
		var lastContact = null;
		var designImage = null;
		var nameTouched = false; // has the customer typed their own design name?

		function renderForm(container) {
			container.innerHTML = '';
			container.appendChild(el('div', 'hd-dd__steptitle', I18N.saveFormTitle || 'Where shall we send your link and price?'));
			if (!formEl) { formEl = buildForm(); }
			// Keep the suggested name in step with the door until the customer types their own.
			if (!nameTouched) { formEl.elements['designName'].value = defaultDesignName(cleanDesign(o.getDesign())); }
			container.appendChild(formEl);
		}

		function buildForm() {
			var form = document.createElement('form');
			form.className = 'hd-dd__form';
			form.setAttribute('novalidate', 'novalidate');
			FIELDS.forEach(function (fld) {
				var row = el('label', 'hd-dd__form-row');
				row.appendChild(el('span', 'hd-dd__form-label', fld.label));
				var input = document.createElement('input');
				input.className = 'hd-dd__form-input';
				input.type = fld.type;
				input.name = fld.name;
				input.required = fld.required;
				if (fld.maxLength) { input.maxLength = fld.maxLength; }
				input.setAttribute('autocomplete', fld.autocomplete);
				if (fld.name === 'designName') {
					input.addEventListener('input', function () { nameTouched = true; });
				} else if (lastContact && lastContact[fld.name] != null) {
					// Pre-fill from the previous save so "Design another door" is quick.
					input.value = lastContact[fld.name];
				}
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

			var submitBtn = el('button', 'hd-dd__submit', I18N.saveSubmit || 'Save my design & get my price');
			submitBtn.type = 'submit';
			form.appendChild(submitBtn);
			// In place of a consent tick: saving is asking us for a price.
			form.appendChild(el('div', 'hd-dd__form-consentline',
				I18N.consentLine || 'By saving you’re asking us for a price. We’ll use your details to send it and may get in touch about your door.'));
			form.appendChild(el('div', 'hd-dd__form-trust',
				I18N.saveTrust || 'No spam, ever.'));
			var statusEl = el('div', 'hd-dd__form-status');
			statusEl.setAttribute('role', 'status');
			statusEl.setAttribute('aria-live', 'polite');
			form.appendChild(statusEl);

			form.addEventListener('submit', function (e) { e.preventDefault(); submit(form); });
			return form;
		}

		function submit(form) {
			var statusEl = form.querySelector('.hd-dd__form-status');
			var submitBtn = form.querySelector('.hd-dd__submit');
			var f = form.elements; // named access (form.name is shadowed by the control named "name").
			var data = buildData({
				designName: f['designName'].value,
				name: f['name'].value,
				email: f['email'].value,
				postcode: f['postcode'].value,
				telephone: f['telephone'].value,
				hd_hp: f['hd_hp'].value
			}, o.getDesign(), window.location.origin + window.location.pathname);
			var exp = o.experiment ? o.experiment() : null;
			if (exp) { data.experiment = exp; }

			var shot = snapshot(o.getCanvas ? o.getCanvas() : null);
			if (shot) { data.image = shot; }
			designImage = shot || null; // shown on the thank-you screen

			// QA harness has no WordPress REST endpoint — acknowledge without posting.
			if (!CFG.restUrl) {
				statusEl.textContent = I18N.previewOnly || 'Preview mode — enquiry not sent.';
				return;
			}

			statusEl.textContent = '…';
			submitBtn.disabled = true;
			o.api('enquiry', { method: 'POST', body: JSON.stringify(data) }).then(function (res) {
				submitBtn.disabled = false;
				if (res.ok && res.body && res.body.ok) {
					if (o.track) { o.track('door_quote_submitted'); } // the conversion event
					if (o.funnel) { o.funnel.lead(); }
					lastContact = { name: data.name, telephone: data.telephone, email: data.email, postcode: data.postcode };
					if (o.onSuccess) { o.onSuccess(res.body); }
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
				var message = (res.body && res.body.message) || I18N.genericError || 'Something went wrong.';
				if (window.HD_DD_ApiClient && window.HD_DD_ApiClient.isNonceFailure(res)) {
					// The client already fetched a fresh nonce and retried once; that retry failed too.
					message = I18N.sessionExpired || 'Your session had expired. Please reload the page and send your design again.';
				}
				statusEl.textContent = message;
			}).catch(function () {
				submitBtn.disabled = false;
				statusEl.textContent = I18N.genericError || 'Something went wrong.';
			});
		}

		// The post-submission screen — confirms, points to the revisit link, frames price, and
		// invites another design.
		function renderSuccess(container, result, onAgain, image) {
			container.innerHTML = '';
			var wrap = el('div', 'hd-dd__thanks');
			var shot = image || designImage;
			if (shot) {
				var pic = el('img', 'hd-dd__thanks-img');
				pic.src = shot;
				pic.alt = 'Your door design';
				wrap.appendChild(pic);
			}
			wrap.appendChild(el('div', 'hd-dd__thanks-title', 'Saved — and your price is on its way.'));
			wrap.appendChild(el('div', 'hd-dd__thanks-text',
				'We’ve emailed you a link to come back to this design. We’ll work out a price for this exact door and send it to you, usually within one working day.'));
			var guide = (CFG.trust && CFG.trust.guidePrice != null) ? CFG.trust.guidePrice
				: 'Fitted doors typically cost \u00a31,500 to \u00a34,000. Most of our customers pay around \u00a32,000.';
			if (guide) { wrap.appendChild(el('div', 'hd-dd__thanks-price', guide)); }
			var again = el('button', 'hd-dd__thanks-again', 'Design another door');
			again.type = 'button';
			again.addEventListener('click', onAgain);
			wrap.appendChild(again);
			wrap.appendChild(el('div', 'hd-dd__thanks-note', 'More than one door? Design the next one now — we already have your details.'));
			// A reliable, bookmarkable revisit link (works even if the email doesn't arrive).
			if (result && result.token) {
				var link = el('a', 'hd-dd__thanks-link', 'Open this design');
				link.href = window.location.origin + window.location.pathname + '?design=' + encodeURIComponent(result.token);
				wrap.appendChild(link);
			}
			container.appendChild(wrap);
		}

		// "Design another door": rebuild the form next time so it pre-fills from lastContact
		// and suggests a name for the new door.
		function reset() { formEl = null; nameTouched = false; }

		return { renderForm: renderForm, renderSuccess: renderSuccess, reset: reset };
	}

	// How far below the top of the viewport the form must land to clear whatever is stuck
	// there (the progress header; on phones the door preview too). "stuck" is a list of
	// { top, height, left, right } for sticky elements (top = their CSS "top" in px); only
	// those that horizontally overlap the form count — on desktop the preview sits beside it.
	function stickyOffset(stuck, box) {
		var offset = 0;
		(stuck || []).forEach(function (s) {
			if (!s.height || s.right <= box.left || s.left >= box.right) { return; }
			offset = Math.max(offset, s.top + s.height);
		});
		return offset;
	}

	// Smooth-scroll the save form to just below the sticky chrome so its first fields show.
	function scrollToForm(box, root) {
		try {
			var b = box.getBoundingClientRect();
			var stuck = [];
			Array.prototype.forEach.call(root.querySelectorAll('*'), function (n) {
				var cs = window.getComputedStyle(n);
				if (cs.position !== 'sticky' || cs.top === 'auto') { return; }
				var r = n.getBoundingClientRect();
				stuck.push({ top: parseFloat(cs.top) || 0, height: r.height, left: r.left, right: r.right });
			});
			box.style.scrollMarginTop = Math.round(stickyOffset(stuck, { left: b.left, right: b.right }) + 8) + 'px';
			box.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} catch (e) { /* older browsers: the form is still on the page */ }
	}

	return { create: create, stickyOffset: stickyOffset, scrollToForm: scrollToForm, snapshot: snapshot, cleanDesign: cleanDesign, FIELDS: FIELDS, defaultDesignName: defaultDesignName, buildData: buildData };
}));
