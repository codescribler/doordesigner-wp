/*
 * HD Door Designer — render-model assembler (shared by Node build + browser).
 * ------------------------------------------------------------------
 * Given a compiled render model + a chosen design, returns the ordered list of
 * layers (relative url + geometry) to paint. UMD so tools/build-render-model.js
 * (Node) and the browser compositor use the SAME logic — they can't drift.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_RenderModel = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	// Back→front paint order. The baseline composite omits Knockers/Letterplates,
	// so we can't derive this from the data alone.
	var Z = ['DoorBlanks', 'StableDoorCentreRails', 'DoorCassettes', 'DoorGlazing', 'Handles', 'HandlesRight', 'Knockers', 'Letterplates', 'DripBars', 'Side', 'DoorFrames'];

	function slotOf(u) { var m = String(u).match(/Images\/([^/]+)\//); return m ? m[1] : '?'; }

	// Borrow a handle's captured layer from any door type that has it (handle products
	// are identical across types; some types didn't capture every handle's layer).
	function handleFromAnyType(model, label) {
		var types = (model && model.types) || {};
		for (var t in types) {
			if (Object.prototype.hasOwnProperty.call(types, t)) {
				var h = types[t].handles && types[t].handles[label];
				if (h && h.url) { return h; }
			}
		}
		return null;
	}

	// Same story for knockers: double doors (and Avantal) never captured a Knockers layer,
	// but the knocker product is identical across types — so borrow the image from a type
	// that has it (single/stable doors capture all 30).
	function knockerFromAnyType(model, label) {
		var types = (model && model.types) || {};
		for (var t in types) {
			if (Object.prototype.hasOwnProperty.call(types, t)) {
				var k = types[t].knockers && types[t].knockers[label];
				if (k && k.url) { return k; }
			}
		}
		return null;
	}

	// Sidelight glass is an OVERLAY on the wide frame (which already renders the solid
	// side panels). Endurance draws it only when the sidelight is Glazed; picking
	// Unglazed simply omits the overlay. Default to Glazed (Endurance's own default)
	// so the preview shows glass the moment a sidelit frame is chosen.
	function sidelightGlazed(design) {
		var t = design['Sidelight Type'];
		return !t || t.label !== 'Unglazed';
	}

	// Whole-door horizontal mirror for the chosen hinge side. The captured baseline is a
	// RIGHT-hinged / RIGHT-leaf door, so its handle already sits on the correct (left/latch)
	// side. We therefore mirror ONLY when the customer picks the OPPOSITE (left) hinge.
	// Sidelit doors never mirror — the frame shape fixes the side, and the sidelit
	// composites are captured at the left-hinge baseline.
	function shouldFlip(model, type, design) {
		var T = model && model.types ? model.types[type] : null;
		if (!T) { return false; }
		var frameShape = (design['Frame Design'] && design['Frame Design'].label) || '';
		var sidelit = !!(T.sidelights && T.sidelights.shapes && T.sidelights.shapes[frameShape]);
		if (sidelit) { return false; }
		var hinge = (design['Door Hinged On'] && design['Door Hinged On'].label) ||
			(design['Master Leaf'] && design['Master Leaf'].label) || '';
		return /left/i.test(hinge);
	}

	// Recolour a furniture image to the chosen hardware finish, exactly as the Endurance
	// designer does: swap the filename's trailing colour token (LeverLever`Chrome` ->
	// LeverLever`Black`). Only swaps when that base actually has the target colour — a
	// missing variant would 404 and silently drop the handle, so we leave it as captured.
	// `hwToken` is the selected finish's filename token (from model.hardwareColours);
	// model.furnitureColours lists the tokens each base provides. Both are built read-only
	// by tools/probe-hardware-colours.js, so fixed furniture (pull handles, product-colour
	// knockers) simply has no token to match and is never touched.
	// For a recolourable furniture image, the { base, variants } it belongs to — base is
	// the filename with its captured colour token stripped, variants the tokens that base
	// is available in. null for fixed / product-colour furniture (no recognised token, or
	// a base the probe never found). Shared by the recolour below AND the wizard's handle
	// greying so both use exactly the same base detection.
	function furnitureColourInfo(model, url) {
		if (!url || !model || !model.furnitureColours || !model.hardwareColours) { return null; }
		var stem = String(url).split('/').pop().replace(/\.\w+$/, '');
		var tokens = [];
		for (var k in model.hardwareColours) {
			if (Object.prototype.hasOwnProperty.call(model.hardwareColours, k)) { tokens.push(model.hardwareColours[k]); }
		}
		tokens.sort(function (a, b) { return b.length - a.length; }); // AntiqueBlack before Black
		for (var i = 0; i < tokens.length; i++) {
			var tok = tokens[i];
			if (stem.length > tok.length && stem.slice(-tok.length) === tok) {
				var base = stem.slice(0, -tok.length);
				return model.furnitureColours[base] ? { base: base, variants: model.furnitureColours[base] } : null;
			}
		}
		return null;
	}

	// The actual filename token to use for a finish on a given base. Normally the finish's own
	// token, but some bases spell a finish with a different token (the finger pull renders the
	// Stainless Steel finish as `MattSilver`, not the `Satin` the levers use), so fall back to
	// an alias token the base actually has. Returns null when the base has neither.
	function resolveColourToken(model, hwToken, variants) {
		if (variants.indexOf(hwToken) !== -1) { return hwToken; }
		var aliases = (model && model.furnitureColourAliases) || {};
		for (var alt in aliases) {
			if (Object.prototype.hasOwnProperty.call(aliases, alt) && aliases[alt] === hwToken && variants.indexOf(alt) !== -1) { return alt; }
		}
		return null;
	}

	function recolourFurniture(url, model, hwToken) {
		if (!hwToken) { return url; }
		var info = furnitureColourInfo(model, url);
		if (!info) { return url; }
		var token = resolveColourToken(model, hwToken, info.variants);
		if (!token) { return url; } // fixed, or doesn't come in this finish — keep as captured
		var mm = String(url).match(/^(.*\/)([^/]+)(\.\w+)$/);
		return mm ? mm[1] + info.base + token + mm[3] : url;
	}

	var ASSET_PREFIX = 'Assets/CompositeDoors/Images/';

	function assemble(model, type, design) {
		var T = model.types ? model.types[type] : null;
		if (!T) { return []; }
		var get = function (h) { return (design[h] && design[h].label) || ''; };
		// The chosen hardware finish's filename token (null for finishes with no recolour
		// variant, e.g. Forged Black — those leave the furniture at its captured colour).
		var hwToken = model.hardwareColours ? model.hardwareColours[get('Hardware Type')] : null;
		var colour = get('Door Colour (External)') || T.baselineColour;
		var style = T.styles[get('Door Design')] || { mould: T.baselineMould, cassetteKey: T.baselineCassetteKey, blankGeom: null, cassetteGeom: [], glazingGeom: [] };
		var layers = [];
		function push(url, g) { if (url && g) { var l = { slot: slotOf(url), url: url }; for (var k in g) { if (Object.prototype.hasOwnProperty.call(g, k)) { l[k] = g[k]; } } layers.push(l); } }

		// blank (style mould + colour)
		if (style.mould && style.blankGeom) { push(ASSET_PREFIX + 'DoorBlanks/' + style.mould + '/Thumbnails/' + colour + '.jpg', style.blankGeom); }
		// cassettes (style key + colour)
		(style.cassetteGeom || []).forEach(function (g) { if (style.cassetteKey) { push(ASSET_PREFIX + 'DoorCassettes/' + style.cassetteKey + '/Thumbnails/' + colour + '.png', g); } });
		// glazing (glass image at each aperture; geometry from the style's inner cassettes)
		var glass = get('Door Glass');
		if (glass && !/^unglazed$/i.test(glass) && style.cassetteKey && (style.glazingGeom || []).length) {
			style.glazingGeom.forEach(function (g) { push(ASSET_PREFIX + 'DoorGlazing/' + glass + '/Thumbnails/' + style.cassetteKey + '.png', g); });
		}
		// handle. Some types didn't capture every handle's layer (e.g. levers on double
		// doors) — borrow the image from a type that has it, drawn at this type's handle
		// position with the handle's own size, so the selected handle shows on the door.
		var handle = T.handles[get('Handle')];
		if (!handle) {
			var borrowed = handleFromAnyType(model, get('Handle'));
			if (borrowed && T.baseHandle) {
				// The borrowed handle was captured on its source leaf's latch edge. The two
				// leaves are geometrically identical, so place it on THIS leaf at the mirror
				// position — the meeting-stile side, on the slab (not over the centre split) —
				// and flip it so an asymmetric lever points inward.
				var leafCx = (style.blankGeom && style.blankGeom.cx) || T.baseHandle.geom.cx;
				handle = { url: borrowed.url, geom: { cx: 2 * leafCx - borrowed.geom.cx, cy: borrowed.geom.cy, w: borrowed.geom.w, h: borrowed.geom.h, rotation: borrowed.geom.rotation || 0, flipH: !borrowed.geom.flipH, leftSlab: false } };
			} else {
				handle = T.baseHandle;
			}
		}
		if (handle) { push(recolourFurniture(handle.url, model, hwToken), handle.geom); }
		// knocker. Its HEIGHT is mould-dependent too (it sits in an upper panel gap), so take
		// the cy from the chosen style — same approach as the letterplate. Double doors never
		// captured a knocker layer, so borrow the image; it then draws once on the left leaf
		// (leftSlab:false skips the leaf-mirror below — a door takes ONE knocker, not one per leaf).
		var knockLabel = get('Knocker');
		var knock = T.knockers[knockLabel];
		if (!knock && knockLabel && !/^no knocker$/i.test(knockLabel)) { knock = knockerFromAnyType(model, knockLabel); }
		if (knock) {
			var kgeom = knock.geom;
			var knStyle = T.styles[get('Door Design')];
			var knCy = knStyle && knStyle.knockerCy;
			if (knCy != null || type === 'Double Door') {
				kgeom = {};
				for (var kk in knock.geom) { if (Object.prototype.hasOwnProperty.call(knock.geom, kk)) { kgeom[kk] = knock.geom[kk]; } }
				if (knCy != null) { kgeom.cy = knCy; }
				if (type === 'Double Door') { kgeom.leftSlab = false; }
			}
			push(knock.url, kgeom);
		}
		// letterplate. Its HEIGHT is mould-dependent (the plate sits in a panel gap that moves
		// with the style's pressing), so take the cy from the chosen style. And a double door
		// must not get one per leaf (Endurance flags it excludeDouble), so mark it leftSlab:false
		// to skip the leaf-mirror below.
		var letter = T.letterplates && T.letterplates[get('Letterplate')];
		if (letter) {
			var lgeom = letter.geom;
			var lpStyle = T.styles[get('Door Design')];
			var lpCy = lpStyle && lpStyle.letterplateCy;
			// On moulds that offer it, "Letterplate Position: Bottom" drops the plate to the
			// bottom rail. Glazed styles whose Middle plate would cover the glass (flagged
			// letterplateDefaultBottom) default to Bottom too — unless the customer explicitly
			// picks Middle. Everything else keeps the per-mould central (Middle) position.
			if (lpStyle && lpStyle.letterplateBottomCy != null) {
				var lpPos = get('Letterplate Position');
				if (/bottom/i.test(lpPos) || (!/middle/i.test(lpPos) && lpStyle.letterplateDefaultBottom)) {
					lpCy = lpStyle.letterplateBottomCy;
				}
			}
			if (type === 'Double Door' || lpCy != null) {
				lgeom = {};
				for (var lk in letter.geom) { if (Object.prototype.hasOwnProperty.call(letter.geom, lk)) { lgeom[lk] = letter.geom[lk]; } }
				if (lpCy != null) { lgeom.cy = lpCy; }
				if (type === 'Double Door') { lgeom.leftSlab = false; }
			}
			push(recolourFurniture(letter.url, model, hwToken), lgeom);
		}
		// drip bar
		if (T.dripbar) { push(T.dripbar.url, T.dripbar.geom); }

		// --- Sidelights: shift the door body into the centre, add the side panels,
		// and swap the plain frame for the wide frame variant for this shape. ---
		var frame = T.frames[get('Frame Colour')] || T.baseFrame;
		var sd = (T.sidelights && T.sidelights.shapes) ? T.sidelights.shapes[get('Frame Design')] : null;
		if (sd) {
			layers.forEach(function (l) { l.cx += sd.doorOffsetX; });
			// Side-glass overlays only when Glazed; Unglazed shows the frame's solid panels.
			if (sidelightGlazed(design)) {
				(sd.panels || []).forEach(function (p) { push(p.url, p.geom); layers[layers.length - 1].slot = 'Side'; });
			}
			if (frame) {
				push(frame.url.replace(/(\/DoorFrames\/)[^/]+(\/)/, '$1' + sd.frameVariant + '$2'), sd.frameGeom);
			}
		} else if (frame) {
			push(frame.url, frame.geom);
		}

		// --- Double door: the capture records only the LEFT leaf plus the full-width
		// frame. Endurance draws the right leaf by mirroring the left across the door
		// centre (the DrawOnLeftSlab flag). Reproduce that — mirror every per-leaf layer;
		// the full-width frame and absolutely-placed layers (the handle) draw once. ---
		if (type === 'Double Door' && !sd) {
			var cx0 = (T.canvas && T.canvas.width ? T.canvas.width : 294) / 2;
			var right = [];
			layers.forEach(function (l) {
				if (l.slot === 'DoorFrames' || l.leftSlab === false) { return; }
				var m = {};
				for (var k in l) { if (Object.prototype.hasOwnProperty.call(l, k)) { m[k] = l[k]; } }
				m.cx = 2 * cx0 - l.cx;
				m.flipH = !l.flipH;
				if (l.urlRight) { m.url = l.urlRight; m.slot = slotOf(l.urlRight); }
				right.push(m);
			});
			layers = layers.concat(right);
		}

		// paint order
		var zi = function (s) { var i = Z.indexOf(s); return i === -1 ? Z.indexOf('DoorGlazing') : i; };
		layers.forEach(function (l, i) { l._i = i; });
		layers.sort(function (a, b) { return (zi(a.slot) - zi(b.slot)) || (a._i - b._i); });
		layers.forEach(function (l) { delete l._i; });
		return layers;
	}

	return { assemble: assemble, slotOf: slotOf, shouldFlip: shouldFlip, furnitureColourInfo: furnitureColourInfo };
}));
