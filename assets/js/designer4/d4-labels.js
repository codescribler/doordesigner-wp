// assets/js/designer4/d4-labels.js
// Designer 4's part labels: a named button per changeable part ("Glass", "Handle"...) beside the
// door, or over its edge on a phone, each with a thin line to a small ring on the part. They take
// the place of Designer 3's "+" dots, which Designer 4 hides (hd-designer4.css). Where each label
// goes: d4-callouts.js.
//
//   HD_DD_D4Labels.create(app, shell, onDraw) -> { draw(), box(key), bounds(), destroy() }
// Each label carries its dot's data-k ("dot:<key>"), so focus keeping and the toolbox's "back to
// what opened it" still work, and opens the part exactly as the dot did. Designer 3 redraws its
// dots on every paint (a pick, a resize, the phone sheet opening): the labels follow each one, and
// onDraw runs after (the bubble follows the Handle label).
(function (W) {
	'use strict';

	var NEED = 'Handle: choose one';   // desktop; a phone has room for one word
	var SVG = 'http://www.w3.org/2000/svg';
	var PHONE = '(max-width: 719px)';
	var M = 4;            // labels keep this far (px) inside the stage and the screen
	var MIN_SHARE = 0.7;  // desktop: the door may shrink to this share to fit labels beside it

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}
	function svg(tag, attrs) {
		var n = document.createElementNS(SVG, tag);
		Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
		return n;
	}
	function q(root, cls) { return root && root.querySelector ? root.querySelector('.' + cls) : null; }
	function rect(n) { try { return n && n.getBoundingClientRect ? n.getBoundingClientRect() : null; } catch (e) { return null; } }

	function create(app, shell, onDraw) {
		var C = W.HD_DD_D4Callouts, TB = W.HD_DD_D3Toolbox;
		var names = (W.HD_DD_D3Screens && W.HD_DD_D3Screens.DOT_NAMES) || {};
		var frame = q(shell, 'hd-d3-frame'), stage = q(shell, 'hd-d3-stage') || (frame && frame.parentNode);
		var layer = el('div', 'hd-d4-callouts'), boxes = {}, area = null;
		// First in the frame, so focus keeping finds a label before its hidden dot twin.
		if (frame) { frame.insertBefore(layer, frame.firstChild || null); }

		// The same test Designer 3's door sizing makes (window.matchMedia); app.matchMedia without one.
		function phone() {
			var mm = typeof W.matchMedia === 'function' ? function (s) { return W.matchMedia(s); } : app.matchMedia;
			try { return !!(mm && mm(PHONE).matches); } catch (e) { return false; }
		}
		// The door picture and where labels may go, in px from the picture's top-left corner.
		function measure() {
			var f = rect(frame), s = rect(stage);
			if (!f || !f.width) {   // not laid out (or no layout engine): a rough box
				var w = parseFloat(frame.style.width) || 240;
				return { frame: { w: w, h: 2 * w }, bounds: { left: -w, right: 2 * w, top: 0, bottom: 2 * w } };
			}
			s = (s && s.width) ? s : f;
			var vw = W.innerWidth || s.right;
			return { frame: { w: f.width, h: f.height }, bounds: {
				left: Math.max(s.left, 0) - f.left + M, right: Math.min(s.right, vw) - f.left - M,
				top: s.top - f.top + M, bottom: s.bottom - f.top - M
			} };
		}
		// Desktop: room beside the door for the widest label on each side. A door too wide for that
		// (a double door, side lights) shrinks a little; failing that, labels go over its edges.
		function fit(parts, sizes, g) {
			var need = C.need(parts, { sizes: sizes }), want = Math.max(need.left, need.right);
			var room = Math.min(-g.bounds.left, g.bounds.right - g.frame.w);
			if (room >= want) { return 'desk'; }
			var w = Math.floor(g.frame.w - 2 * (want - room));
			if (w < g.frame.w * MIN_SHARE) { return 'edge'; }
			frame.style.width = w + 'px';   // Designer 3 sets it again on its next paint, then this runs again
			return 'desk';
		}

		function button(p, urgent, small) {
			var b = el('button', 'hd-d4-callout hd-d4-callout--' + p.key + (urgent ? ' hd-d4-callout--need' : ''),
				urgent && !small ? NEED : (C.NAMES[p.key] || p.key));
			b.type = 'button';
			b.setAttribute('data-k', 'dot:' + p.key);
			b.setAttribute('aria-label', 'Change ' + (names[p.key] || 'this part'));
			b.addEventListener('click', function () { if (app.toolbox) { app.toolbox.open(p.key, 'dot:' + p.key); } });
			return b;
		}

		function lines(list, g, urgentKey) {
			var box = svg('svg', { 'class': 'hd-d4-callouts__lines', 'aria-hidden': 'true', focusable: 'false', width: Math.round(g.frame.w), height: Math.round(g.frame.h) });
			list.forEach(function (l) {
				var need = l.key === urgentKey, at = { x1: l.ax, y1: l.ay, x2: l.ex, y2: l.ey };
				box.appendChild(svg('line', Object.assign({ 'class': 'hd-d4-callouts__edge' }, at)));
				box.appendChild(svg('line', Object.assign({ 'class': 'hd-d4-callouts__line' + (need ? ' hd-d4-callouts__line--need' : '') }, at)));
			});
			list.forEach(function (l) {   // rings on top of every line
				var need = l.key === urgentKey ? ' hd-d4-callouts__ring--need' : '';
				box.appendChild(svg('circle', { 'class': 'hd-d4-callouts__ring hd-d4-callouts__ring--' + l.key + need, cx: l.ex, cy: l.ey, r: 4.5 }));
			});
			return box;
		}

		function draw() {
			if (!frame || !C) { return; }
			var keep = TB && TB.focusedKey ? TB.focusedKey([layer]) : null;
			layer.innerHTML = '';
			var parts = app.dots() || [], small = phone(), urgentKey = app.needHandle ? 'handle' : null;
			var btns = {}, sizes = {};
			parts.forEach(function (p) {
				var b = layer.appendChild(button(p, p.key === urgentKey, small));
				btns[p.key] = b;
				if (b.offsetWidth) { sizes[p.key] = { w: b.offsetWidth, h: b.offsetHeight }; }
			});
			var g = measure(), mode = small ? 'edge' : fit(parts, sizes, g);
			if (!small) { g = measure(); }   // the door may have shrunk
			var list = C.layout(parts, { mode: mode, frame: g.frame, bounds: g.bounds, sizes: sizes, gap: small ? 2 : 6 });
			boxes = {};
			list.forEach(function (l) {
				btns[l.key].style.left = l.x + 'px';
				btns[l.key].style.top = l.y + 'px';
				boxes[l.key] = l;
			});
			if (document.createElementNS) { layer.insertBefore(lines(list, g, urgentKey), layer.firstChild || null); }
			area = g.bounds;
			if (TB && TB.restoreFocus) { TB.restoreFocus([layer], keep); }
		}

		// Follow Designer 3's paints (it empties and refills its dots layer on each) and the door
		// picture's size (the canvas takes its height once its picture has loaded, after the paint).
		function redraw() { draw(); if (onDraw) { onDraw(); } }
		var dots = q(shell, 'hd-d3-dots'), watch = [], lastW = 0, lastH = 0;
		if (dots && typeof W.MutationObserver === 'function') {
			watch.push(new W.MutationObserver(redraw));
			watch[0].observe(dots, { childList: true });
		}
		if (frame && typeof W.ResizeObserver === 'function') {
			var ro = new W.ResizeObserver(function () {
				var f = rect(frame);
				if (!f || (f.width === lastW && f.height === lastH)) { return; }
				lastW = f.width; lastH = f.height;
				redraw();
			});
			ro.observe(frame);
			watch.push(ro);
		}

		return {
			draw: draw,
			box: function (key) { return boxes[key] || null; },
			bounds: function () { return area; },
			destroy: function () { watch.forEach(function (w) { w.disconnect(); }); watch = []; }
		};
	}

	W.HD_DD_D4Labels = { create: create, NEED: NEED };
})(typeof window !== 'undefined' ? window : this);
