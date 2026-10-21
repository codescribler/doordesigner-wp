// assets/js/designer3/d3-screens.js
// Designer 3's screens before saving: the door type, the style grid and the door itself (the
// complete door with orange "+" dots, the toolbox and the always-visible save box). They read
// state from HD_DD_Designer3App and call back into it; they hold no design state of their own.
//
//   HD_DD_D3Screens.type(app, el); .style(app, el); .door(app, el) -> { refresh() }; .placeholder(app, el); .loading(app)
(function (W) {
	'use strict';

	var COPY = {
		typeTitle: 'What kind of door?',
		styleTitle: 'Pick your style',
		styleHelp: 'Pick one and we’ll show you the finished door straight away. You can change anything after.',
		banner: 'Here’s your door. Tap a dot to change any part of it.',
		nudge: 'Looking good. Save it so you don’t lose it?',
		back: 'Back',
		loading: 'Loading your design…',
		later: 'Your design is saved.'
	};
	var DOT_NAMES = { glass: 'the glass', knocker: 'the knocker', handle: 'the handle', letterplate: 'the letterplate', colour: 'the colour' };

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}
	function P() { return W.HD_DD_SwipeParts; }
	function short(l) { return P() ? P().short(l) : String(l).trim(); }

	function header(app, shell, title, help, backTo) {
		var head = el('div', 'hd-d3-head');
		if (backTo) {
			var b = el('button', 'hd-d3-back', '‹');
			b.type = 'button';
			b.setAttribute('aria-label', COPY.back);
			b.addEventListener('click', function () { app.go(backTo); });
			head.appendChild(b);
		}
		head.appendChild(el('h2', 'hd-d3-title', title));
		shell.appendChild(head);
		if (help) { shell.appendChild(el('p', 'hd-d3-help', help)); }
	}

	// A style tile for any door type: all leaves composited from the same layers Classic's style tiles use
	// (RenderModel.assemble, the "no glass" cassettes so the design shows), placed as % of the stage.
	function styleTile(app, label) {
		var type = app.type(), RM = W.HD_DD_RenderModel, base = app.assetBase(), T = app.model && app.model.types && app.model.types[type];
		if (!RM || !base || !T) { return null; }
		var dd = { 'Door Type': { label: type }, 'Door Design': { label: label }, 'Door Colour (External)': { label: T.baselineColour } };
		var raw = RM.assemble(app.model, type, dd), maxX = 0, maxY = 0;
		var layers = raw.map(function (l) {
			maxX = Math.max(maxX, (l.cx || 0) + (l.w || 0) / 2);
			maxY = Math.max(maxY, (l.cy || 0) + (l.h || 0) / 2);
			return { url: l.url.replace(/(DoorCassettes\/[^/]+\/Thumbnails\/)[^/]+(\.png)/, '$1NoGlass$2'), cx: l.cx, cy: l.cy, w: l.w, h: l.h, flipH: !!l.flipH };
		});
		return layers.length ? { layers: layers, base: base, stage: { width: Math.ceil(maxX) || 294, height: Math.ceil(maxY) || 318 } } : null;
	}
	function layerBox(img) {
		var sw = img.stage.width, sh = img.stage.height, box = el('span', 'hd-d3-card__door');
		box.style.aspectRatio = sw + ' / ' + sh;
		img.layers.forEach(function (l) {
			var im = el('img', 'hd-d3-card__layer');
			im.alt = ''; im.loading = 'lazy';
			im.onerror = function () { if (im.parentNode) { im.parentNode.removeChild(im); } };
			im.style.left = ((l.cx - l.w / 2) / sw * 100) + '%';
			im.style.top = ((l.cy - l.h / 2) / sh * 100) + '%';
			im.style.width = (l.w / sw * 100) + '%';
			im.style.height = (l.h / sh * 100) + '%';
			if (l.flipH) { im.style.transform = 'scaleX(-1)'; }
			im.src = encodeURI(/^https?:\/\//.test(l.url) || l.url.charAt(0) === '/' ? l.url : img.base + '/' + l.url);
			box.appendChild(im);
		});
		return box;
	}

	// `img` is a picture URL, or { svg: '<svg…>' } for a drawn outline.
	function card(label, sub, img, on, onPick) {
		var b = el('button', 'hd-d3-card' + (on ? ' is-on' : ''));
		b.type = 'button';
		var media = el('span', 'hd-d3-card__media');
		if (img && img.svg) {
			media.innerHTML = img.svg;
		} else if (img && img.layers) {
			media.appendChild(layerBox(img));
		} else if (img) {
			var im = el('img');
			im.alt = ''; im.loading = 'lazy';
			im.onerror = function () { if (im.parentNode) { im.parentNode.removeChild(im); } };
			im.src = img;
			media.appendChild(im);
		}
		b.appendChild(media);
		b.appendChild(el('span', 'hd-d3-card__label', label));
		if (sub) { b.appendChild(el('span', 'hd-d3-card__sub', sub)); }
		b.addEventListener('click', onPick);
		return b;
	}

	// ---- 1. Door type -------------------------------------------------------------------
	function type(app, shell) {
		header(app, shell, COPY.typeTitle, '', null);
		var grid = el('div', 'hd-d3-grid hd-d3-grid--types');
		app.types().forEach(function (t) {
			// Style-neutral outlines (as Classic's first step), so Double and Stable do not look like a single slab.
			var art = W.HD_DD_D3TypeArt && W.HD_DD_D3TypeArt.svg(t);
			var first = (app.cv.byType[t].fields['Door Design'] || [])[0];
			var img = art ? { svg: art } : (first && P() ? P().blankThumb(app.assetBase(), app.model, t, first.label) : null);
			grid.appendChild(card(short(t), P() ? P().TYPE_DESC[t] : '', img, t === app.type(), function () { app.select('Door Type', t); }));
		});
		shell.appendChild(grid);
	}

	// ---- 2. Style -------------------------------------------------------------------------
	function style(app, shell) {
		header(app, shell, COPY.styleTitle, COPY.styleHelp, 'type');
		var cats = (app.categories && app.categories[app.type()]) || {};
		var styles = app.styles();
		var present = {};
		styles.forEach(function (s) { if (cats[s.label]) { present[cats[s.label]] = true; } });
		var filters = ['All'].concat(['Glazed', 'Solid', 'Contemporary', 'Georgian'].filter(function (f) { return present[f]; }));
		var grid = el('div', 'hd-d3-grid hd-d3-grid--styles');
		function fill() {
			grid.innerHTML = '';
			styles.filter(function (s) { return app.styleFilter === 'All' || !app.styleFilter || cats[s.label] === app.styleFilter; }).forEach(function (s) {
				var img = styleTile(app, s.label) || (P() ? P().blankThumb(app.assetBase(), app.model, app.type(), s.label) : null);
				grid.appendChild(card(short(s.label), '', img, s.label === app.style(), function () { app.select('Door Design', s.label); }));
			});
		}
		if (filters.length > 2) {
			var bar = el('div', 'hd-d3-filters');
			filters.forEach(function (f) {
				var b = el('button', 'hd-d3-filter' + ((app.styleFilter || 'All') === f ? ' is-on' : ''), f);
				b.type = 'button';
				b.addEventListener('click', function () {
					app.styleFilter = f;
					Array.prototype.forEach.call(bar.children, function (x) { x.classList.toggle('is-on', x === b); });
					fill();
				});
				bar.appendChild(b);
			});
			shell.appendChild(bar);
		}
		fill();
		shell.appendChild(grid);
	}

	// ---- 3. The door ------------------------------------------------------------------------
	function door(app, shell) {
		var RM = W.HD_DD_RenderModel, H = W.HD_DD_D3Hotspots;
		header(app, shell, short(app.style()) + ' ' + short(app.type()).toLowerCase() + ' door', '', 'style');
		var wrap = el('div', 'hd-d3-door');
		var main = el('div', 'hd-d3-main');
		var side = el('div', 'hd-d3-side');
		main.appendChild(el('p', 'hd-d3-banner', COPY.banner));
		var stage = el('div', 'hd-d3-stage');
		var frame = el('div', 'hd-d3-frame');
		var canvas = el('canvas', 'hd-d3-canvas');
		var dotLayer = el('div', 'hd-d3-dots');
		frame.appendChild(canvas); frame.appendChild(dotLayer);
		stage.appendChild(frame);
		main.appendChild(stage);
		var tools = el('div', 'hd-d3-tools');
		var dock = el('div', 'hd-d3-dock');
		var sheet = el('div', 'hd-d3-sheet');
		sheet.hidden = true;
		var nudge = el('div', 'hd-d3-nudgeslot');
		var save = el('div', 'hd-d3-saveslot');
		dock.appendChild(sheet); dock.appendChild(nudge); dock.appendChild(save);
		side.appendChild(tools); side.appendChild(dock);
		wrap.appendChild(main); wrap.appendChild(side);
		shell.appendChild(wrap);
		app.canvas = canvas;

		var comp = (W.HD_DD_Preview && app.model) ? W.HD_DD_Preview.create(canvas, { model: app.model, assetBase: app.assetBase() }) : null;
		var tb = W.HD_DD_D3Toolbox.create(app);
		app.toolbox = tb;
		var view = {};

		// Size the door to fit: a phone with the sheet open gets a smaller door above it.
		function size() {
			if (!RM || !H || !app.model) { return; }
			var st = H.stageOf(RM.assemble(app.model, app.type(), app.design(), app.OPTS), app.model.types[app.type()]);
			var vh = W.innerHeight || 800;
			var phone = !!(W.matchMedia && W.matchMedia('(max-width: 719px)').matches);
			var sheetOpen = shell.classList && shell.classList.contains('is-sheet');
			var maxH = phone ? vh * (sheetOpen ? 0.26 : 0.5) : Math.min(vh * 0.72, 640);
			var room = (stage.clientWidth || 320) - 24;
			frame.style.width = Math.round(Math.max(90, Math.min(room, maxH * st.width / st.height))) + 'px';
		}

		// Rebuilt on every change; a focused dot gets its focus back on its new twin.
		function dots() {
			var TB = W.HD_DD_D3Toolbox;
			var keep = TB.focusedKey([dotLayer]);
			dotLayer.innerHTML = '';
			app.dots().forEach(function (d) {
				var b = el('button', 'hd-d3-dot hd-d3-dot--' + d.key, '+');
				b.type = 'button';
				b.setAttribute('data-k', 'dot:' + d.key);
				b.setAttribute('aria-label', 'Change ' + (DOT_NAMES[d.key] || 'this part'));
				b.style.left = (d.x * 100) + '%';
				b.style.top = (d.y * 100) + '%';
				b.addEventListener('click', function () { tb.open(d.key, 'dot:' + d.key); });
				dotLayer.appendChild(b);
			});
			TB.restoreFocus([dotLayer], keep);
		}

		function paint() {
			var p = null;
			size();
			if (comp) { try { p = comp.render(app.type(), app.design(), app.OPTS); } catch (e) { /* missing asset */ } }
			dots();
			return app.painted(p);   // saves wait for it before they snapshot the canvas
		}

		function drawNudge() {
			nudge.innerHTML = '';
			if (!app.nudgeOn) { return; }
			var box = el('div', 'hd-d3-nudge');
			box.setAttribute('role', 'status');
			box.appendChild(el('span', 'hd-d3-nudge__text', COPY.nudge));
			var x = el('button', 'hd-d3-nudge__x', '✕');
			x.type = 'button';
			x.setAttribute('aria-label', 'Dismiss');
			x.addEventListener('click', function () { app.dismissNudge(); });
			box.appendChild(x);
			nudge.appendChild(box);
		}

		view.refresh = function () {
			var title = shell.querySelector && shell.querySelector('.hd-d3-title');
			if (title) { title.textContent = short(app.style()) + ' ' + short(app.type()).toLowerCase() + ' door'; }
			var p = paint(); tb.refresh(); drawNudge();
			return p;
		};

		tb.render(tools, { sheet: sheet, root: shell, onLayout: function () { paint(); } });
		app.saver().render(save);
		drawNudge();
		// After layout, so the stage has its width.
		app.paintSoon(paint);
		var t = null;
		function onResize() {
			clearTimeout(t);
			t = setTimeout(function () { tb.refresh(); paint(); }, 150);
		}
		if (W.addEventListener) { W.addEventListener('resize', onResize); }
		// Called by the app when this screen is replaced.
		view.destroy = function () { clearTimeout(t); if (W.removeEventListener) { W.removeEventListener('resize', onResize); } };
		return view;
	}

	function placeholder(app, shell) {
		header(app, shell, COPY.later, '', 'door');
	}

	function loading(app) {
		app.root.innerHTML = '';
		app.root.appendChild(el('div', 'hd-dd hd-d3 hd-d3-loading', COPY.loading));
	}

	W.HD_DD_D3Screens = { type: type, style: style, door: door, placeholder: placeholder, loading: loading, COPY: COPY, DOT_NAMES: DOT_NAMES };
})(typeof window !== 'undefined' ? window : this);
