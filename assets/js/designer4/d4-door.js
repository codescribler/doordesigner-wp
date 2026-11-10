// assets/js/designer4/d4-door.js
// Designer 4's door screen: Designer 3's door screen (HD_DD_D3Screens.door) with
//   - the handle preview: each of app.previewLabels() drawn for a second, once, then the real door;
//   - the banner and the glowing Handle control (class hd-d4-needhandle on the shell) while the
//     door has no handle;
//   - the guide price above the ask, and the nudge pointing at the price;
//   - the "no handle" speech bubble by the handle dot (the ask's onNoHandle).
//
//   HD_DD_D4Door.door(app, shell) -> { refresh, destroy, bubble, stopPreview }
// app gives: needHandle, previewDue, previewLabels(), reducedMotion(), timers {set, clear},
// funnel, toolbox, dots(), design(), type(), OPTS, model, canvas, assetBase(), cfg(), whenPainted().
(function (W) {
	'use strict';

	var COPY = {
		preview: 'Here\'s your door. Which handle suits it?',
		choose: 'Choose your handle next.',
		nudge: 'Looking good. Want a price for it?',
		bubble: 'How will you get in without a handle?'
	};
	var FRAME_MS = 1000;

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}
	function q(root, cls) { return root && root.querySelector ? root.querySelector('.' + cls) : null; }
	function hasClass(n, cls) { return (' ' + (n.className || '') + ' ').indexOf(' ' + cls + ' ') !== -1; }
	// className, not classList: the toolbox toggles is-sheet on the same shell, and both survive.
	function setClass(n, cls, on) {
		if (!n || hasClass(n, cls) === !!on) { return; }
		n.className = on ? (n.className ? n.className + ' ' + cls : cls) : (' ' + n.className + ' ').replace(' ' + cls + ' ', ' ').trim();
	}
	function drop(n) { if (n && n.parentNode) { n.parentNode.removeChild(n); } }

	// Draws each label on the canvas for FRAME_MS, then calls onEnd. stop() ends it silently.
	function previewRunner(app, labels, onEnd) {
		var Hd = W.HD_DD_D4Handle, timers = app.timers, i = 0, t = null, live = true;
		var comp = (W.HD_DD_Preview && app.canvas && app.model) ? W.HD_DD_Preview.create(app.canvas, { model: app.model, assetBase: app.assetBase() }) : null;
		// Supersede any frame still loading (or waiting to redraw a slow picture: preview.js
		// retryWhenLoaded), so it can't draw over the real door. Used by stop and by the end.
		function supersede() { live = false; if (comp) { comp._token = (comp._token || 0) + 1; } }
		function frame() {
			t = null;
			if (!live) { return; }
			if (i >= labels.length) { supersede(); onEnd(); return; }
			if (comp) { try { comp.render(app.type(), Hd.withHandle(app.design(), labels[i]), app.OPTS); } catch (e) { /* missing asset */ } }
			i++;
			t = timers.set(frame, FRAME_MS);
		}
		// The first frame waits for Designer 3's own first paint, so that paint can't land on top of it.
		Promise.resolve(app.whenPainted ? app.whenPainted() : null).then(frame, frame);
		return {
			playing: function () { return live; },
			stop: function () {
				if (!live) { return false; }
				supersede();
				if (t != null) { timers.clear(t); t = null; }
				return true;
			}
		};
	}

	function door(app, shell) {
		var base = W.HD_DD_D3Screens.door(app, shell) || {};
		var banner = q(shell, 'hd-d3-banner');
		var plain = banner ? banner.textContent : '';
		var runner = null, bubbleEl = null;
		var view = {};

		var guide = app.cfg().trust && app.cfg().trust.guidePrice;
		var save = q(shell, 'hd-d3-saveslot');
		if (guide && save && save.parentNode) { save.parentNode.insertBefore(el('p', 'hd-d4-guide', guide), save); }

		function playing() { return !!(runner && runner.playing()); }
		function hideBubble() { drop(bubbleEl); bubbleEl = null; setClass(shell, 'hd-d4-bubbling', false); }

		// Everything Designer 3's redraw doesn't know about.
		function sync() {
			if (banner) {
				banner.textContent = playing() ? COPY.preview : (app.needHandle ? COPY.choose : plain);
				setClass(banner, 'hd-d4-banner--preview', playing());
			}
			setClass(shell, 'hd-d4-needhandle', !!app.needHandle);
			if (!app.needHandle) { hideBubble(); }
			var nudge = q(shell, 'hd-d3-nudge__text');
			if (nudge) { nudge.textContent = COPY.nudge; }
		}

		// True when a playing preview was stopped (the caller then owes the real door a redraw).
		view.stopPreview = function () { var r = runner; runner = null; return !!(r && r.stop()); };

		view.refresh = function () {
			view.stopPreview();
			var p = base.refresh ? base.refresh() : null;
			sync();
			return p;
		};

		view.destroy = function () {
			view.stopPreview();
			hideBubble();
			if (base.destroy) { base.destroy(); }
		};

		// No handle on submit: a bubble by the handle dot; it (or the dot) opens the handle choices.
		// "nohandle" is reported once per door (app.noHandleSent, reset by app.newDoor()).
		view.bubble = function () {
			if (!app.noHandleSent) { app.noHandleSent = true; app.funnel.step('nohandle'); }
			hideBubble();
			var host = q(shell, 'hd-d3-frame') || shell;
			var dot = (app.dots() || []).filter(function (d) { return d.key === 'handle'; })[0];
			var b = el('button', 'hd-d4-bubble', COPY.bubble);
			b.type = 'button';
			b.setAttribute('role', 'status');
			if (dot) { b.style.left = (dot.x * 100) + '%'; b.style.top = (dot.y * 100) + '%'; }
			b.addEventListener('click', function () { if (app.toolbox) { app.toolbox.open('handle', 'dot:handle'); } });
			host.appendChild(b);
			bubbleEl = b;
			setClass(shell, 'hd-d4-bubbling', true);
		};

		if (app.previewDue) {
			app.previewDue = false;
			var labels = app.reducedMotion() ? [] : app.previewLabels();
			if (labels.length) {
				app.funnel.step('handle_preview');
				runner = previewRunner(app, labels, function () {
					runner = null;
					if (base.refresh) { base.refresh(); }   // the real door, with no handle
					sync();
				});
			}
		}
		sync();
		return view;
	}

	W.HD_DD_D4Door = { door: door, COPY: COPY };
})(typeof window !== 'undefined' ? window : this);
