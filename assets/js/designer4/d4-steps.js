// assets/js/designer4/d4-steps.js
// Designer 4's screens after the lead (the app routes go('doorway'|'details'|'done') here):
//   doorway: step 2 of 3, drawn by d4-doorway-screen.js.
//   details: step 3 of 3, name, postcode and phone, none required, added to the same lead.
//   done:    "✓ Your estimate is on its way" and the three ways on.
// The progress strip and the per-door step state (app.d4steps, cleared by the app's newDoor())
// live here too.
//
//   HD_DD_D4Steps.strip(app, now); .doorway(app, shell); .details(app, shell); .done(app, shell);
//   .state(app); .once(app, key); .afterDoorway(app); .email(app)
(function (W) {
	'use strict';

	var COPY = {
		door: 'Your door', doorway: 'Your doorway', details: 'Your details',
		detailsTitle: 'Last step: where\'s it going?',
		name: 'Your name', postcode: 'Postcode', phone: 'Phone number',
		postcodeHint: 'So we can check we cover you and price the fitting.',
		phoneHint: 'Helps if we need to check a detail.',
		finish: 'Finish',
		badPostcode: 'Please enter a valid UK postcode.',
		failed: 'Something went wrong. Please try again.',
		doneTitle: '✓ Your estimate is on its way',
		doneLine: 'We\'ll email it to {email} within 1 working day. Your design is saved, and you can change it any time.',
		designs: 'See my designs', another: 'Design another door', keep: 'Keep customising this door'
	};
	var ORDER = ['door', 'doorway', 'details'];
	var FIELDS = [   // [input name, label, autocomplete, type, hint, key in app.missing]
		['name', 'name', 'name', 'text', null, 'name'],
		['postcode', 'postcode', 'postal-code', 'text', 'postcodeHint', 'postcode'],
		['telephone', 'phone', 'tel', 'tel', 'phoneHint', 'phone']
	];

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}
	function button(cls, txt, onClick) {
		var b = el('button', cls, txt);
		b.type = 'button';
		b.addEventListener('click', onClick);
		return b;
	}
	function trim(s) { return String(s == null ? '' : s).trim(); }

	// ---- Shared ------------------------------------------------------------------------------
	function state(app) {
		if (!app.d4steps) { app.d4steps = { fired: {}, family: null, exact: null, seeded: false }; }
		return app.d4steps;
	}
	// A funnel step once per door per visit.
	function once(app, key) {
		var st = state(app);
		if (st.fired[key]) { return; }
		st.fired[key] = true;
		app.funnel.step(key);
	}
	function email(app) { return (app.store && app.store.email && trim(app.store.email())) || ''; }
	function offersDoorway(app) {
		var F = W.HD_DD_D3Frame, step = app.stepFor('Frame Design');
		return !!(F && F.offered(step ? step.choices : null));
	}
	// After the doorway: details while any of name/postcode/phone is missing or unknown.
	function afterDoorway(app) {
		var m = app.missing;
		var missing = !m || ['name', 'postcode', 'phone'].some(function (k) { return m[k] !== false; });
		return missing ? 'details' : 'done';
	}
	function title(shell, text) {
		var head = el('div', 'hd-d3-head');
		head.appendChild(el('h2', 'hd-d3-title', text));
		shell.appendChild(head);
	}

	// "✓ 1. Your door · 2. Your doorway · 3. Your details"; no doorway entry when not offered.
	function strip(app, now) {
		var list = ORDER.filter(function (k) { return k !== 'doorway' || offersDoorway(app); });
		var at = now === 'done' ? list.length : list.indexOf(now);
		var ol = el('ol', 'hd-d4-strip');
		list.forEach(function (k, i) {
			var done = i < at;
			var li = el('li', 'hd-d4-strip__step' + (done ? ' is-done' : '') + (i === at ? ' is-now' : ''),
				(done ? '✓ ' : '') + (i + 1) + '. ' + COPY[k]);
			if (i === at) { li.setAttribute('aria-current', 'step'); }
			ol.appendChild(li);
		});
		return ol;
	}

	// ---- Step 2 of 3 -------------------------------------------------------------------------
	function doorway(app, shell) {
		var S = W.HD_DD_D4DoorwayScreen;
		if (S && S.render) { S.render(app, shell); }
	}

	// ---- Step 3 of 3 -------------------------------------------------------------------------
	function field(form, f) {
		var wrap = el('div', 'hd-d4-details__field');
		var id = 'hd-d4-' + f[0];
		var lab = el('label', 'hd-d4-details__label', COPY[f[1]]);
		lab.setAttribute('for', id);
		var input = el('input', 'hd-d4-details__input');
		input.id = id; input.name = f[0]; input.type = f[3];
		input.setAttribute('autocomplete', f[2]);
		wrap.appendChild(lab); wrap.appendChild(input);
		if (f[4]) { wrap.appendChild(el('p', 'hd-d4-details__hint', COPY[f[4]])); }
		var error = el('p', 'hd-d4-details__error');
		error.setAttribute('aria-live', 'polite');
		wrap.appendChild(error);
		form.appendChild(wrap);
		return { input: input, error: error, spec: f };
	}

	function details(app, shell) {
		once(app, 'details');
		shell.appendChild(strip(app, 'details'));
		title(shell, COPY.detailsTitle);
		var form = el('form', 'hd-d4-details');
		form.setAttribute('novalidate', 'novalidate');
		var fields = FIELDS.map(function (f) { return field(form, f); });
		var status = el('p', 'hd-d4-details__status');
		status.setAttribute('role', 'status');
		var finish = el('button', 'hd-d3-cta hd-d4-finish', COPY.finish);
		finish.type = 'submit';
		form.appendChild(status); form.appendChild(finish);
		shell.appendChild(form);
		var busy = false;

		form.addEventListener('submit', function (e) {
			if (e && e.preventDefault) { e.preventDefault(); }
			if (busy) { return; }
			var body = {}, sent = [];
			fields.forEach(function (f) {
				f.error.textContent = '';
				var v = trim(f.input.value);
				if (v) { body[f.spec[0]] = v; sent.push(f.spec[5]); }
			});
			status.textContent = '';
			if (!sent.length || !app.store) { app.go('done'); return; }
			busy = true; finish.disabled = true;
			function done(res) {
				busy = false; finish.disabled = false;
				if (res && res.ok && res.body && res.body.ok) {
					var m = {};
					['name', 'postcode', 'phone'].forEach(function (k) { m[k] = app.missing ? app.missing[k] !== false : true; });
					sent.forEach(function (k) { m[k] = false; });
					app.missing = m;
					app.funnel.step('finished');
					app.go('done');
					return;
				}
				var bad = res && res.body && res.body.data && res.body.data.fields;
				if (res && res.status === 422) {
					fields.forEach(function (f) { if (bad && bad[f.spec[0]]) { f.error.textContent = bad[f.spec[0]]; } });
					if (!bad || !fields.some(function (f) { return bad[f.spec[0]]; })) { fields[1].error.textContent = COPY.badPostcode; }
					return;
				}
				status.textContent = (res && res.body && res.body.message) || COPY.failed;
			}
			var call;
			try { call = app.store.details(body); } catch (err) { call = Promise.reject(err); }
			Promise.resolve(call).then(done, function () { done(null); });
		});
	}

	// ---- Finished ----------------------------------------------------------------------------
	function done(app, shell) {
		shell.appendChild(strip(app, 'done'));
		var box = el('div', 'hd-d4-done');
		box.appendChild(el('h2', 'hd-d3-title', COPY.doneTitle));
		box.appendChild(el('p', 'hd-d3-help', COPY.doneLine.replace('{email}', email(app) || 'you')));
		var links = el('div', 'hd-d4-done__links');
		links.appendChild(button('hd-d3-textlink', COPY.designs, function () { app.go('designs'); }));
		links.appendChild(button('hd-d3-textlink', COPY.another, function () { app.startDoor(); }));
		if (app.style()) { links.appendChild(button('hd-d3-textlink', COPY.keep, function () { app.go('door'); })); }
		box.appendChild(links);
		shell.appendChild(box);
	}

	W.HD_DD_D4Steps = {
		strip: strip, doorway: doorway, details: details, done: done,
		state: state, once: once, afterDoorway: afterDoorway, email: email, COPY: COPY
	};
})(typeof window !== 'undefined' ? window : this);
