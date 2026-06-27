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

	// Sidelight glass is an OVERLAY on the wide frame (which already renders the solid
	// side panels). Endurance draws it only when the sidelight is Glazed; picking
	// Unglazed simply omits the overlay. Default to Glazed (Endurance's own default)
	// so the preview shows glass the moment a sidelit frame is chosen.
	function sidelightGlazed(design) {
		var t = design['Sidelight Type'];
		return !t || t.label !== 'Unglazed';
	}

	var ASSET_PREFIX = 'Assets/CompositeDoors/Images/';

	function assemble(model, type, design) {
		var T = model.types ? model.types[type] : null;
		if (!T) { return []; }
		var get = function (h) { return (design[h] && design[h].label) || ''; };
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
				var bg = T.baseHandle.geom;
				// Borrowed-from is captured on its own leaf's latch edge; here it sits on the
				// opposite (meeting-stile) edge, so mirror it to keep a lever pointing inward.
				handle = { url: borrowed.url, geom: { cx: bg.cx, cy: bg.cy, w: borrowed.geom.w, h: borrowed.geom.h, rotation: borrowed.geom.rotation || 0, flipH: !borrowed.geom.flipH, leftSlab: bg.leftSlab } };
			} else {
				handle = T.baseHandle;
			}
		}
		if (handle) { push(handle.url, handle.geom); }
		// knocker
		var knock = T.knockers[get('Knocker')];
		if (knock) { push(knock.url, knock.geom); }
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

	return { assemble: assemble, slotOf: slotOf };
}));
