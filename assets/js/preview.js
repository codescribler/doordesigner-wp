/*
 * HD Door Designer — canvas door compositor.
 * ------------------------------------------------------------------
 * Paints the door by stacking the layers that HD_DD_RenderModel.assemble()
 * resolves for the current design, each placed by its geometry
 * (cx/cy = centre, w/h = size, rotation deg, flipH). Image URLs are relative;
 * they're resolved against the configured asset base (Endurance host for dev,
 * the local mirror for production).
 *
 * window.HD_DD_Preview.create(canvas, { model, assetBase }) -> instance
 *   instance.render(type, design) -> Promise
 */
(function () {
	'use strict';

	// Stage box from the layers' extents (handles plain vs sidelit widths). Falls
	// back to the per-type canvas if there are no layers yet.
	function deriveStage(layers, fallback) {
		if (!layers || !layers.length) { return fallback || { width: 160, height: 330 }; }
		var maxX = 0, maxY = 0;
		layers.forEach(function (l) {
			maxX = Math.max(maxX, (l.cx || 0) + (l.w || 0) / 2);
			maxY = Math.max(maxY, (l.cy || 0) + (l.h || 0) / 2);
		});
		return { width: Math.ceil(maxX) || 160, height: Math.ceil(maxY) || 330 };
	}

	var cache = {};
	function loadImage(url) {
		if (cache[url]) { return cache[url]; }
		cache[url] = new Promise(function (resolve, reject) {
			var img = new Image();
			// No crossOrigin: hotlinked dev images (no CORS headers) must still display.
			// Production serves a same-origin mirror, so the canvas isn't tainted there.
			img.onload = function () { resolve(img); };
			img.onerror = function () { reject(new Error('img ' + url)); };
			img.src = url;
		});
		return cache[url];
	}

	function Compositor(canvas, opts) {
		opts = opts || {};
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');
		this.model = opts.model;
		this.assetBase = (opts.assetBase || '').replace(/\/$/, '');
		this._token = 0;
	}

	Compositor.prototype.resolveUrl = function (rel) {
		// Already absolute (mirrored to a full URL) or root-relative? leave it.
		var base = (/^https?:\/\//.test(rel) || rel.charAt(0) === '/') ? rel : (this.assetBase ? (this.assetBase + '/' + rel) : rel);
		return encodeURI(base); // filenames contain spaces / parentheses.
	};

	Compositor.prototype.render = function (type, design) {
		var self = this;
		var token = ++this._token;
		var T = this.model && this.model.types ? this.model.types[type] : null;
		if (!T) { return Promise.resolve(); }

		var layers = window.HD_DD_RenderModel.assemble(this.model, type, design);
		// Stage derived from the actual layers so sidelit doors (wider) size correctly.
		var stage = deriveStage(layers, T.canvas);

		// Hinge side mirrors the whole door (handle moves to the other side). The decision
		// lives in the shared render model so the Node build + browser agree and can't drift.
		var flipDoor = window.HD_DD_RenderModel.shouldFlip(this.model, type, design);

		// Size the backing canvas to the stage aspect (crisp on hi-dpi).
		var cssW = this.canvas.clientWidth || 360;
		var dpr = window.devicePixelRatio || 1;
		this.canvas.width = Math.round(cssW * dpr);
		this.canvas.height = Math.round(cssW * (stage.height / stage.width) * dpr);
		var scale = this.canvas.width / stage.width;

		return Promise.all(layers.map(function (l) {
			return loadImage(self.resolveUrl(l.url)).then(
				function (img) { return { l: l, img: img }; },
				function () { return null; } // tolerate a missing asset
			);
		})).then(function (res) {
			if (token !== self._token) { return; } // superseded by a newer render
			var ctx = self.ctx;
			ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
			ctx.save();
			if (flipDoor) { ctx.translate(self.canvas.width, 0); ctx.scale(-1, 1); } // hinge-side mirror
			res.forEach(function (r) {
				if (!r) { return; }
				var l = r.l;
				var w = l.w * scale, h = l.h * scale;
				var cx = l.cx * scale, cy = l.cy * scale;
				var rot = (l.rotation || 0) * Math.PI / 180;
				ctx.save();
				ctx.translate(cx, cy);
				if (rot) { ctx.rotate(rot); }
				if (l.flipH) { ctx.scale(-1, 1); }
				ctx.drawImage(r.img, -w / 2, -h / 2, w, h);
				ctx.restore();
			});
			ctx.restore();
		});
	};

	window.HD_DD_Preview = { create: function (canvas, opts) { return new Compositor(canvas, opts); } };
})();
