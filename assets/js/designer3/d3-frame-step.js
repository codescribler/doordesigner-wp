// assets/js/designer3/d3-frame-step.js
// Designer 3's side/top light question (after saving): chip groups for the sides, the top, the
// side panel style (only once a side is chosen) and the half-flag joint (only for half flag with
// a top light), the drawing of the current combination, then the side glass rows. Every
// complete combination is one Endurance `Frame Design`, selected BY ID (labels repeat, see
// d3-frame.js), redrawn and saved with the saver's update(). Nothing is pre-selected.
//
// While the chips are half-made (say a joint is still needed) the design keeps its last complete
// layout, which is also what the saved record holds; sync() puts the chips back to it on leaving.
//
//   HD_DD_D3FrameStep.state(app); .offered(app); .chips(app, host, redraw); .justTheDoor(app);
//   .sync(app); .fixSideGlass(app)
(function (W) {
	'use strict';

	var COPY = {
		next: 'Next: get my quote',
		pickMore: 'Finish your choice to see the frame.',
		groups: { sides: 'At the side', top: 'At the top', panel: 'Side panel style', joint: 'Where the side glass meets the top light' }
	};
	var LABELS = {
		sides: { none: 'No side glass', left: 'Left', right: 'Right', both: 'Both sides' },
		top: { none: 'No top light', top: 'Top light', full: 'Full-width top light' },
		panel: { glass: 'Full glass', midrail: 'Glass with a midrail', halfflag: 'Half flag (glass top, solid bottom)' },
		joint: { bar: 'Bar level with the top of the door', totop: 'Glass runs up to the top' }
	};
	var GLASS_ROWS = ['Sidelight Type', 'Sidelight Glass'];
	var MATCHES = 'Matches the door';

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}
	function F() { return W.HD_DD_D3Frame; }
	function trim(s) { return String(s == null ? '' : s).trim(); }
	function button(cls, txt, onClick) {
		var b = el('button', cls, txt);
		b.type = 'button';
		b.addEventListener('click', onClick);
		return b;
	}

	// ---- State -------------------------------------------------------------------------------
	function choices(app) { var s = app.stepFor('Frame Design'); return s ? s.choices : null; }
	function offered(app) { return !!(F() && F().offered(choices(app))); }
	function current(app) { return app.design()['Frame Design'] || null; }

	// The visit's after-save state (app.after). Nothing is pre-selected, unless a saved link
	// brings back a frame they chose before.
	function state(app) {
		if (!app.after) {
			var sel = selFrom((current(app) || {}).id);
			app.after = { sel: sel, quoteOpen: false, rs: null, rsToken: undefined, cb: null, cbToken: undefined, doneKind: null, closed: false };
		}
		return app.after;
	}
	function selFrom(id) {
		var parts = (id != null && Number(id) !== 1 && F()) ? F().partsOf(id) : null, sel = {};
		if (parts) { Object.keys(parts).forEach(function (k) { if (parts[k]) { sel[k] = parts[k]; } }); }
		return sel;
	}
	// Half-made chips go back to the layout the design (and the saved record) actually has.
	function sync(app) {
		var st = state(app);
		if (!F() || F().layoutFor(st.sel, choices(app))) { return; }
		st.sel = selFrom((current(app) || {}).id);
	}

	function isTop(id) { var p = F() && F().partsOf(id); return !!(p && p.top !== 'none'); }
	function drawingUrl(app, id) {
		var rel = F() && F().drawingFor(id);
		var base = app.cfg().pluginUrl;   // HD_DD_CONFIG.pluginUrl: the plugin folder's URL
		return rel && base ? String(base).replace(/\/?$/, '/') + rel : '';
	}

	// Side glass on a top-light frame: "Matches the door" can't be drawn there, so it is never
	// offered or kept (the side designs are placed for full-height panels only).
	function sideChoices(app, heading) {
		var step = app.stepFor(heading);
		if (!step) { return []; }
		var top = isTop((current(app) || {}).id);
		return step.choices.filter(function (c) { return !(top && heading === 'Sidelight Glass' && trim(c.label) === MATCHES); });
	}
	function fixSideGlass(app) {
		if (!F() || !isTop((current(app) || {}).id)) { return; }
		var g = app.design()['Sidelight Glass'];
		if (!g || trim(g.label) !== MATCHES) { return; }
		var ok = sideChoices(app, 'Sidelight Glass')[0];
		if (ok) { app.wiz.select('Sidelight Glass', ok); }   // not app.select: settle() calls this
	}
	// They told us there is glass at the side: glazed side panels unless they pick solid.
	function glazeSides(app) {
		var t = app.stepFor('Sidelight Type'), d = app.design()['Sidelight Type'];
		if (!t || app.mine['Sidelight Type'] || (d && trim(d.label) === 'Glazed')) { return; }
		var g = t.choices.filter(function (c) { return trim(c.label) === 'Glazed'; })[0];
		if (g) { app.select('Sidelight Type', g.label); }
	}

	function apply(app, choice) {
		app.select('Frame Design', { label: choice.label, id: choice.id });
		glazeSides(app);
		fixSideGlass(app);
		app.saver().update();
	}

	function pickPart(app, part, value) {
		var s = state(app).sel;
		if (!F().allowed(part, value, s)) { return false; }
		s[part] = value;
		if (s.sides === 'none') { delete s.panel; }
		if (!(s.sides && s.sides !== 'none' && s.top === 'top' && s.panel === 'halfflag')) { delete s.joint; }
		var c = F().layoutFor(s, choices(app));
		if (c) { apply(app, c); }
		return true;
	}

	// "Just the door" is also Next: no side or top glass, saved, on to the quote.
	function justTheDoor(app) {
		var st = state(app);
		st.sel = { sides: 'none', top: 'none' };
		var c = F().layoutFor(st.sel, choices(app));
		if (c) { apply(app, c); }
		app.funnel.step('frame', c ? c.label : 'No Sidelights');
		app.go('quote');
	}

	// ---- Drawing -----------------------------------------------------------------------------
	function chip(k, label, on, enabled, onPick, img) {
		var b = button('hd-d3-chip' + (img ? ' hd-d3-chip--pic' : '') + (on ? ' is-on' : ''), null, onPick);
		b.setAttribute('data-k', k);
		b.setAttribute('aria-pressed', on ? 'true' : 'false');
		if (!enabled) { b.disabled = true; }
		if (img) { var im = el('img'); im.alt = ''; im.src = img; b.appendChild(im); }
		b.appendChild(el('span', 'hd-d3-chip__label', label));
		return b;
	}

	function group(title, list) {
		var g = el('div', 'hd-d3-group');
		g.setAttribute('role', 'group');
		g.setAttribute('aria-label', title);
		g.appendChild(el('div', 'hd-d3-group__title', title));
		var row = el('div', 'hd-d3-chips');
		list.forEach(function (c) { row.appendChild(c); });
		g.appendChild(row);
		return g;
	}

	function glassRows(app, host, redraw) {
		GLASS_ROWS.forEach(function (h) {
			var step = app.stepFor(h);
			if (!step) { return; }
			var d = app.design()[h];
			host.appendChild(group(step.name || h, sideChoices(app, h).map(function (c) {
				var on = !!d && trim(d.label) === trim(c.label);
				return chip('opt:' + h + ':' + c.label, trim(c.label), on, true, function () {
					app.mine[h] = c.label;
					app.select(h, c.label);
					fixSideGlass(app);
					app.saver().update();
					redraw();
				});
			})));
		});
	}

	// The chips, the drawing, the glass rows and Next, into host (redraw() rebuilds them).
	function chips(app, host, redraw) {
		var s = state(app).sel, Fr = F();
		function partGroup(part, values) {
			return group(COPY.groups[part], values.map(function (v) {
				var img = part === 'joint' ? drawingUrl(app, (Fr.layoutFor({ sides: s.sides, top: 'top', panel: 'halfflag', joint: v }, choices(app)) || {}).id) : '';
				return chip(part + ':' + v, LABELS[part][v], s[part] === v, Fr.allowed(part, v, s), function () { if (pickPart(app, part, v)) { redraw(); } }, img);
			}));
		}
		var cur = Fr.layoutFor(s, choices(app));
		var cols = el('div', 'hd-d3-framepick');
		var picks = el('div', 'hd-d3-framepick__chips');
		picks.appendChild(partGroup('sides', Fr.SIDES));
		picks.appendChild(partGroup('top', Fr.TOPS));
		if (Fr.allowed('panel', null, s)) { picks.appendChild(partGroup('panel', Fr.PANELS)); }
		if (Fr.allowed('joint', null, s)) { picks.appendChild(partGroup('joint', Fr.JOINTS)); }
		cols.appendChild(picks);
		if (cur || (s.sides && s.sides !== 'none')) {
			var fig = el('figure', 'hd-d3-framepick__drawing');
			var url = cur ? drawingUrl(app, cur.id) : '';
			if (url) { var im = el('img'); im.alt = trim(cur.label); im.src = url; fig.appendChild(im); }
			fig.appendChild(el('figcaption', '', cur ? trim(cur.label) : COPY.pickMore));
			cols.appendChild(fig);
		}
		host.appendChild(cols);
		if (cur && W.HD_DD_StepConfig.sidelit(app.node(), app.design())) { glassRows(app, host, redraw); }
		var next = button('hd-d3-cta', COPY.next, function () { if (cur) { app.funnel.step('frame', cur.label); app.go('quote'); } });
		next.disabled = !cur;
		host.appendChild(next);
	}

	W.HD_DD_D3FrameStep = { state: state, offered: offered, chips: chips, justTheDoor: justTheDoor, sync: sync, fixSideGlass: fixSideGlass, COPY: COPY, LABELS: LABELS };
})(typeof window !== 'undefined' ? window : this);
