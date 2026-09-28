// assets/js/swipe/door-card.js
// One carousel card: the customer's own door with one option applied, composited from the
// same image layers as the classic preview (HD_DD_Preview). For small parts — handle,
// letterplate, knocker — the card adds a zoomed close-up cropped from that part's layer, so
// the difference between two handles is visible on a phone.
//
//   HD_DD_DoorCard.paint(cardEl, { model, assetBase, type, design, closeUp: 'handle'|'letterplate'|'knocker'|null })
//     -> Promise (resolves once drawn; the returned canvas is on cardEl.firstChild)
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_DoorCard = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	// Render-model slot names (the asset folder) for each close-up kind.
	var CLOSEUP_SLOTS = {
		handle: ['Handles', 'HandlesRight'],
		letterplate: ['Letterplates'],
		knocker: ['Knockers']
	};

	function stageOf(layers) {
		var w = 0, h = 0;
		layers.forEach(function (l) {
			w = Math.max(w, (l.cx || 0) + (l.w || 0) / 2);
			h = Math.max(h, (l.cy || 0) + (l.h || 0) / 2);
		});
		return { width: Math.ceil(w) || 160, height: Math.ceil(h) || 330 };
	}

	// The close-up crop box in stage units: the part's layer, padded and made square-ish.
	function cropBox(layers, kind, flip, stage) {
		var slots = CLOSEUP_SLOTS[kind];
		if (!slots) { return null; }
		var part = null;
		for (var i = 0; i < layers.length; i++) { if (slots.indexOf(layers[i].slot) !== -1) { part = layers[i]; break; } }
		if (!part) { return null; }
		var size = Math.max(part.w, part.h) * 1.5 + 12;
		var cx = flip ? stage.width - part.cx : part.cx;
		return { x: cx - size / 2, y: part.cy - size / 2, w: size, h: size };
	}

	function paint(cardEl, o) {
		var RM = window.HD_DD_RenderModel;
		cardEl.innerHTML = '';
		var canvas = document.createElement('canvas');
		canvas.className = 'hd-sw-card__door';
		cardEl.appendChild(canvas);
		if (!window.HD_DD_Preview || !o.model || !RM) { return Promise.resolve(canvas); }
		var comp = window.HD_DD_Preview.create(canvas, { model: o.model, assetBase: o.assetBase });
		var drawn;
		try { drawn = comp.render(o.type, o.design) || Promise.resolve(); } catch (e) { drawn = Promise.resolve(); }
		return drawn.then(function () {
			cardEl.classList.add('is-ready');
			if (!o.closeUp) { return canvas; }
			var layers = RM.assemble(o.model, o.type, o.design);
			var stage = stageOf(layers);
			var box = cropBox(layers, o.closeUp, RM.shouldFlip(o.model, o.type, o.design), stage);
			if (!box || !canvas.width) { return canvas; }
			var k = canvas.width / stage.width;
			var zoom = document.createElement('canvas');
			zoom.className = 'hd-sw-card__zoom';
			zoom.width = 180; zoom.height = 180;
			try {
				var ctx = zoom.getContext('2d');
				ctx.fillStyle = '#f3f3f1';
				ctx.fillRect(0, 0, 180, 180);
				ctx.drawImage(canvas, box.x * k, box.y * k, box.w * k, box.h * k, 0, 0, 180, 180);
				cardEl.appendChild(zoom);
			} catch (e) { /* tainted or empty canvas — the full door still shows */ }
			return canvas;
		}).catch(function () { return canvas; });
	}

	return { paint: paint, cropBox: cropBox, stageOf: stageOf };
}));
