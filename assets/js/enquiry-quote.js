// assets/js/enquiry-quote.js
// The ORIGINAL "Get your free quote" form, submit and thank-you screen, exactly as released
// in v0.2.64 — name, telephone, email, postcode and a consent tick. Used by the classic
// flow only: classic is the control in the Classic vs Swipe A/B test, so it keeps the form
// it has always had. The swipe flow uses the newer save form in enquiry.js. The one addition
// is `form: 'quote'` in the POST, which tells the server to apply the original rules
// (telephone and consent required).
//
//   var enq = HD_DD_QuoteEnquiry.create({
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
	else { root.HD_DD_QuoteEnquiry = factory(); }
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

	function create(o) {
		var I18N = o.i18n || {};
		var CFG = o.cfg || {};
		var formEl = null;
		var lastContact = null;
		var designImage = null;

		function renderForm(container) {
			container.innerHTML = '';
			container.appendChild(el('div', 'hd-dd__steptitle', I18N.formTitle || 'Get your free quote'));
			container.appendChild(el('div', 'hd-dd__form-reassure',
				I18N.reassure || 'Free and no-obligation — no payment now. We just need a few details to send your tailored quote.'));
			if (!formEl) { formEl = buildForm(); }
			container.appendChild(formEl);
		}

		function buildForm() {
			var form = document.createElement('form');
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
				if (lastContact && lastContact[fld.name] != null) { input.value = lastContact[fld.name]; }
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

			var submitBtn = el('button', 'hd-dd__submit', I18N.submit || 'Send my free quote request');
			submitBtn.type = 'submit';
			form.appendChild(submitBtn);
			form.appendChild(el('div', 'hd-dd__form-trust',
				I18N.trust || 'No spam, ever — your details are only used to prepare your quote.'));
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
			var data = {
				name: f['name'].value,
				telephone: f['telephone'].value,
				email: f['email'].value,
				postcode: f['postcode'].value,
				consent: f['consent'].checked,
				hd_hp: f['hd_hp'].value,
				form: 'quote', // the server applies the original rules: telephone and consent required.
				design: cleanDesign(o.getDesign()),
				// The designer's own page (no query) — the server validates it's same-origin and
				// builds the "revisit your design" email link from it.
				pageUrl: window.location.origin + window.location.pathname
			};
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
		function renderSuccess(container, result, onAgain) {
			container.innerHTML = '';
			var wrap = el('div', 'hd-dd__thanks');
			if (designImage) {
				var pic = el('img', 'hd-dd__thanks-img');
				pic.src = designImage;
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
			again.addEventListener('click', onAgain);
			wrap.appendChild(again);
			wrap.appendChild(el('div', 'hd-dd__thanks-note', 'Quoting for more than one door? Design the next one now — we already have your details.'));
			// A reliable, bookmarkable revisit link (works even if the email doesn't arrive).
			if (result && result.token) {
				var link = el('a', 'hd-dd__thanks-link', 'Revisit this design');
				link.href = window.location.origin + window.location.pathname + '?design=' + encodeURIComponent(result.token);
				wrap.appendChild(link);
			}
			container.appendChild(wrap);
		}

		// "Design another door": rebuild the form next time so it pre-fills from lastContact.
		function reset() { formEl = null; }

		return { renderForm: renderForm, renderSuccess: renderSuccess, reset: reset };
	}

	return { create: create, snapshot: snapshot, cleanDesign: cleanDesign };
}));
