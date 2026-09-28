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
 *   instance.render(type, design, { omitSlots }?) -> Promise
 *   instance.renderRegion(type, design, box, { size, omitSlots }?) -> Promise   (close-ups)
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
	var SLOW_MS = 8000;
	function download(url) {
		if (!cache[url]) {
			cache[url] = new Promise(function (resolve, reject) {
				var img = new Image();
				// No crossOrigin: hotlinked dev images (no CORS headers) must still display.
				// Production serves a same-origin mirror, so the canvas isn't tainted there.
				img.onload = function () { resolve(img); };
				img.onerror = function () { delete cache[url]; reject(new Error('img ' + url)); };
				img.src = url;
			});
		}
		return cache[url];
	}
	// A layer that is slow upstream (the image cache fetching it from Endurance for the first
	// time) must not hold the whole door back: after SLOW_MS this render skips it, while the
	// download carries on so a later render of the door includes it.
	function loadImage(url) {
		return Promise.race([download(url), new Promise(function (resolve, reject) {
			setTimeout(function () { reject(new Error('slow ' + url)); }, SLOW_MS);
		})]);
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

	// Draw loaded layers in STAGE units — the caller sets the transform (scale / mirror / crop).
	function drawLayers(ctx, res) {
		res.forEach(function (r) {
			if (!r) { return; }
			var l = r.l;
			ctx.save();
			ctx.translate(l.cx, l.cy);
			if (l.rotation) { ctx.rotate(l.rotation * Math.PI / 180); }
			if (l.flipH) { ctx.scale(-1, 1); }
			ctx.drawImage(r.img, -l.w / 2, -l.h / 2, l.w, l.h);
			ctx.restore();
		});
	}

	// Assemble + load a design's layers. Resolves { T, layers, stage, flip, res, slow } (or null).
	Compositor.prototype.prepare = function (type, design, opts) {
		var self = this;
		var T = this.model && this.model.types ? this.model.types[type] : null;
		if (!T) { return Promise.resolve(null); }
		var layers = window.HD_DD_RenderModel.assemble(this.model, type, design);
		var omit = (opts && opts.omitSlots) || null;
		if (omit) { layers = layers.filter(function (l) { return omit.indexOf(l.slot) === -1; }); }
		// Stage derived from the actual layers so sidelit doors (wider) size correctly.
		var stage = deriveStage(layers, T.canvas);
		// Hinge side mirrors the whole door (handle moves to the other side). The decision
		// lives in the shared render model so the Node build + browser agree and can't drift.
		var flip = window.HD_DD_RenderModel.shouldFlip(this.model, type, design);
		var slow = [];
		return Promise.all(layers.map(function (l) {
			var url = self.resolveUrl(l.url);
			return loadImage(url).then(
				function (img) { return { l: l, img: img }; },
				function (e) { if (/^slow /.test(e && e.message)) { slow.push(url); } return null; } // tolerate a missing asset
			);
		})).then(function (res) { return { T: T, layers: layers, stage: stage, flip: flip, res: res, slow: slow }; });
	};

	// Redraw once any layer skipped for being slow has arrived (unless superseded).
	Compositor.prototype.retryWhenLoaded = function (p, token, again) {
		var self = this;
		if (!p.slow.length) { return; }
		Promise.all(p.slow.map(function (u) { return download(u).catch(function () { return null; }); })).then(function () {
			if (token === self._token) { again(); }
		});
	};

	// opts.omitSlots: layer slots to leave out (e.g. ['Handles','HandlesRight'] for the
	// swipe showcase, which shows the bare design before any furniture is chosen).
	Compositor.prototype.render = function (type, design, opts) {
		var self = this;
		var token = ++this._token;
		return this.prepare(type, design, opts).then(function (p) {
			if (!p || token !== self._token) { return; } // superseded by a newer render
			// Size the backing canvas to the stage aspect (crisp on hi-dpi).
			var cssW = self.canvas.clientWidth || 360;
			var dpr = window.devicePixelRatio || 1;
			self.canvas.width = Math.round(cssW * dpr);
			self.canvas.height = Math.round(cssW * (p.stage.height / p.stage.width) * dpr);
			var scale = self.canvas.width / p.stage.width;
			var ctx = self.ctx;
			ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
			ctx.save();
			if (p.flip) { ctx.translate(self.canvas.width, 0); ctx.scale(-1, 1); } // hinge-side mirror
			ctx.scale(scale, scale);
			drawLayers(ctx, p.res);
			ctx.restore();
			self.retryWhenLoaded(p, token, function () { self.render(type, design, opts); });
		});
	};

	// A close-up: draw only `box` (stage units, in the door's DISPLAYED orientation — i.e.
	// already mirrored when the door is) into this canvas at opts.size CSS px, straight from the
	// full-resolution source images, so a small part is genuinely sharper, not an upscaled crop.
	Compositor.prototype.renderRegion = function (type, design, box, opts) {
		var self = this;
		var token = ++this._token;
		var size = (opts && opts.size) || 180;
		return this.prepare(type, design, opts).then(function (p) {
			if (!p || token !== self._token) { return; }
			var dpr = window.devicePixelRatio || 1;
			self.canvas.width = self.canvas.height = Math.round(size * dpr);
			var k = self.canvas.width / box.w;
			var ctx = self.ctx;
			ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
			ctx.fillStyle = '#f3f3f1';
			ctx.fillRect(0, 0, self.canvas.width, self.canvas.height);
			ctx.save();
			ctx.scale(k, k);
			ctx.translate(-box.x, -box.y);
			if (p.flip) { ctx.translate(p.stage.width, 0); ctx.scale(-1, 1); }
			drawLayers(ctx, p.res);
			ctx.restore();
			self.retryWhenLoaded(p, token, function () { self.renderRegion(type, design, box, opts); });
		});
	};

	window.HD_DD_Preview = { create: function (canvas, opts) { return new Compositor(canvas, opts); } };
})();
