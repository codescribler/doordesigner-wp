// assets/js/designer4/d4-doorway-screen.js
// Designer 4 step 2 of 3: the doorway, picked by picture. The door is drawn with its frame beside
// two rows of drawings: the six families (HD_DD_D4Doorway.families), then the exact layouts in the
// chosen family. An exact pick selects that `Frame Design` by id and label, glazes the sides, and
// is saved to the door's record with `doorway: 'picked'`. The family on view and the exact pick
// live in app.d4steps (HD_DD_D4Steps.state), so coming back shows them again.
//
//   HD_DD_D4DoorwayScreen.render(app, shell)   (called from HD_DD_D4Steps.doorway)
(function (W) {
	'use strict';

	var COPY = {
		okLine: '✓ We\'ve got your door, and emailed a link to it to {email}.',
		okLineNoEmail: '✓ We\'ve got your door, and emailed you a link to it.',
		added: '✓ We\'ve added this door to your estimate.',
		title: 'Now, what\'s around the door?',
		help: 'Glass beside or above the door changes the price. Grey is glass; the white gap is your door.',
		closest: 'Which is closest? You\'ll pick the side and style next.',
		exactly: 'Which one exactly?',
		next: 'Next: your details',
		skip: 'Not sure? Skip this for now'
	};
	var PAINT_WAIT = 4000;   // never hold the doorway save longer than this for a picture

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
	function noop() {}
	function Steps() { return W.HD_DD_D4Steps; }
	function D() { return W.HD_DD_D4Doorway; }
	function frameChoices(app) { var s = app.stepFor('Frame Design'); return s ? s.choices : []; }
	function frameChoice(app, id) { return frameChoices(app).filter(function (c) { return Number(c.id) === Number(id); })[0] || null; }
	function caption(id) { return D().CAPTIONS[id] || ''; }
	function picUrl(app, id) {
		var rel = D().drawing(id), base = app.cfg().pluginUrl;
		return rel && base ? String(base).replace(/\/?$/, '/') + rel : '';
	}

	function current(app) { return Number((app.design()['Frame Design'] || {}).id) || null; }

	// The per-door state; a door that already carries a doorway (other than the default "just the
	// door") shows it picked. A remembered pick the design no longer has (the frame was changed
	// elsewhere) gives way to the design's actual frame.
	function state(app) {
		var st = Steps().state(app), id = current(app);
		if (!st.seeded) {
			st.seeded = true;
			if (id && id !== 1 && D().familyOf(id)) { st.exact = id; }
		}
		if (st.exact != null && st.exact !== id) { st.exact = (id && D().familyOf(id)) ? id : null; }
		if (st.exact != null) { st.family = D().familyOf(st.exact); }
		return st;
	}

	function token(app) { var s = app.saver(); return s && s.token ? s.token() : null; }
	function painted(app) {
		return new Promise(function (done) {
			var t = setTimeout(done, PAINT_WAIT);
			function fin() { clearTimeout(t); done(); }
			Promise.resolve().then(function () { return app.whenPainted(); }).then(fin, fin);
		});
	}
	// Saved to the door's record. Not blocking: a failure shows nothing and the visitor goes on.
	function send(app, body, t) {
		t = t || token(app);
		if (!t || !app.store || !app.store.update) { return; }
		try { Promise.resolve(app.store.update(t, body)).catch(noop); } catch (e) { /* not blocking */ }
	}
	// Only the newest pick is sent, once its paint is done, with this screen's own canvas.
	function savePicked(app, st, canvas) {
		var seq = st.seq = (st.seq || 0) + 1, t = token(app);
		painted(app).then(function () {
			if (st.seq !== seq || app.d4steps !== st) { return; }   // a later pick, or another door
			var E = W.HD_DD_Enquiry;
			var body = { design: E ? E.cleanDesign(app.design()) : app.design(), doorway: 'picked' };
			var shot = null;
			try { shot = E ? E.snapshot(canvas) : null; } catch (e) { shot = null; }
			if (shot) { body.image = shot; }
			send(app, body, t);
		});
	}

	var PHONE_H = 150;   // px: the pinned door picture's height on a phone
	function phone(app) {
		var mm = typeof W.matchMedia === 'function' ? function (q) { return W.matchMedia(q); } : app.matchMedia;
		try { return !!(mm && mm('(max-width: 719px)').matches); } catch (e) { return false; }
	}

	// The door (drawn with its frame) beside the column; app.canvas is the saved picture.
	function stage(app, wrap) {
		var box = el('div', 'hd-d3-stage hd-d3-stage--after');
		var frame = el('div', 'hd-d3-frame');
		var canvas = el('canvas', 'hd-d3-canvas');
		frame.appendChild(canvas); box.appendChild(frame); wrap.appendChild(box);
		app.canvas = canvas;
		var comp = (W.HD_DD_Preview && app.model) ? W.HD_DD_Preview.create(canvas, { model: app.model, assetBase: app.assetBase() }) : null;
		return {
			canvas: canvas,
			// Phones: the picture is pinned above the choices, so it is sized by height (PHONE_H) whatever
			// the doorway's shape: once drawn, the frame takes the width that height needs and the
			// picture is drawn once more at that size.
			paint: function () {
				function draw() {
					try { return comp ? comp.render(app.type(), app.design(), app.OPTS) : null; } catch (e) { return null; /* missing asset */ }
				}
				var p = Promise.resolve(draw()).then(function () {
					if (!phone(app) || !canvas.width || !canvas.height) { return null; }
					var w = Math.max(60, Math.min(300, Math.round(PHONE_H * canvas.width / canvas.height)));
					if (Math.abs(w - (parseFloat(frame.style.width) || 0)) < 2) { return null; }
					frame.style.width = w + 'px';
					return draw();
				});
				return app.painted(p);
			}
		};
	}

	function tile(app, key, id, label, on, onPick) {
		var b = button('hd-d4-tile' + (on ? ' is-on' : ''), null, onPick);
		b.setAttribute('data-k', key);
		b.setAttribute('aria-pressed', on ? 'true' : 'false');
		var im = el('img'); im.alt = ''; im.src = picUrl(app, id);
		b.appendChild(im);
		b.appendChild(el('span', 'hd-d4-tile__label', label));
		return b;
	}

	function render(app, shell) {
		var S = Steps(), st = state(app), TB = W.HD_DD_D3Toolbox;
		S.once(app, 'doorway');
		shell.appendChild(S.strip(app, 'doorway'));
		var mail = S.email(app);
		if (!app.reopened) {   // only straight after a lead or an added door, never a door reopened from My designs
			shell.appendChild(el('p', 'hd-d4-okline', app._askKnown ? COPY.added : (mail ? COPY.okLine.replace('{email}', mail) : COPY.okLineNoEmail)));
		}
		var head = el('div', 'hd-d3-head');
		head.appendChild(el('h2', 'hd-d3-title', COPY.title));
		shell.appendChild(head);
		shell.appendChild(el('p', 'hd-d3-help', COPY.help));
		var wrap = el('div', 'hd-d4-doorway');
		var view = stage(app, wrap);
		var side = el('div', 'hd-d4-doorway__side');
		wrap.appendChild(side);
		shell.appendChild(wrap);
		var fams = D().families(frameChoices(app));

		// doorway_change once per change of mind: a different exact layout in the family of the
		// last exact pick (a pick that completes a just-changed family was counted by the family).
		function pickExact(id) {
			var choice = frameChoice(app, id);
			if (!choice) { return; }
			if (st.exact === id && current(app) === id) { redraw(); return; }
			if (st.exact != null && st.exact !== id && D().familyOf(st.exact) === D().familyOf(id)) {
				app.funnel.step('doorway_change', caption(id));
			}
			st.exact = id; st.family = D().familyOf(id);
			app.select('Frame Design', { label: choice.label, id: choice.id });
			if (W.HD_DD_D4SideGlass) { W.HD_DD_D4SideGlass.glazeSides(app); }
			if (W.HD_DD_D3FrameStep) { W.HD_DD_D3FrameStep.fixSideGlass(app); }
			redraw();
			bring('hd-d4-doorway__glass');   // the side glass questions, when this doorway has them
			app.funnel.step('doorway_exact', caption(id));
			savePicked(app, st, view.canvas);
		}
		function pickFamily(f) {
			if (st.family === f.key) { return; }
			var changed = st.family != null;
			st.family = f.key;
			app.funnel.step('doorway_group', f.label);
			if (changed) { app.funnel.step('doorway_change', f.label); }
			if (f.ids.length === 1) { pickExact(f.ids[0]); } else { redraw(); bring('hd-d4-question--exact'); }
		}
		function skip() {
			if (st.exact == null) {   // after a pick there is nothing to skip: just go on
				app.funnel.step('doorway_skip');
				send(app, { doorway: 'skipped' });
			}
			st.answered = true;   // the door screen's saved line now leads to My designs

			app.go(S.afterDoorway(app));
		}
		// Phones: the next question appears below the fold, so it is brought up under the pinned door.
		function bring(cls) {
			var n = null;
			for (var i = 0; i < side.children.length && !n; i++) { if ((' ' + side.children[i].className + ' ').indexOf(' ' + cls + ' ') !== -1) { n = side.children[i]; } }
			if (!n || !n.scrollIntoView) { return; }
			try { n.scrollIntoView({ block: 'start', behavior: app.reducedMotion && app.reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { /* older browsers */ }
		}
		function row(cls, q, list) {
			side.appendChild(el('p', 'hd-d4-question hd-d4-question--' + (cls === 'hd-d4-tiles--exact' ? 'exact' : 'family'), q));
			var tiles = el('div', 'hd-d4-tiles ' + cls);
			list.forEach(function (t) { tiles.appendChild(t); });
			side.appendChild(tiles);
		}
		function draw() {
			row('hd-d4-tiles--family', COPY.closest, fams.map(function (f) {
				return tile(app, 'fam:' + f.key, f.pic, f.label, st.family === f.key, function () { pickFamily(f); });
			}));
			var fam = fams.filter(function (f) { return f.key === st.family; })[0];
			if (fam && fam.ids.length > 1) {
				row('hd-d4-tiles--exact', COPY.exactly, fam.ids.map(function (id) {
					return tile(app, 'exact:' + id, id, caption(id), st.exact === id, function () { pickExact(id); });
				}));
			}
			var picked = st.exact != null && D().familyOf(st.exact) === st.family;
			if (picked && W.HD_DD_D4SideGlass && W.HD_DD_StepConfig && W.HD_DD_StepConfig.sidelit(app.node(), app.design())) {
				var glass = el('div', 'hd-d4-doorway__glass');
				side.appendChild(glass);
				W.HD_DD_D4SideGlass.rows(app, glass, redraw);
			}
			var foot = el('div', 'hd-d4-doorway__foot' + (picked ? ' is-picked' : ''));   // phones drop Skip once a doorway is picked
			var next = button('hd-d3-cta hd-d4-next', COPY.next, function () { if (picked) { app.go(S.afterDoorway(app)); } });
			next.disabled = !picked;
			foot.appendChild(next);
			foot.appendChild(button('hd-d4-skip', COPY.skip, skip));
			side.appendChild(foot);
		}
		// Rebuilt on every pick; keyboard focus stays on the tile or chip that was pressed.
		function redraw() {
			var keep = TB ? TB.focusedKey([side]) : null;
			side.innerHTML = '';
			draw();
			if (TB) { TB.restoreFocus([side], keep); }
			view.paint();
		}
		redraw();
	}

	W.HD_DD_D4DoorwayScreen = { render: render, COPY: COPY };
})(typeof window !== 'undefined' ? window : this);
