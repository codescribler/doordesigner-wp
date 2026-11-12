// assets/js/designer4/d4-toolbox.js
// What Designer 4 changes in Designer 3's toolbox, through the toolbox's app hooks (toolRows,
// sectionFor, hiddenMoreGroups, dotTo), so Designer 3 itself draws exactly as before:
//   - the door glass has its own row beside Colour (it was inside More options);
//   - the handles are grouped by kind, pull bars shortest first, and "No Handle" is not offered
//     (a Designer 4 door needs a handle).
// Labels stay Endurance's own, since the estimate is made from them.
//
//   HD_DD_D4Toolbox.rows(app, rows) -> rows; .section(app, key, h) -> element | null
//   HD_DD_D4Toolbox.groups(choices) -> [{ key, title, hint, choices }]
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
	else { root.HD_DD_D4Toolbox = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (W) {
	'use strict';

	var GLASS = 'Door Glass';
	var KINDS = [
		{ key: 'lever', title: 'Lever handles', hint: 'Lever/Lever has a lever inside and out. With Lever/Pad the outside is a fixed pad, so you use the key to get in.' },
		{ key: 'bar', title: 'Pull bars', hint: 'The number is the length of the bar.' },
		{ key: 'finger', title: 'Finger pulls', hint: '' },
		{ key: 'trad', title: 'Traditional', hint: '' },
		{ key: 'other', title: 'More handles', hint: '' }
	];

	function trim(s) { return String(s == null ? '' : s).trim(); }
	function current(app, heading) { var d = app.design()[heading]; return d ? trim(d.label) : ''; }
	// The length in a label ("900mm Pull Handle"); one without a length (a plain finger pull) sorts first.
	function mm(label) { var m = /(\d+)\s*mm/i.exec(label); return m ? Number(m[1]) : 0; }

	function kindOf(label) {
		if (/finger\s*pull/i.test(label)) { return 'finger'; }
		if (/pull handle/i.test(label)) { return 'bar'; }
		if (/noble|regal|monkey/i.test(label)) { return 'trad'; }
		if (/lever|pad\b/i.test(label)) { return 'lever'; }
		return 'other';
	}

	// The handle choices by kind, empty kinds left out; "No Handle" is never one of them.
	function groups(choices) {
		var by = {};
		(choices || []).forEach(function (c) {
			var label = trim(c.label);
			if (!label || /^no /i.test(label)) { return; }
			var k = kindOf(label);
			(by[k] = by[k] || []).push(c);
		});
		['bar', 'finger'].forEach(function (k) {
			if (by[k]) { by[k] = by[k].map(function (c, i) { return [c, i]; }).sort(function (a, b) { return (mm(a[0].label) - mm(b[0].label)) || (a[1] - b[1]); }).map(function (p) { return p[0]; }); }
		});
		return KINDS.filter(function (k) { return by[k.key]; }).map(function (k) {
			return { key: k.key, title: k.title, hint: k.hint, choices: by[k.key] };
		});
	}

	// Glass gets its own row after Colour; More options then names the finish only.
	function rows(app, list) {
		if (!app.stepFor(GLASS)) { return list; }
		var out = [];
		list.forEach(function (r) {
			if (r.key === 'more') {
				var hw = current(app, 'Hardware Type');
				r.value = hw ? hw + ' finish' : '';
			}
			out.push(r);
			if (r.key === 'colour') {
				var glass = current(app, GLASS);
				out.push({ key: 'glass', label: 'Glass', heading: GLASS, value: /unglazed/i.test(glass) ? 'Solid' : glass });
			}
		});
		return out;
	}

	// h: the toolbox's own { tiles, usable, el }. Null leaves the section to Designer 3.
	function section(app, key, h) {
		if (key === 'glass' && app.stepFor(GLASS)) {
			// Reported as "more", the section the glass has always belonged to in the funnel.
			return h.tiles(app, 'more', GLASS, 'glass', app.stepFor(GLASS).choices);
		}
		if (key !== 'handle') { return null; }
		var list = groups(h.usable(app, 'Handle', 'handle'));
		if (!list.length) { return null; }
		if (list.length === 1) { return h.tiles(app, 'handle', 'Handle', 'part', list[0].choices); }
		var box = h.el('div', 'hd-d4-handles');
		list.forEach(function (grp) {
			var wrap = h.el('div', 'hd-d3-group hd-d4-handles__group');
			wrap.setAttribute('data-group', grp.key);
			wrap.appendChild(h.el('div', 'hd-d3-group__title', grp.title));
			if (grp.hint) { wrap.appendChild(h.el('div', 'hd-d4-handles__hint', grp.hint)); }
			wrap.appendChild(h.tiles(app, 'handle', 'Handle', 'part', grp.choices));
			box.appendChild(wrap);
		});
		return box;
	}

	return { rows: rows, section: section, groups: groups, kindOf: kindOf };
}));
