// assets/js/swipe/review-save.js
// The Review step's form in the swipe flow, in two small steps on one record:
//   1. "Email me my design" — an email address only. The design is saved at once.
//   2. "Get my exact price" — name and postcode (phone optional). This is the enquiry.
// If the design is changed after step 1, the saved record is updated the next time the
// form is drawn. What the visitor typed is kept through failures and re-draws.
//
//   var rs = HD_DD_ReviewSave.create({ api, cfg, flow, token, getDesign(), getCanvas(),
//     experiment(), onSaved(result), onQuoted(result, imageDataUrl) });
//   rs.render(container); rs.saved(); rs.focus(); rs.reset();
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(require('../enquiry.js')); }
	else { root.HD_DD_ReviewSave = factory(root.HD_DD_Enquiry); }
}(typeof self !== 'undefined' ? self : this, function (Enquiry) {
	'use strict';

	var COPY = {
		saveTitle: 'Email me my design',
		saveButton: 'Email me my design',
		saveNote: 'We\u2019ll send a link so you can come back to it any time.',
		savedLine: 'Saved. We\u2019ve emailed you the link.',
		quoteTitle: 'Want your exact fitted price? We\u2019ll send it within one working day.',
		quoteButton: 'Get my exact price',
		postcodeHint: 'So we can check we cover you and price the fitting.',
		consent: 'By asking for a price you\u2019re agreeing we can use your details to send it and get in touch about your door.',
		badEmail: 'Please enter a valid email address.',
		noName: 'Please enter your name.',
		noPostcode: 'Please enter your postcode.',
		failed: 'Something went wrong. Please try again.',
		expired: 'Your session had expired. Please reload the page and try again.',
		preview: 'Preview mode \u2014 not sent.'
	};

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	function cleanEmail(s) { return String(s == null ? '' : s).trim(); }
	function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail(s)); }
	function designKey(design) { return JSON.stringify(Enquiry.cleanDesign(design || {})); }

	// One labelled input with its own error line.
	function field(form, label, type, name, autocomplete, value, hint) {
		var row = el('label', 'hd-dd__form-row');
		row.appendChild(el('span', 'hd-dd__form-label', label));
		var input = document.createElement('input');
		input.className = 'hd-dd__form-input';
		input.type = type;
		input.name = name;
		input.value = value || '';
		input.setAttribute('autocomplete', autocomplete);
		row.appendChild(input);
		if (hint) { row.appendChild(el('span', 'hd-sw-save__hint', hint)); }
		var error = el('span', 'hd-dd__form-error');
		row.appendChild(error);
		form.appendChild(row);
		return { input: input, error: error };
	}

	function create(o) {
		var cfg = o.cfg || {};
		var token = o.token || null;
		var savedKey = token ? designKey(o.getDesign()) : null;
		var justSaved = false;   // saved in this visit (as opposed to opened from the emailed link)
		var busy = false;
		var pending = null;      // the design update in flight, if any
		var box = null;
		var first = null;        // the first input on screen, for focus()
		var image = null;        // the door snapshot sent with the save, for the thank-you screen
		var values = { email: '', name: '', postcode: '', telephone: '' };

		function pageUrl() { return o.pageUrl || (window.location.origin + window.location.pathname); }
		// A throw from the api counts as a failed request.
		function post(path, body) {
			try { return Promise.resolve(o.api(path, { method: 'POST', body: JSON.stringify(body) })); }
			catch (e) { return Promise.reject(e); }
		}
		function snapshot() {
			var s = Enquiry.snapshot(o.getCanvas ? o.getCanvas() : null);
			if (s) { image = s; }
			return s;
		}

		function form(title) {
			var f = document.createElement('form');
			f.className = 'hd-dd__form';
			f.setAttribute('novalidate', 'novalidate');
			f.appendChild(el('div', 'hd-sw-save__title', title));
			return f;
		}

		function button(f, label) {
			var b = el('button', 'hd-dd__submit', label);
			b.type = 'submit';
			f.appendChild(b);
			return b;
		}

		function status(f) {
			var s = el('div', 'hd-dd__form-status');
			s.setAttribute('role', 'status');
			s.setAttribute('aria-live', 'polite');
			f.appendChild(s);
			return s;
		}

		// Show what went wrong: field messages where the server named a field, else one line.
		function fail(res, fields, statusEl) {
			var errs = res && res.body && res.body.data && res.body.data.fields;
			var shown = false;
			if (errs) {
				Object.keys(errs).forEach(function (k) {
					if (fields[k]) { fields[k].error.textContent = errs[k]; shown = true; }
				});
			}
			if (shown) { return; }
			var expired = !!(res && typeof window !== 'undefined' && window.HD_DD_ApiClient && window.HD_DD_ApiClient.isNonceFailure && window.HD_DD_ApiClient.isNonceFailure(res));
			statusEl.textContent = expired ? COPY.expired : ((res && res.body && res.body.message) || COPY.failed);
		}

		// Send one request with the button locked, then hand the reply to done(ok, res).
		// prep (optional) returns a promise of true when the request may go ahead.
		function send(btn, statusEl, path, body, done, prep) {
			if (!cfg.restUrl) { statusEl.textContent = COPY.preview; return; }
			busy = true;
			btn.disabled = true;
			statusEl.textContent = '…';
			function finish(res) {
				var ok = !!(res && res.ok && res.body && res.body.ok);
				busy = false;
				if (!ok) { btn.disabled = false; }   // on success the caller moves on; keep it locked
				statusEl.textContent = '';
				done(ok, res);
			}
			function go() { post(path, body).then(finish, function () { finish(null); }); }
			if (!prep) { go(); return; }
			prep().then(function (ready) {
				if (ready) { go(); return; }
				busy = false;
				btn.disabled = false;
				statusEl.textContent = COPY.failed;
			});
		}

		// ---- Step 1: email only -----------------------------------------------------------
		function stepOne(container) {
			var f = form(COPY.saveTitle);
			var email = field(f, 'Email', 'email', 'email', 'email', values.email);
			first = email.input;
			var hp = document.createElement('input'); // honeypot: bots fill it, people never see it
			hp.type = 'text'; hp.name = 'hd_hp'; hp.className = 'hd-dd__hp'; hp.tabIndex = -1;
			hp.setAttribute('autocomplete', 'off');
			hp.setAttribute('aria-hidden', 'true');
			f.appendChild(hp);
			var btn = button(f, COPY.saveButton);
			f.appendChild(el('div', 'hd-dd__form-trust', COPY.saveNote));
			var statusEl = status(f);

			f.addEventListener('submit', function (e) {
				e.preventDefault();
				if (busy) { return; }
				if (token) { render(box); return; }   // already saved: never a second row
				values.email = cleanEmail(email.input.value);
				email.error.textContent = '';
				if (!validEmail(values.email)) { email.error.textContent = COPY.badEmail; return; }
				var body = { email: values.email, design: Enquiry.cleanDesign(o.getDesign()), pageUrl: pageUrl(), flow: o.flow || '', hd_hp: hp.value || '' };
				var exp = o.experiment ? o.experiment() : null;
				if (exp) { body.experiment = exp; }
				var shot = snapshot();
				if (shot) { body.image = shot; }
				var key = designKey(o.getDesign());
				send(btn, statusEl, 'save', body, function (ok, res) {
					if (!ok || !res.body.token) { fail(res, { email: email }, statusEl); return; }
					token = res.body.token;
					savedKey = key;
					justSaved = true;
					try { if (o.onSaved) { o.onSaved(res.body); } } catch (err) { /* the form still moves on */ }
					if (box) { render(box); }
				});
			});
			container.appendChild(f);
		}

		// ---- Step 2: the details for an exact price ------------------------------------------
		function stepTwo(container) {
			if (justSaved) { container.appendChild(el('div', 'hd-sw-save__done', COPY.savedLine)); }
			var f = form(COPY.quoteTitle);
			var fields = {
				name: field(f, 'Your name', 'text', 'name', 'name', values.name),
				postcode: field(f, 'Post code', 'text', 'postcode', 'postal-code', values.postcode, COPY.postcodeHint),
				telephone: field(f, 'Phone (optional)', 'tel', 'telephone', 'tel', values.telephone)
			};
			first = fields.name.input;
			var btn = button(f, COPY.quoteButton);
			f.appendChild(el('div', 'hd-dd__form-consentline', COPY.consent));
			var statusEl = status(f);

			f.addEventListener('submit', function (e) {
				e.preventDefault();
				if (busy) { return; }
				Object.keys(fields).forEach(function (k) {
					values[k] = String(fields[k].input.value || '').trim();
					fields[k].error.textContent = '';
				});
				if (!values.name) { fields.name.error.textContent = COPY.noName; return; }
				if (!values.postcode) { fields.postcode.error.textContent = COPY.noPostcode; return; }
				var body = { name: values.name, postcode: values.postcode, telephone: values.telephone, pageUrl: pageUrl() };
				send(btn, statusEl, 'save/' + encodeURIComponent(token) + '/quote', body, function (ok, res) {
					if (!ok) { fail(res, fields, statusEl); return; }
					if (o.onQuoted) { o.onQuoted(res.body, image); }
				}, ensureCurrent);
			});
			container.appendChild(f);
		}

		// Make sure the saved record matches the design on screen. Resolves true when it does.
		// One update at a time; a failed update resolves false and is retried by the next call.
		function ensureCurrent() {
			var key = designKey(o.getDesign());
			if (pending) { return pending.then(function (ok) { return ok ? ensureCurrent() : false; }); }
			if (key === savedKey) { return Promise.resolve(true); }
			var body = { design: Enquiry.cleanDesign(o.getDesign()) };
			var shot = snapshot();
			if (shot) { body.image = shot; }
			var p = post('save/' + encodeURIComponent(token), body).then(function (res) {
				pending = null;
				if (res && res.ok) { savedKey = key; return true; }
				return false;
			}, function () { pending = null; return false; });
			pending = p;
			return p;
		}

		function render(container) {
			box = container;
			container.innerHTML = '';
			if (token) { if (cfg.restUrl && !busy) { ensureCurrent(); } stepTwo(container); } else { stepOne(container); }
		}

		return {
			render: render,
			saved: function () { return !!token; },
			focus: function () { if (first && first.focus) { first.focus(); } },
			// "Design another door": a new design starts unsaved; what we know stays filled in.
			reset: function () { token = null; savedKey = null; justSaved = false; image = null; }
		};
	}

	return { create: create, COPY: COPY, cleanEmail: cleanEmail, validEmail: validEmail, designKey: designKey };
}));
