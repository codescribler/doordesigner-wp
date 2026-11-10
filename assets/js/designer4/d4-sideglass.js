// assets/js/designer4/d4-sideglass.js
// Designer 4 side glass: once a doorway with side glass is picked, the `Sidelight Type` and
// `Sidelight Glass` choices, as Designer 3 shows them (d3-frame-step.js), including its rule that
// "Matches the door" is never offered with a top light. Designer 3's private helpers are
// re-implemented here; its exported fixSideGlass is called.
//
//   HD_DD_D4SideGlass.rows(app, host, redraw); .glazeSides(app); .choices(app, heading)
(function (W) {
	'use strict';

	var ROWS = ['Sidelight Type', 'Sidelight Glass'];
	var MATCHES = 'Matches the door';

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}
	function trim(s) { return String(s == null ? '' : s).trim(); }
	function frameId(app) { return (app.design()['Frame Design'] || {}).id; }
	function isTop(id) {
		var F = W.HD_DD_D3Frame, p = F && F.partsOf(id);
		return !!(p && p.top !== 'none');
	}
	function fix(app) {
		if (W.HD_DD_D3FrameStep && W.HD_DD_D3FrameStep.fixSideGlass) { W.HD_DD_D3FrameStep.fixSideGlass(app); }
	}

	// The step's choices, without "Matches the door" on a top-light frame.
	function choices(app, heading) {
		var step = app.stepFor(heading);
		if (!step) { return []; }
		var top = isTop(frameId(app));
		return step.choices.filter(function (c) { return !(top && heading === 'Sidelight Glass' && trim(c.label) === MATCHES); });
	}

	// There is glass at the side: glazed side panels, unless the visitor picked otherwise.
	function glazeSides(app) {
		var t = app.stepFor('Sidelight Type'), d = app.design()['Sidelight Type'];
		if (!t || app.mine['Sidelight Type'] || (d && trim(d.label) === 'Glazed')) { return; }
		var g = t.choices.filter(function (c) { return trim(c.label) === 'Glazed'; })[0];
		if (g) { app.select('Sidelight Type', g.label); }
	}

	function chip(key, label, on, onPick) {
		var b = el('button', 'hd-d3-chip' + (on ? ' is-on' : ''));
		b.type = 'button';
		b.setAttribute('data-k', key);
		b.setAttribute('aria-pressed', on ? 'true' : 'false');
		b.appendChild(el('span', 'hd-d3-chip__label', label));
		b.addEventListener('click', onPick);
		return b;
	}

	// One group per row the door has; a pick is the visitor's own, saved, then redraw().
	function rows(app, host, redraw) {
		ROWS.forEach(function (h) {
			var step = app.stepFor(h);
			if (!step) { return; }
			var d = app.design()[h], title = step.name || h;
			var g = el('div', 'hd-d3-group hd-d4-sideglass');
			g.setAttribute('role', 'group');
			g.setAttribute('aria-label', title);
			g.appendChild(el('div', 'hd-d3-group__title', title));
			var row = el('div', 'hd-d3-chips');
			choices(app, h).forEach(function (c) {
				var on = !!d && trim(d.label) === trim(c.label);
				row.appendChild(chip('opt:' + h + ':' + trim(c.label), trim(c.label), on, function () {
					app.mine[h] = c.label;
					app.select(h, c.label);
					fix(app);
					app.saver().update();
					redraw();
				}));
			});
			g.appendChild(row);
			host.appendChild(g);
		});
	}

	W.HD_DD_D4SideGlass = { rows: rows, glazeSides: glazeSides, choices: choices };
})(typeof window !== 'undefined' ? window : this);
