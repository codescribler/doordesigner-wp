// assets/js/designer4/d4-door.js
// Designer 4's door screen: Designer 3's door screen (HD_DD_D3Screens.door) with
//   - the handle preview: each of app.previewLabels() drawn for a second, once, then the real door;
//   - the banner and the glowing Handle control (class hd-d4-needhandle on the shell) while the
//     door has no handle; once it has one, the banner points at the labels;
//   - the part labels with lines in place of the "+" dots (d4-labels.js);
//   - the guide price above the ask, and the nudge pointing at the price (neither once a lead);
//   - the "no handle" speech bubble above the Handle label (the ask's onNoHandle).
//
//   HD_DD_D4Door.door(app, shell) -> { refresh, destroy, bubble, stopPreview }
// app gives: needHandle, previewDue, previewLabels(), reducedMotion(), timers {set, clear},
// funnel, toolbox, dots(), design(), type(), OPTS, model, canvas, assetBase(), cfg(), whenPainted(),
// matchMedia.
(function (W) {
	'use strict';

	var COPY = {
		preview: 'Here\'s your door. Which handle suits it?',
		choose: 'Choose your handle next.',
		settled: 'Here\'s your door. Tap a label to change any part of it.',   // Designer 3's says "a dot"
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
		var runner = null, bubbleEl = null;
		var view = {};
		// Announcements (the bubble) come from this visually hidden live region, built with the
		// screen so it is in the page before any text is set.
		var announce = shell.appendChild(el('div', 'hd-d3-sr hd-d4-announce'));
		announce.setAttribute('aria-live', 'polite');

		// A lead (the ask is "saved"): no guide price and no nudge; they have asked for the price.
		function isLead() { var s = app.saver ? app.saver() : null; return !!(s && s.saved && s.saved()); }
		var guide = app.cfg().trust && app.cfg().trust.guidePrice;
		var save = q(shell, 'hd-d3-saveslot'), guideEl = null;
		if (guide && save && save.parentNode && !isLead()) { guideEl = save.parentNode.insertBefore(el('p', 'hd-d4-guide', guide), save); }

		function playing() { return !!(runner && runner.playing()); }
		function hideBubble() { drop(bubbleEl); bubbleEl = null; announce.textContent = ''; setClass(shell, 'hd-d4-bubbling', false); }
		// The bubble sits above the Handle label (CSS lifts it by its own height), kept inside the
		// stage and the screen, its pointer at the label's middle. The label moves when the hinge
		// side changes or the screen resizes, and the bubble follows.
		function placeBubble() {
			var l = bubbleEl && parts && parts.box('handle');
			if (!l) { return; }
			var a = parts.bounds(), bw = bubbleEl.offsetWidth || 200, cx = l.x + l.w / 2;
			var left = a ? Math.max(a.left, Math.min(cx - bw / 2, a.right - bw)) : cx - bw / 2;
			bubbleEl.style.left = left + 'px';
			bubbleEl.style.top = l.y + 'px';
			bubbleEl.style.setProperty('--hd-d4-tip', Math.max(18, Math.min(bw - 18, cx - left)) + 'px');
		}
		// The part labels (d4-labels.js); "labels" below are the preview's handle labels.
		var parts = W.HD_DD_D4Labels ? W.HD_DD_D4Labels.create(app, shell, placeBubble) : null;
		// Once the door has a handle, the ask's "needs a handle" line is no longer true.
		function clearNoHandleLine() {
			var err = q(shell, 'hd-d4-ask__error'), line = W.HD_DD_D4Ask && W.HD_DD_D4Ask.COPY.noHandle;
			if (err && line && err.textContent === line) { err.textContent = ''; }
		}

		// Everything Designer 3's redraw doesn't know about.
		function sync() {
			if (banner) {
				banner.textContent = playing() ? COPY.preview : (app.needHandle ? COPY.choose : COPY.settled);
				setClass(banner, 'hd-d4-banner--preview', playing());
			}
			setClass(shell, 'hd-d4-needhandle', !!app.needHandle);
			setClass(shell, 'hd-d4-previewing', playing());   // the handle's ring hides so each handle shows
			if (parts) { parts.draw(); }
			if (!app.needHandle) { hideBubble(); clearNoHandleLine(); } else { placeBubble(); }
			if (isLead()) {
				drop(guideEl); guideEl = null;
				app.nudgeOn = false;
				var slot = q(shell, 'hd-d3-nudgeslot');
				if (slot) { slot.innerHTML = ''; }
			}
			var nudge = q(shell, 'hd-d3-nudge__text');
			if (nudge) { nudge.textContent = COPY.nudge; }
		}

		// True when a playing preview was stopped (the caller then owes the real door a redraw).
		view.stopPreview = function () {
			var r = runner; runner = null;
			setClass(shell, 'hd-d4-previewing', false);
			return !!(r && r.stop());
		};

		view.refresh = function () {
			view.stopPreview();
			var p = base.refresh ? base.refresh() : null;
			sync();
			return p;
		};

		view.destroy = function () {
			view.stopPreview();
			hideBubble();
			if (parts) { parts.destroy(); }
			if (base.destroy) { base.destroy(); }
		};

		// No handle on submit: a bubble above the Handle label; it (or the label) opens the handle choices.
		// "nohandle" is reported once per door (app.noHandleSent, reset by app.newDoor()).
		view.bubble = function () {
			if (!app.noHandleSent) { app.noHandleSent = true; app.funnel.step('nohandle'); }
			hideBubble();
			var host = q(shell, 'hd-d3-frame') || shell;
			var b = el('button', 'hd-d4-bubble', COPY.bubble);
			b.type = 'button';
			b.addEventListener('click', function () { if (app.toolbox) { app.toolbox.open('handle', 'dot:handle'); } });
			host.appendChild(b);
			bubbleEl = b;
			announce.textContent = COPY.bubble;
			placeBubble();
			setClass(shell, 'hd-d4-bubbling', true);
		};

		// A new door with no handle: the handle choices open by themselves (the phone sheet, the
		// desktop section), since choosing one is the next step. Quiet, so not counted as the visitor
		// opening them. A preview stopped by the visitor (they tapped something) never gets here.
		function openHandles() {
			if (app.needHandle && app.screen === 'door' && app.toolbox && app.toolbox.open) { app.toolbox.open('handle', 'tab:handle', true); }
		}

		var fresh = false;
		if (app.previewDue) {
			app.previewDue = false;
			fresh = true;
			var labels = app.reducedMotion() ? [] : app.previewLabels();
			if (labels.length) {
				fresh = false;
				app.funnel.step('handle_preview');
				runner = previewRunner(app, labels, function () {
					runner = null;
					if (base.refresh) { base.refresh(); }   // the real door, with no handle
					sync();
					openHandles();
				});
			}
		}
		sync();
		if (fresh) { openHandles(); }
		return view;
	}

	W.HD_DD_D4Door = { door: door, COPY: COPY };
})(typeof window !== 'undefined' ? window : this);
