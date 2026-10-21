// assets/js/designer3/d3-defaults.js
// Designer 3 shows a complete door the moment type + style are picked. This resolves the
// pre-picked colour, handle, letterplate, knocker and the rest for one style, from the table
// built by tools/build-designer3-defaults.js (HD_DD_CONFIG.d3Defaults). Every value returned is
// one of that style's own choices, so the door can always be drawn and priced.
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
	else { root.HD_DD_D3Defaults = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (root) {
	'use strict';

	function shared() {
		if (root && root.HD_DD_Shared) { return root.HD_DD_Shared; }
		try { return require('../design-shared.js'); } catch (e) { return null; }
	}

	// The catalogue's own label for a wanted one (trimmed match), or ''.
	function labelIn(choices, want) {
		if (!want) { return ''; }
		var hit = (choices || []).filter(function (c) { return String(c.label).trim() === String(want).trim(); })[0];
		return hit ? hit.label : '';
	}

	// First candidate that is one of the choices, or ''.
	function firstValid(choices, candidates) {
		for (var i = 0; i < candidates.length; i++) {
			var l = labelIn(choices, candidates[i]);
			if (l) { return l; }
		}
		return '';
	}

	function firstLabel(choices) { return choices && choices[0] ? choices[0].label : ''; }

	// Handle / letterplate go through pickFurniture so the hardware finish is honoured.
	function furniture(model, type, design, stepKey, choices, candidates) {
		var S = shared();
		for (var i = 0; i < candidates.length; i++) {
			var want = labelIn(choices, candidates[i]);
			if (want && (!S || S.pickFurniture(model, type, design, stepKey, choices, '', '', want, '') === want)) { return want; }
		}
		if (!S) { return firstLabel(choices); }
		var dropped = candidates.filter(Boolean)[0] || '';
		return S.pickFurniture(model, type, design, stepKey, choices, '', dropped, '', '') || firstLabel(choices);
	}

	function set(out, heading, label) { if (label) { out[heading] = label; } }

	// -> {[design heading]: label} for one door style.
	function resolve(node, model, type, style, table) {
		var t = table || {};
		var fb = t.fallback || {};
		var entry = (t[type] && t[type][style]) || {};
		var cand = function (f) { return [entry[f], fb[f]]; };
		var f = node.fields || {};
		var out = { 'Door Type': type, 'Door Design': style };

		var colours = f['Door Colour (External)'];
		set(out, 'Door Colour (External)', firstValid(colours, cand('colour')) || firstLabel(colours));
		var inside = f['Door Colour (Internal)'];
		if (node.hasInternalColour && inside) { set(out, 'Door Colour (Internal)', firstValid(inside, ['White']) || firstLabel(inside)); }
		var hinge = node.hingeSideField;
		if (hinge && f[hinge]) { set(out, hinge, firstLabel(f[hinge])); }

		var glass = (node.glazingByStyle && node.glazingByStyle[style]) || f['Door Glass'] || [];
		set(out, 'Door Glass', firstValid(glass, ['Satin']) || firstLabel(glass));

		set(out, 'Hardware Type', firstValid(f['Hardware Type'], cand('hardware')) || firstLabel(f['Hardware Type']));
		var design = {};
		Object.keys(out).forEach(function (h) { design[h] = { label: out[h] }; });
		set(out, 'Handle', furniture(model, type, design, 'handle', f['Handle'] || [], cand('handle')));
		var lp = furniture(model, type, design, 'letterplate', f['Letterplate'] || [], cand('letterplate'));
		set(out, 'Letterplate', lp);
		if (lp && !/^no /i.test(lp) && node.letterplatePosStyles && node.letterplatePosStyles[style]) {
			out['Letterplate Position'] = node.letterplatePosStyles[style] === 'bottom' ? 'Bottom' : 'Middle';
		}

		var knockers = (node.knockerByStyle && node.knockerByStyle[style]) || f['Knocker'] || [];
		if (node.hasKnocker || knockers.length) {
			set(out, 'Knocker', firstValid(knockers, cand('knocker')) || 'No Knocker');
		}
		if (f['Frame Design']) { out['Frame Design'] = 'No Sidelights'; }
		return out;
	}

	return { resolve: resolve };
}));
