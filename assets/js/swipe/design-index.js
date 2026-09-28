// assets/js/swipe/design-index.js
// The swipe flow's showcase list. The catalogue is organised by door TYPE (Single / Double /
// Stable / Avantal), but the swipe flow asks for the DESIGN first — so this inverts it: one
// entry per design, recording which types offer it and under which exact Endurance label.
//   • Single and Double share the same 88 composite designs (same labels).
//   • Stable offers 30 of them as "<Design> Stable".
//   • Avantal's 13 entries are 5 designs x cassette colour ("Antares (Signal Grey Cassette)");
//     they collapse to one design each with the cassettes as variants (Sirius has none).
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_DesignIndex = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var COMPOSITE_TYPES = ['Single Door', 'Double Door', 'Stable Door'];
	var ALUMINIUM = 'Avantal';
	var FILTER_ORDER = ['Glazed', 'Solid', 'Contemporary', 'Georgian', 'Aluminium'];
	var CASSETTE_RE = /^(.*?)\s*\((.+?) Cassette\)\s*$/;
	// Endurance spells the black cassette two ways ("Ulti-Matt" and "Uni-Matt") — same finish.
	function cassetteName(raw) { return raw.replace(/^Uni-Matt/, 'Ulti-Matt'); }

	function styleLabels(node) {
		var f = node && node.fields && node.fields['Door Design'];
		return f ? f.map(function (c) { return c.label; }) : [];
	}

	function build(customerView, categories) {
		var byType = (customerView && customerView.byType) || {};
		var cats = categories || {};
		var designs = [];
		var byKey = {};

		function add(key, family, category) {
			if (!byKey[key]) {
				byKey[key] = { key: key, name: key, family: family, category: category, types: {}, variants: [] };
				designs.push(byKey[key]);
			}
			return byKey[key];
		}

		// Composite designs, in the Single range's order (the order Endurance lists them).
		var single = byType['Single Door'] ? 'Single Door' : 'Double Door';
		styleLabels(byType[single]).forEach(function (label) {
			var cat = (cats[single] && cats[single][label]) || 'Contemporary';
			add(label, 'composite', cat);
		});
		COMPOSITE_TYPES.forEach(function (type) {
			styleLabels(byType[type]).forEach(function (label) {
				var base = type === 'Stable Door' ? label.replace(/ Stable$/, '') : label;
				var d = byKey[base] || add(base, 'composite', (cats[type] && cats[type][label]) || 'Contemporary');
				d.types[type] = label;
			});
		});

		// Aluminium: one design per base name, each cassette colour a variant.
		styleLabels(byType[ALUMINIUM]).forEach(function (label) {
			var m = label.match(CASSETTE_RE);
			var base = m ? m[1] : label;
			var d = add(base, 'aluminium', 'Aluminium');
			d.variants.push({ label: label, cassette: m ? cassetteName(m[2]) : null });
			if (!d.types[ALUMINIUM]) { d.types[ALUMINIUM] = label; } // first cassette is the default
		});

		var present = {};
		designs.forEach(function (d) { present[d.category] = true; });
		var filters = ['All'].concat(FILTER_ORDER.filter(function (f) { return present[f]; }));
		return { designs: designs, byKey: byKey, filters: filters };
	}

	function matches(design, filter) {
		return !filter || filter === 'All' || design.category === filter;
	}

	// Door types a design comes in, in the order the type step shows them.
	function typesFor(design) {
		return COMPOSITE_TYPES.concat([ALUMINIUM]).filter(function (t) { return !!design.types[t]; });
	}

	// An exact Endurance style label (from a saved design) back to its showcase design.
	function designForLabel(index, label) {
		for (var i = 0; i < index.designs.length; i++) {
			var d = index.designs[i];
			for (var t in d.types) { if (d.types[t] === label) { return d; } }
			for (var v = 0; v < d.variants.length; v++) { if (d.variants[v].label === label) { return d; } }
		}
		return null;
	}

	return { build: build, matches: matches, typesFor: typesFor, designForLabel: designForLabel, ALUMINIUM: ALUMINIUM };
}));
