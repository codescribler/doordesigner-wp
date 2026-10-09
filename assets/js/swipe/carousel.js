// assets/js/swipe/carousel.js
// Generic cover-flow carousel: the current item large in the centre, previous items shrinking
// off to the left, upcoming ones peeking in on the right, and a dot track underneath.
// Swipe / drag, tap a neighbour, tap a dot, or use the arrow keys. Only the centre card and
// its neighbours (±3) exist in the DOM, so a 93-design showcase costs the same as a 5-item one.
//
//   var c = HD_DD_Carousel.create(container, {
//     count, index,
//     renderCard(i, el),   // paint item i into el (called when a card enters the window)
//     label(i),            // accessible + visible name of item i
//     onChange(i),         // the centre item changed (after a swipe settles / a tap)
//     onUser(),            // the visitor (not the app) changed the centre item
//     ariaLabel            // e.g. 'Door colours'
//   });
//   c.setIndex(i); c.refresh(); c.index(); c.destroy();
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_Carousel = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var RADIUS = 3;      // cards kept either side of the centre
	var MAX_DOTS = 9;    // dots shown at once on long lists

	// ---- Pure maths (unit-tested) --------------------------------------------
	function clamp(i, count) { return Math.max(0, Math.min(count - 1, i)); }

	function windowRange(index, count, radius) {
		return [Math.max(0, index - radius), Math.min(count - 1, index + radius)];
	}

	// Where a drag of dx px (negative = left) released at velocity v px/ms lands.
	function settle(index, dx, v, spacing, count) {
		var moved = -dx / spacing;
		var steps = Math.round(moved);
		if (steps === 0 && Math.abs(moved) > 0.15 && Math.abs(v) > 0.4) { steps = v < 0 ? 1 : -1; }
		if (steps === 0 && Math.abs(moved) >= 0.5) { steps = moved > 0 ? 1 : -1; }
		return clamp(index + steps, count);
	}

	// offset: position relative to the centre in cards (may be fractional mid-drag).
	function cardStyle(offset, spacing) {
		var a = Math.abs(offset);
		var sign = offset < 0 ? -1 : 1;
		// Neighbours tuck in closer the further they are, so two peek on each side.
		var x = sign * (a <= 1 ? a * spacing : spacing + (Math.min(a, 2.5) - 1) * spacing * 0.55);
		var scale = Math.max(0.5, 1 - 0.24 * Math.min(a, 2));
		var opacity = a >= 2.5 ? 0 : Math.max(0, 1 - 0.38 * a);
		return { x: Math.round(x), scale: Math.round(scale * 1000) / 1000, opacity: Math.round(opacity * 1000) / 1000, z: 100 - Math.round(a * 10) };
	}

	function dotWindow(index, count, max) {
		if (count <= max) { return [0, count - 1]; }
		var half = Math.floor(max / 2);
		var start = Math.max(0, Math.min(count - max, index - half));
		return [start, start + max - 1];
	}

	function arrowState(index, count) { return { prev: index > 0, next: index < count - 1 }; }

	var math = { clamp: clamp, windowRange: windowRange, settle: settle, cardStyle: cardStyle, dotWindow: dotWindow, arrowState: arrowState };

	// ---- DOM component ---------------------------------------------------------
	function el(tag, cls) { var n = document.createElement(tag); if (cls) { n.className = cls; } return n; }

	function create(container, o) {
		var count = o.count;
		var index = clamp(o.index || 0, count);
		var cards = {};           // index → element
		var drag = null;          // { x0, t0, dx, lastX, lastT, v, moved }
		var root = el('div', 'hd-sw-carousel');
		var track = el('div', 'hd-sw-carousel__track');
		var dots = el('div', 'hd-sw-carousel__dots');
		var live = el('div', 'hd-sw-sr');
		track.setAttribute('role', 'listbox');
		track.setAttribute('aria-label', o.ariaLabel || 'Options');
		track.tabIndex = 0;
		live.setAttribute('aria-live', 'polite');
		root.appendChild(track);
		root.appendChild(dots);
		root.appendChild(live);
		container.appendChild(root);

		// ‹ › buttons: tapping works as well as swiping, and a mouse has something to press.
		function arrow(dir, glyph, name) {
			var b = el('button', 'hd-sw-carousel__arrow hd-sw-carousel__arrow--' + dir);
			b.type = 'button';
			b.textContent = glyph;
			b.setAttribute('aria-label', name);
			b.addEventListener('click', function () { user(index + (dir === 'prev' ? -1 : 1)); });
			root.appendChild(b);
			return b;
		}
		var prevBtn = arrow('prev', '‹', 'Previous');
		var nextBtn = arrow('next', '›', 'Next');

		// A change the visitor made themselves (not one the app set).
		function user(i) {
			var before = index;
			setIndex(i);
			if (index !== before && o.onUser) { o.onUser(); }
		}

		function spacing() { return Math.max(90, track.clientWidth * 0.36); }

		function layout(fraction) {
			var sp = spacing();
			var range = windowRange(index, count, RADIUS);
			Object.keys(cards).forEach(function (k) {
				var i = +k;
				if (i < range[0] || i > range[1]) { track.removeChild(cards[k]); delete cards[k]; }
			});
			for (var i = range[0]; i <= range[1]; i++) {
				if (!cards[i]) {
					var card = el('div', 'hd-sw-card');
					card.setAttribute('role', 'option');
					card.setAttribute('data-i', i);
					track.appendChild(card);
					cards[i] = card;
					o.renderCard(i, card);
				}
				var s = cardStyle(i - index + (fraction || 0), sp);
				var c = cards[i];
				c.style.transform = 'translate(-50%, 0) translateX(' + s.x + 'px) scale(' + s.scale + ')';
				c.style.opacity = s.opacity;
				c.style.zIndex = s.z;
				c.setAttribute('aria-selected', i === index ? 'true' : 'false');
				c.classList.toggle('is-centre', i === index);
				c.setAttribute('aria-label', o.label(i));
			}
			renderDots();
			var st = arrowState(index, count);
			prevBtn.hidden = !st.prev;
			nextBtn.hidden = !st.next;
		}

		function renderDots() {
			dots.innerHTML = '';
			var w = dotWindow(index, count, MAX_DOTS);
			for (var i = w[0]; i <= w[1]; i++) {
				var d = el('button', 'hd-sw-dot' + (i === index ? ' is-on' : '') + (i < index ? ' is-seen' : ''));
				d.type = 'button';
				d.tabIndex = -1;
				d.setAttribute('aria-label', o.label(i));
				(function (j) { d.addEventListener('click', function () { user(j); }); })(i);
				// Shrink the dots at the window's edges when the list continues beyond them.
				if ((i === w[0] && w[0] > 0) || (i === w[1] && w[1] < count - 1)) { d.className += ' is-edge'; }
				dots.appendChild(d);
			}
		}

		function setIndex(i, silent) {
			var next = clamp(i, count);
			var changed = next !== index;
			index = next;
			root.classList.remove('is-dragging');
			layout(0);
			live.textContent = o.label(index) + ', ' + (index + 1) + ' of ' + count;
			if (changed && !silent && o.onChange) { o.onChange(index); }
		}

		// Pointer drag. A move of under 6px counts as a tap (on a neighbour → go to it).
		function onDown(e) {
			if (e.button != null && e.button !== 0) { return; }
			drag = { x0: e.clientX, t0: Date.now(), dx: 0, lastX: e.clientX, lastT: Date.now(), v: 0, moved: false, target: e.target };
			try { track.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
		}
		function onMove(e) {
			if (!drag) { return; }
			var now = Date.now();
			drag.dx = e.clientX - drag.x0;
			if (Math.abs(drag.dx) > 6) { drag.moved = true; root.classList.add('is-dragging'); }
			var dt = Math.max(1, now - drag.lastT);
			drag.v = (e.clientX - drag.lastX) / dt;
			drag.lastX = e.clientX; drag.lastT = now;
			if (drag.moved) { layout(drag.dx / spacing()); }
		}
		function onUp() {
			if (!drag) { return; }
			var d = drag; drag = null;
			if (!d.moved) {
				var card = d.target && d.target.closest ? d.target.closest('.hd-sw-card') : null;
				if (card) { user(+card.getAttribute('data-i')); }
				return;
			}
			user(settle(index, d.dx, d.v, spacing(), count));
		}
		function onKey(e) {
			if (e.key === 'ArrowRight') { e.preventDefault(); user(index + 1); }
			else if (e.key === 'ArrowLeft') { e.preventDefault(); user(index - 1); }
		}
		function onResize() { layout(0); }

		track.addEventListener('pointerdown', onDown);
		track.addEventListener('pointermove', onMove);
		track.addEventListener('pointerup', onUp);
		track.addEventListener('pointercancel', onUp);
		track.addEventListener('keydown', onKey);
		window.addEventListener('resize', onResize);

		layout(0);

		return {
			index: function () { return index; },
			setIndex: function (i) { setIndex(i, true); },
			// Repaint every card (the design changed under them, e.g. a new finish).
			refresh: function () {
				Object.keys(cards).forEach(function (k) { track.removeChild(cards[k]); delete cards[k]; });
				layout(0);
			},
			// A one-off "you can swipe this" hint: slide half a card and back.
			nudge: function () {
				root.classList.add('is-nudging');
				layout(-0.35);
				setTimeout(function () { root.classList.remove('is-nudging'); layout(0); }, 420);
			},
			destroy: function () {
				window.removeEventListener('resize', onResize);
				if (root.parentNode) { root.parentNode.removeChild(root); }
			}
		};
	}

	return { create: create, math: math };
}));
