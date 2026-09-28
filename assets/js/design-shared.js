// assets/js/design-shared.js
// Design rules shared by the classic wizard and the swipe flow, so neither copies the other:
//   • enrichCustomerView — marks per-style letterplate-position + decorative-sidelight support
//   • furniture ↔ finish compatibility (which handles/letterplates come in which finish)
//   • HARDWARE_HEX swatch colours and cleanDesign()
// Pure functions of (renderModel, doorType, design) — no DOM, no app state.
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
	else { root.HD_DD_Shared = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (root) {
	'use strict';

	// Hardware-finish swatch chips — a representative colour per Endurance finish (the
	// asset host has no per-finish swatch image). A subtle gradient gives a metallic read.
	var HARDWARE_HEX = {
		'Chrome':          'linear-gradient(135deg,#e9edf1,#aab0b8)',
		'Black':           '#1f1f1f',
		'Gold':            'linear-gradient(135deg,#e0c06a,#b8902f)',
		'Stainless Steel': 'linear-gradient(135deg,#cdd1d6,#a3a8ae)',
		'Antique Black':   '#2b2722',
		'Graphite':        '#4c5054',
		'Bronze':          'linear-gradient(135deg,#8a6a48,#5d422a)',
		'Forged Black':    '#1b1b1b',
		'Pewter':          'linear-gradient(135deg,#9a9ca0,#74777b)',
		'Matt Black':      '#2b2b2b',
		'Satin Brass':     'linear-gradient(135deg,#c6a86a,#9c7f45)'
	};

	function renderModelApi() {
		if (root && root.HD_DD_RenderModel) { return root.HD_DD_RenderModel; }
		try { return require('./render-model.js'); } catch (e) { return null; }
	}

	// Mark, per type, the styles whose mould offers the Middle/Bottom letterplate-position
	// choice and the styles that can show a decorative (door-matching) sidelight, so the step
	// config can show those choices only where they apply. Mutates and returns customerView.
	function enrichCustomerView(customerView, renderModel) {
		if (!renderModel || !renderModel.types || !customerView || !customerView.byType) { return customerView; }
		var sideByKey = renderModel.sideDesignByKey || {};
		Object.keys(customerView.byType).forEach(function (t) {
			var rmStyles = (renderModel.types[t] || {}).styles || {};
			var posStyles = {};
			var decoStyles = {};
			Object.keys(rmStyles).forEach(function (s) {
				// 'bottom' = a glazed style whose Middle plate covers the glass (default it to the
				// bottom rail); 'middle' = the plate's natural central spot is already clear.
				if (rmStyles[s].letterplateBottomCy != null) { posStyles[s] = rmStyles[s].letterplateDefaultBottom ? 'bottom' : 'middle'; }
				if (rmStyles[s].cassetteKey && sideByKey[rmStyles[s].cassetteKey]) { decoStyles[s] = true; }
			});
			customerView.byType[t].letterplatePosStyles = posStyles;
			customerView.byType[t].decorativeSideStyles = decoStyles;
		});
		return customerView;
	}

	// "Chrome, Gold & Graphite" — for the "…only" note on greyed handle tiles.
	function formatColourList(arr) {
		if (!arr || !arr.length) { return ''; }
		if (arr.length === 1) { return arr[0]; }
		return arr.slice(0, -1).join(', ') + ' & ' + arr[arr.length - 1];
	}

	// Drop UI-only keys (anything prefixed with "_") from the design payload.
	function cleanDesign(design) {
		var out = {};
		Object.keys(design).forEach(function (h) { if (h.charAt(0) !== '_') { out[h] = design[h]; } });
		return out;
	}

	// A recolourable furniture item only comes in the finishes whose image file exists. Returns
	// the finish LABELS it's offered in, or null for a fixed/product item (carries its own finish).
	function furnitureAvailableColours(model, furnMap, label) {
		var RM = renderModelApi();
		if (!model || !furnMap || !furnMap[label] || !RM) { return null; }
		var info = RM.furnitureColourInfo(model, furnMap[label].url);
		if (!info) { return null; }
		var tokenToLabel = {};
		for (var lbl in model.hardwareColours) {
			if (Object.prototype.hasOwnProperty.call(model.hardwareColours, lbl)) { tokenToLabel[model.hardwareColours[lbl]] = lbl; }
		}
		// An alternate token (the finger pull's MattSilver) stands in for a canonical finish token.
		var aliases = model.furnitureColourAliases || {};
		return info.variants.map(function (t) { return tokenToLabel[aliases[t] || t]; }).filter(Boolean);
	}

	// The finish LABELS a handle/letterplate is offered in, from Endurance's exact per-finish lists
	// (model.finishFurniture). null when that data is absent. Labels carry odd trailing spaces.
	function furnitureFinishes(model, label, kind) {
		var ff = model && model.finishFurniture;
		if (!ff) { return null; }
		var target = String(label).trim();
		var out = [];
		for (var fin in ff) {
			if (!Object.prototype.hasOwnProperty.call(ff, fin)) { continue; }
			var list = ff[fin][kind] || [];
			for (var i = 0; i < list.length; i++) { if (String(list[i]).trim() === target) { out.push(fin); break; } }
		}
		return out;
	}

	// Why a handle/letterplate can't be picked with the chosen finish ("Chrome & Gold only"), or null.
	// stepKey: 'handle' | 'letterplate'.
	function disabledReason(model, type, design, stepKey, label) {
		if (stepKey !== 'handle' && stepKey !== 'letterplate') { return null; }
		var hw = design['Hardware Type'];
		if (!hw) { return null; }
		var kind = stepKey === 'handle' ? 'handles' : 'letterplates';
		var finishes = furnitureFinishes(model, label, kind);
		if (finishes !== null) {
			// `[]` = an item we model that Endurance never lists (label drift) — don't block it.
			if (!finishes.length || finishes.indexOf(hw.label) !== -1) { return null; }
			return formatColourList(finishes) + ' only';
		}
		var T = model && model.types ? model.types[type] : null;
		if (!T) { return null; }
		var avail = furnitureAvailableColours(model, stepKey === 'handle' ? T.handles : T.letterplates, label);
		if (!avail || avail.indexOf(hw.label) !== -1) { return null; }
		return formatColourList(avail) + ' only';
	}

	// When the finish changes, drop a now-incompatible handle or letterplate (mutates design).
	function resetFurnitureIfIncompatible(model, type, design) {
		if (!design['Hardware Type'] || !model) { return; }
		[['Handle', 'handle'], ['Letterplate', 'letterplate']].forEach(function (pair) {
			var sel = design[pair[0]];
			if (sel && disabledReason(model, type, design, pair[1], sel.label)) { delete design[pair[0]]; }
		});
	}

	// Borrow a handle's image from any door type that captured it (handle products are
	// identical across types). Thumbnails only.
	function handleImageFromAnyType(model, label) {
		var types = model && model.types;
		if (!types) { return null; }
		for (var t in types) {
			if (Object.prototype.hasOwnProperty.call(types, t)) {
				var hh = types[t].handles && types[t].handles[label];
				if (hh && hh.url) { return hh.url; }
			}
		}
		return null;
	}

	return {
		HARDWARE_HEX: HARDWARE_HEX, enrichCustomerView: enrichCustomerView, formatColourList: formatColourList,
		cleanDesign: cleanDesign, furnitureAvailableColours: furnitureAvailableColours, furnitureFinishes: furnitureFinishes,
		disabledReason: disabledReason, resetFurnitureIfIncompatible: resetFurnitureIfIncompatible,
		handleImageFromAnyType: handleImageFromAnyType
	};
}));
