// assets/js/designer3/d3-callback.js
// Designer 3's "Request a call back about this door" form: name and phone, both required.
// It posts `save/{token}/callback` (a lead for the business, NOT the A/B conversion: the caller
// fires the funnel step `callback` from onDone and never calls funnel.lead()). Field errors
// from the server (422 hd_dd_validation) show under their field; a 409 means the design was
// already sent to us. What was typed survives redraws. The screen gives the heading.
// A record closed elsewhere (a 409 from the update in ensure(), or from this route) calls
// onClosed(); no token at all calls onNoToken(), so the caller can send them back to save.
//
//   var cb = HD_DD_D3Callback.create({ api, token, getDesign, onDone(result), ensure?(), closed?(),
//     onClosed?(), onNoToken?(), cfg?, pageUrl? });
//   cb.render(container); cb.focus();
(function (W) {
	'use strict';

	var COPY = {
		title: 'Request a call back about this door',
		intro: 'Leave your name and number and we’ll call you about this design.',
		name: 'Your name',
		phone: 'Phone',
		button: 'Request my call back',
		noName: 'Please enter your name.',
		noPhone: 'Please enter your phone number.',
		thanks: 'Thanks. We’ll call you within one working day about your door.',
		already: 'We already have this design. Change anything and you can send us the new version.',
		failed: 'Something went wrong. Please try again.',
		expired: 'Your session had expired. Please reload the page and try again.',
		preview: 'Preview mode — not sent.'
	};

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	function field(f, values, label, type, name, autocomplete) {
		var row = el('label', 'hd-dd__form-row');
		row.appendChild(el('span', 'hd-dd__form-label', label));
		var input = document.createElement('input');
		input.className = 'hd-dd__form-input';
		input.type = type; input.name = name; input.value = values[name] || '';
		input.required = true;
		input.setAttribute('autocomplete', autocomplete);
		input.addEventListener('input', function () { values[name] = input.value; });
		row.appendChild(input);
		var error = el('span', 'hd-dd__form-error');
		row.appendChild(error);
		f.appendChild(row);
		return { input: input, error: error };
	}

	function create(o) {
		var values = { name: '', telephone: '' };
		var busy = false;
		var first = null;

		function pageUrl() { return o.pageUrl || (W.location ? W.location.origin + W.location.pathname : ''); }
		function post(path, body) {
			try { return Promise.resolve(o.api(path, { method: 'POST', body: JSON.stringify(body) })); }
			catch (e) { return Promise.reject(e); }
		}
		function ready() {
			if (!o.ensure) { return Promise.resolve(true); }
			try { return Promise.resolve(o.ensure()); } catch (e) { return Promise.resolve(false); }
		}
		function message(res) {
			var AC = W.HD_DD_ApiClient;
			if (res && AC && AC.isNonceFailure && AC.isNonceFailure(res)) { return COPY.expired; }
			if (res && res.status === 409) { return COPY.already; }
			return (res && res.body && res.body.message) || COPY.failed;
		}

		function render(container) {
			container.innerHTML = '';
			first = null;
			var f = el('form', 'hd-dd__form hd-d3-callback');
			f.setAttribute('novalidate', 'novalidate');
			f.appendChild(el('p', 'hd-d3-callback__intro', COPY.intro));
			var fields = {
				name: field(f, values, COPY.name, 'text', 'name', 'name'),
				telephone: field(f, values, COPY.phone, 'tel', 'telephone', 'tel')
			};
			first = fields.name.input;
			var btn = el('button', 'hd-dd__submit', COPY.button);
			btn.type = 'submit';
			f.appendChild(btn);
			var status = el('div', 'hd-dd__form-status');
			status.setAttribute('role', 'status');
			status.setAttribute('aria-live', 'polite');
			f.appendChild(status);

			function fail(res) {
				var errs = res && res.body && res.body.data && res.body.data.fields;
				var shown = false;
				Object.keys(errs || {}).forEach(function (k) { if (fields[k]) { fields[k].error.textContent = errs[k]; shown = true; } });
				if (!shown) { status.textContent = message(res); }
			}

			f.addEventListener('submit', function (e) {
				if (e && e.preventDefault) { e.preventDefault(); }
				if (busy) { return; }
				Object.keys(fields).forEach(function (k) {
					values[k] = String(fields[k].input.value || '').trim();
					fields[k].error.textContent = '';
				});
				status.textContent = '';
				if (!values.name) { fields.name.error.textContent = COPY.noName; return; }
				if (!values.telephone) { fields.telephone.error.textContent = COPY.noPhone; return; }
				if (o.cfg && !o.cfg.restUrl) { status.textContent = COPY.preview; return; }
				if (!o.token) { if (o.onNoToken) { o.onNoToken(); } else { status.textContent = COPY.failed; } return; }
				busy = true; btn.disabled = true; status.textContent = '…';
				function finish(res) {
					busy = false;
					status.textContent = '';
					var ok = !!(res && res.ok && res.body && res.body.ok);
					if (!ok && res && res.status === 409 && o.onClosed) { o.onClosed(); return; }
					if (!ok) { btn.disabled = false; fail(res); return; }
					if (o.onDone) { o.onDone(res.body); }
				}
				// The saved record must match the door on screen before we ask about it.
				ready().then(function (current) {
					// The update found the record already sent (409): the design is with us.
					if (!current && o.closed && o.closed() && o.onClosed) { busy = false; o.onClosed(); return; }
					if (!current) { finish(null); return; }
					post('save/' + encodeURIComponent(o.token) + '/callback', { name: values.name, telephone: values.telephone, pageUrl: pageUrl() })
						.then(finish, function () { finish(null); });
				}, function () { finish(null); });
			});
			container.appendChild(f);
		}

		return { render: render, focus: function () { if (first && first.focus) { first.focus(); } } };
	}

	// The thank-you line once a call back is booked.
	function thanks(container) {
		var wrap = el('div', 'hd-d3-thanks');
		wrap.setAttribute('role', 'status');
		wrap.appendChild(el('div', 'hd-d3-thanks__title', COPY.thanks));
		container.appendChild(wrap);
		return wrap;
	}

	W.HD_DD_D3Callback = { create: create, thanks: thanks, COPY: COPY };
})(typeof window !== 'undefined' ? window : this);
