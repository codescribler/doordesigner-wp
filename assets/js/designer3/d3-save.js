// assets/js/designer3/d3-save.js
// Designer 3's "Save my design" box: an email address only, always on screen beside the door.
// It posts the same `save` request as Swipe 2's Review form (assets/js/swipe/review-save.js),
// with the same honeypot and the same email checks, and keeps the saved record up to date
// afterwards with `save/{token}` (update()). With no cfg.restUrl (the QA harness) nothing is
// sent: it says "Preview mode" and still moves on, so the flow can be walked.
//
//   var s = HD_DD_D3Save.create({ api, cfg, flow, token?, getDesign(), getCanvas(), experiment(), onSaved(body) });
//   s.render(container); s.saved(); s.update() -> Promise<bool>; s.token()
(function (root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory(require('../swipe/review-save.js'), require('../enquiry.js'));
	} else { root.HD_DD_D3Save = factory(root.HD_DD_ReviewSave, root.HD_DD_Enquiry); }
}(typeof self !== 'undefined' ? self : this, function (RS, Enquiry) {
	'use strict';

	var COPY = {
		button: 'Save my design',
		note: 'Just your email. We’ll send you a link to it.',
		label: 'Your email',
		placeholder: 'you@example.com',
		savedLine: '✓ Saved. Any changes you make here are saved too.',
		next: 'Next: get my price',
		badEmail: RS.COPY.badEmail,
		failed: RS.COPY.failed,
		expired: RS.COPY.expired,
		preview: RS.COPY.preview
	};

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	function create(o) {
		var cfg = o.cfg || {};
		var token = o.token || null;
		var savedKey = token ? RS.designKey(o.getDesign()) : null;
		var busy = false;
		var pending = null;
		var email = '';

		function pageUrl() { return o.pageUrl || (window.location.origin + window.location.pathname); }
		function post(path, body) {
			try { return Promise.resolve(o.api(path, { method: 'POST', body: JSON.stringify(body) })); }
			catch (e) { return Promise.reject(e); }
		}
		function snapshot() {
			try { return Enquiry.snapshot(o.getCanvas ? o.getCanvas() : null); } catch (e) { return null; }
		}
		function message(res) {
			var expired = !!(res && typeof window !== 'undefined' && window.HD_DD_ApiClient && window.HD_DD_ApiClient.isNonceFailure && window.HD_DD_ApiClient.isNonceFailure(res));
			if (expired) { return COPY.expired; }
			var f = res && res.body && res.body.data && res.body.data.fields;
			return (f && f.email) || (res && res.body && res.body.message) || COPY.failed;
		}

		// Already saved (back from the saved screen): changes are kept in step by update().
		function savedState(container) {
			var wrap = el('div', 'hd-d3-save hd-d3-save--done');
			wrap.appendChild(el('div', 'hd-d3-save__done', COPY.savedLine));
			var btn = el('button', 'hd-d3-save__btn', COPY.next);
			btn.type = 'button';
			btn.addEventListener('click', function () { update(); if (o.onSaved) { o.onSaved({ ok: true, token: token, again: true }); } });
			wrap.appendChild(btn);
			container.appendChild(wrap);
		}

		function render(container) {
			container.innerHTML = '';
			if (token) { savedState(container); return; }
			var f = document.createElement('form');
			f.className = 'hd-d3-save';
			f.setAttribute('novalidate', 'novalidate');
			var row = el('div', 'hd-d3-save__row');
			var lab = el('label', 'hd-d3-save__label');
			lab.appendChild(el('span', 'hd-d3-sr', COPY.label));
			var input = document.createElement('input');
			input.className = 'hd-d3-save__input';
			input.type = 'email'; input.name = 'email'; input.value = email;
			input.setAttribute('placeholder', COPY.placeholder);
			input.setAttribute('autocomplete', 'email');
			input.addEventListener('input', function () { email = input.value; });
			lab.appendChild(input);
			var hp = document.createElement('input'); // honeypot: bots fill it, people never see it
			hp.type = 'text'; hp.name = 'hd_hp'; hp.className = 'hd-dd__hp'; hp.tabIndex = -1;
			hp.setAttribute('autocomplete', 'off');
			hp.setAttribute('aria-hidden', 'true');
			var btn = el('button', 'hd-d3-save__btn', COPY.button);
			btn.type = 'submit';
			row.appendChild(lab); row.appendChild(btn);
			f.appendChild(row); f.appendChild(hp);
			f.appendChild(el('div', 'hd-d3-save__note', COPY.note));
			var error = el('div', 'hd-d3-save__error');
			var status = el('div', 'hd-d3-save__status');
			status.setAttribute('role', 'status');
			status.setAttribute('aria-live', 'polite');
			f.appendChild(error); f.appendChild(status);

			f.addEventListener('submit', function (e) {
				if (e && e.preventDefault) { e.preventDefault(); }
				if (busy) { return; }
				email = RS.cleanEmail(input.value);
				error.textContent = ''; status.textContent = '';
				if (!RS.validEmail(email)) { error.textContent = COPY.badEmail; return; }
				if (!cfg.restUrl) {
					status.textContent = COPY.preview;
					if (o.onSaved) { o.onSaved({ ok: true, preview: true, token: null }); }
					return;
				}
				if (token) { if (o.onSaved) { o.onSaved({ ok: true, token: token }); } return; } // never a second row
				var body = { email: email, design: Enquiry.cleanDesign(o.getDesign()), pageUrl: pageUrl(), flow: o.flow || 'designer3', hd_hp: hp.value || '' };
				var exp = o.experiment ? o.experiment() : null;
				if (exp) { body.experiment = exp; }
				var shot = snapshot();
				if (shot) { body.image = shot; }
				var key = RS.designKey(o.getDesign());
				busy = true; btn.disabled = true; status.textContent = '…';
				function done(res) {
					busy = false; status.textContent = '';
					var ok = !!(res && res.ok && res.body && res.body.ok && res.body.token);
					if (!ok) { btn.disabled = false; error.textContent = message(res); return; }
					token = res.body.token;
					savedKey = key;
					try { if (o.onSaved) { o.onSaved(res.body); } } catch (err) { /* the save itself worked */ }
				}
				post('save', body).then(done, function () { done(null); });
			});
			container.appendChild(f);
		}

		// Bring the saved record in line with the design on screen. Resolves true when it matches.
		// One update at a time. A 409 means it was already sent as an enquiry: that record is
		// closed, so the next save starts a new one.
		function update() {
			if (!token || !cfg.restUrl) { return Promise.resolve(false); }
			if (pending) { return pending.then(function (ok) { return ok ? update() : false; }); }
			var key = RS.designKey(o.getDesign());
			if (key === savedKey) { return Promise.resolve(true); }
			var body = { design: Enquiry.cleanDesign(o.getDesign()) };
			var shot = snapshot();
			if (shot) { body.image = shot; }
			var p = post('save/' + encodeURIComponent(token), body).then(function (res) {
				pending = null;
				if (res && res.ok) { savedKey = key; return true; }
				if (res && res.status === 409) { token = null; savedKey = null; }
				return false;
			}, function () { pending = null; return false; });
			pending = p;
			return p;
		}

		return {
			render: render,
			saved: function () { return !!token; },
			token: function () { return token; },
			update: update
		};
	}

	return { create: create, COPY: COPY };
}));
