// assets/js/designer4/d4-mydesigns.js
// Designer 4 My designs (screen `designs`): the page the emailed link opens. It lists every door
// saved under the email (store.list(), the d4/designs reply), one card each (d4-card.js), with one
// prompt for any missing details and a "Design another door" card. Only the email address and the
// doors are shown, never a name, phone number or postcode.
//
//   HD_DD_D4MyDesigns.render(app, shell)
(function (W) {
	'use strict';

	var COPY = {
		title: 'Your designs',
		savedTo: 'Saved to {email}',
		lead: 'We\'ll email your price for each door here. Remove any you\'ve gone off, and tell us about glass beside or above the door for a closer price.',
		loading: 'Loading your designs…',
		failed: 'Sorry, we couldn\'t load your designs.',
		openFailed: 'Sorry, we couldn\'t open that door. Please try again.',
		retry: 'Try again',
		missing: 'Tell us where it\'s going for a closer price ›',
		another: 'Design another door',
		older: 'Your earlier designs are behind the link in your email.'
	};

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}
	function button(cls, txt, key, onClick) {
		var b = el('button', cls, txt);
		b.type = 'button';
		if (key) { b.setAttribute('data-k', key); }
		b.addEventListener('click', onClick);
		return b;
	}
	function anyMissing(m) { return !!m && ['name', 'postcode', 'phone'].some(function (k) { return !!m[k]; }); }

	function render(app, shell) {
		var TB = W.HD_DD_D3Toolbox, Card = W.HD_DD_D4Card;
		var st = { body: null, failed: false, loading: true, confirm: null, busy: null, errors: {} };
		var openFailed = !!app.openFailed;   // back from a door that wouldn't open: already counted
		app.openFailed = false;
		if (!openFailed) { app.funnel.step('mydesigns'); }

		var page = el('div', 'hd-d4-designs');
		var head = el('div', 'hd-d4-designs__head');
		var h2 = el('h2', 'hd-d3-title', COPY.title);
		h2.setAttribute('tabindex', '-1');
		h2.setAttribute('data-k', 'head');
		head.appendChild(h2);
		var who = el('p', 'hd-d4-designs__who');
		head.appendChild(who);
		page.appendChild(head);
		if (openFailed) {
			var sorry = el('p', 'hd-d4-designs__notice', COPY.openFailed);
			sorry.setAttribute('role', 'alert');
			page.appendChild(sorry);
		}
		page.appendChild(el('p', 'hd-d3-help', COPY.lead));
		var body = el('div', 'hd-d4-designs__body');
		page.appendChild(body);
		shell.appendChild(page);

		function here() { return app.screen === 'designs' && app.shell === shell; }

		function load(then) {
			st.loading = true; st.failed = false;
			draw();
			var call;
			try { call = app.store && app.store.list ? app.store.list() : Promise.reject(new Error('no store')); } catch (e) { call = Promise.reject(e); }
			Promise.resolve(call).then(function (res) { listed(res && res.ok && res.body && Array.isArray(res.body.doors) ? res.body : null, then); },
				function () { listed(null, then); });
		}
		function listed(reply, then) {
			if (!here()) { return; }   // they have moved on: draw nothing, change nothing
			st.loading = false; st.failed = !reply; st.body = reply;
			st.confirm = null; st.busy = null; st.errors = {};
			if (reply) {
				if (reply.email && app.store && app.store.setEmail) { app.store.setEmail(reply.email); }
				app.missing = reply.missing || null;
			}
			draw();
			if (then) { then(); }
		}

		// The card's actions (d4-card.js calls these). While a remove is in flight every other
		// action waits: the busy card keeps its question until the request settles.
		var actions = {
			open: function (d) { if (!st.busy) { app.loadSaved(d.token, 'door'); } },
			doorway: function (d) { if (!st.busy) { app.loadSaved(d.token, 'doorway'); } },
			ask: function (d) { if (st.busy) { return; } st.confirm = d.token; delete st.errors[d.token]; redraw('keep:' + d.token); },
			keep: function (d) { if (st.busy) { return; } st.confirm = null; redraw('remove:' + d.token); },
			remove: function (d) {   // the card has already disabled its two buttons
				if (st.busy) { return; }
				st.busy = d.token;
				function failed() {
					if (!here()) { return; }
					st.busy = null; st.confirm = null; st.errors[d.token] = true;
					redraw('remove:' + d.token);
				}
				var call;
				try { call = app.store.remove(d.token); } catch (e) { call = Promise.reject(e); }
				Promise.resolve(call).then(function (res) {
					if (!(res && res.ok && res.body && res.body.ok)) { failed(); return; }
					app.funnel.step('door_removed');
					if (here()) { load(function () { if (TB) { TB.restoreFocus([page], 'head'); } }); }
				}, failed);
			}
		};

		function drawCards(reply) {
			var list = el('ul', 'hd-d4-cards');
			reply.doors.forEach(function (d) {
				if (!d || !d.token) { return; }
				list.appendChild(Card.render(d, {
					confirming: st.confirm === d.token, busy: st.busy === d.token, error: !!st.errors[d.token]
				}, actions));
			});
			var add = el('li', 'hd-d4-card hd-d4-card--new');
			var b = button('hd-d4-card__add', null, 'new', function () { app.startDoor(); });
			var plus = b.appendChild(el('span', 'hd-d4-card__plus', '+'));
			plus.setAttribute('aria-hidden', 'true');
			b.appendChild(el('span', null, COPY.another));
			add.appendChild(b);
			list.appendChild(add);
			body.appendChild(list);
		}

		function draw() {
			body.innerHTML = '';
			var reply = st.body;
			var mail = (reply && reply.email) || (app.store && app.store.email ? app.store.email() : '');
			who.textContent = mail ? COPY.savedTo.replace('{email}', mail) : '';
			if (st.loading) { body.appendChild(el('p', 'hd-d4-designs__status', COPY.loading)); return; }
			if (st.failed) {
				var line = el('p', 'hd-d4-designs__status', COPY.failed + ' ');
				line.setAttribute('role', 'alert');
				line.appendChild(button('hd-d3-textlink', COPY.retry, 'retry', function () { load(function () { if (TB) { TB.restoreFocus([page], 'head'); } }); }));
				body.appendChild(line);
				return;
			}
			if (anyMissing(reply.missing)) {
				body.appendChild(button('hd-d4-designs__missing', COPY.missing, 'details', function () { app.go('details'); }));
			}
			drawCards(reply);
			if (reply.older) { body.appendChild(el('p', 'hd-d4-designs__older', COPY.older)); }
		}
		// Redrawn after a card action; keyboard focus goes to the matching control.
		function redraw(key) {
			draw();
			if (TB) { TB.restoreFocus([page], key); }
		}

		load();
	}

	W.HD_DD_D4MyDesigns = { render: render, COPY: COPY };
})(typeof window !== 'undefined' ? window : this);
