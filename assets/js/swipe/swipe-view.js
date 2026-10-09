// assets/js/swipe/swipe-view.js
// Draws the swipe flow for HD_DD_SwipeApp: the shell (back, progress, body, action button),
// the design showcase, the option screens (carousel + sub-choices) and the review. It reads
// state from the app and calls back into it; it holds no design state of its own.
(function () {
	'use strict';

	var CFG = window.HD_DD_CONFIG || {};
	var I18N = CFG.i18n || {};
	var P = window.HD_DD_SwipeParts;
	var el = P.el;
	var Shared = window.HD_DD_Shared;
	var DI = window.HD_DD_DesignIndex;
	var CLOSEUP = { handle: 'handle', letterplate: 'letterplate', knocker: 'knocker' };

	function create(app) {
		var v = {};
		var shell = null, back, progressEl, counter, saveBar, stage, stageCanvas, body, cta;
		var carousel = null, compositor = null, enquiry = null, hint = null;

		function build() {
			app.root.innerHTML = '';
			shell = el('div', 'hd-dd hd-sw');
			var head = el('div', 'hd-sw-head');
			back = el('button', 'hd-sw-back', '‹');
			back.type = 'button';
			back.setAttribute('aria-label', I18N.back || 'Back');
			back.addEventListener('click', function () { app.back(); });
			progressEl = el('div', 'hd-sw-progress');
			counter = el('span', 'hd-sw-counter');
			head.appendChild(back); head.appendChild(progressEl); head.appendChild(counter);
			// Review only: a save button above the door picture (HD_DD_Trust.renderSaveBar).
			saveBar = el('div', 'hd-dd__savebar-slot');
			saveBar.hidden = true;
			stage = el('div', 'hd-sw-stage');
			stageCanvas = el('canvas', 'hd-sw-stage__door');
			stage.appendChild(stageCanvas);
			body = el('div', 'hd-sw-body');
			cta = el('button', 'hd-sw-cta');
			cta.type = 'button';
			cta.addEventListener('animationend', function () { cta.classList.remove('is-pulse'); });
			shell.appendChild(head); shell.appendChild(saveBar); shell.appendChild(stage); shell.appendChild(body); shell.appendChild(cta);
			app.root.appendChild(shell);
			if (window.HD_DD_Preview && app.model) {
				compositor = window.HD_DD_Preview.create(stageCanvas, { model: app.model, assetBase: app.assetBase() });
			}
		}

		function enquiryCtl() {
			if (!enquiry) {
				enquiry = window.HD_DD_Enquiry.create({
					api: app.api, cfg: CFG, i18n: I18N, funnel: app.funnel,
					getDesign: function () { return app.design(); },
					getCanvas: function () { return stageCanvas; },
					track: function (n) { app.track(n); },
					experiment: function () { return app.experiment; },
					onSuccess: function (result) { app.lastResult = result; app.go('done'); }
				});
			}
			return enquiry;
		}

		function setCta(label, onClick) {
			cta.hidden = !label;
			cta.textContent = label || '';
			cta.onclick = onClick || null;
		}

		function renderProgress() {
			var p = app.progress();
			progressEl.innerHTML = '';
			for (var i = 1; i <= p.total; i++) { progressEl.appendChild(el('span', 'hd-sw-progress__seg' + (i <= p.current ? ' is-on' : ''))); }
			counter.textContent = p.current + '/' + p.total;
		}

		function heading(title, help) {
			body.appendChild(el('h2', 'hd-sw-title', title));
			var h = el('p', 'hd-sw-help', help);
			body.appendChild(h);
		}

		function caption(name, pos, total, tag) {
			var cap = el('div', 'hd-sw-caption');
			cap.appendChild(el('div', 'hd-sw-caption__name', name));
			cap.appendChild(el('div', 'hd-sw-caption__pos', pos + ' of ' + total + (tag ? ' · ' + tag : '')));
			return cap;
		}

		// ---- Helpers that teach the swipe ---------------------------------------------
		function pulseCta() {
			cta.classList.remove('is-pulse');
			void cta.offsetWidth; // restart the animation
			cta.classList.add('is-pulse');
		}

		// The visitor moved a carousel themselves.
		function userMoved() {
			if (hint) { hint.dismiss(); hint = null; }
			app.browsed();
			if (!app.pulsedMove && app.screen === 'design') { app.pulsedMove = true; pulseCta(); }
		}

		// Once per page load, on the first carousel they see.
		function maybeHint(holder) {
			if (app.hintShown || !window.HD_DD_SwipeHint) { return; }
			app.hintShown = true;
			var touch = false;
			try { touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { touch = false; }
			hint = window.HD_DD_SwipeHint.create(holder, { touch: touch, onIdle: function () { if (carousel) { carousel.nudge(); } } });
		}

		// ---- Showcase ------------------------------------------------------------
		function showcase() {
			var FS = window.HD_DD_FlowSteps;
			heading(FS.DESIGN_SCREEN.title, FS.DESIGN_SCREEN.help);
			var filters = el('div', 'hd-sw-chips hd-sw-filters');
			app.index.filters.forEach(function (f) {
				var b = el('button', 'hd-sw-chip' + (f === app.filter ? ' is-on' : ''), f);
				b.type = 'button';
				b.addEventListener('click', function () { app.filter = f; app.showcaseAt = 0; userMoved(); v.render(); });
				filters.appendChild(b);
			});
			body.appendChild(P.scroller(filters));

			var list = app.showcaseList();
			if (app.chosen && list.indexOf(app.chosen) !== -1 && !app._showcaseTouched) { app.showcaseAt = list.indexOf(app.chosen); }
			var holder = el('div', 'hd-sw-holder');
			body.appendChild(holder);
			var cap = el('div');
			body.appendChild(cap);
			var strip = el('div', 'hd-sw-strip');
			body.appendChild(strip);

			function tag(d) { return DI.typesFor(d).map(P.short).join(' · '); }
			function update(i) {
				app.showcaseAt = i;
				app.viewed[list[i].key] = true;
				cap.innerHTML = '';
				cap.appendChild(caption(list[i].name, i + 1, list.length, tag(list[i])));
				Array.prototype.forEach.call(strip.children, function (c, j) { c.classList.toggle('is-on', j === i); });
				var on = strip.children[i];
				if (on) { strip.scrollLeft = Math.max(0, on.offsetLeft - strip.clientWidth / 2 + on.clientWidth / 2); }
				setCta('Choose this door: ' + list[i].name + ' →', function () { app.pickDesign(list[i]); });
			}
			carousel = window.HD_DD_Carousel.create(holder, {
				count: list.length, index: app.showcaseAt, ariaLabel: 'Door designs',
				label: function (i) { return list[i].name; },
				renderCard: function (i, card) {
					var s = app.showcaseDesign(list[i]);
					window.HD_DD_DoorCard.paint(card, { model: app.model, assetBase: app.assetBase(), type: s.type, design: s.design, omitSlots: ['Handles', 'HandlesRight'] });
				},
				onUser: userMoved,
				onChange: function (i) { app._showcaseTouched = true; update(i); }
			});
			list.forEach(function (d, j) {
				var s = app.showcaseDesign(d);
				var b = el('button', 'hd-sw-strip__item');
				b.type = 'button';
				b.setAttribute('aria-label', d.name);
				var url = P.blankThumb(app.assetBase(), app.model, s.type, s.design['Door Design'].label);
				if (url) { var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.src = url; b.appendChild(im); }
				else { b.textContent = d.name; }
				b.addEventListener('click', function () { carousel.setIndex(j); update(j); userMoved(); });
				strip.appendChild(b);
			});
			update(Math.min(app.showcaseAt, list.length - 1));
			body.appendChild(el('p', 'hd-sw-prompt', 'Happy with this one? Tap Choose.'));
			maybeHint(holder);
			if (!app.pulsedIntro) { app.pulsedIntro = true; pulseCta(); }
		}

		// ---- Option screens --------------------------------------------------------
		function optionScreen(screen) {
			heading(screen.title, screen.help);
			// Choices that decide what the carousel offers (the hardware colour decides which
			// handles exist) sit ABOVE it, so they're seen first and never hidden below the fold.
			var top = el('div', 'hd-sw-subs hd-sw-subs--top');
			body.appendChild(top);
			var holder = el('div', 'hd-sw-holder');
			body.appendChild(holder);
			var cap = el('div');
			body.appendChild(cap);
			var subs = el('div', 'hd-sw-subs');
			body.appendChild(subs);

			var isType = !screen.main;
			var choices = isType ? DI.typesFor(app.chosen).map(function (t) { return { label: t }; }) : app.choicesFor(screen.main);
			var headingKey = isType ? 'Door Type' : screen.main.heading;
			function selectedIndex() {
				var cur = app.design()[headingKey];
				for (var i = 0; i < choices.length; i++) { if (cur && choices[i].label === cur.label) { return i; } }
				return 0;
			}
			function probe(choice) {
				var d = {};
				var cur = app.design();
				Object.keys(cur).forEach(function (k) { d[k] = cur[k]; });
				if (isType) { d['Door Type'] = { label: choice.label }; d['Door Design'] = { label: app.chosen.types[choice.label] }; }
				else { d[headingKey] = choice; }
				return d;
			}
			function updateCaption(i) {
				cap.innerHTML = '';
				cap.appendChild(caption(P.short(choices[i].label), i + 1, choices.length, isType ? P.TYPE_DESC[choices[i].label] : ''));
			}
			carousel = window.HD_DD_Carousel.create(holder, {
				count: choices.length, index: selectedIndex(), ariaLabel: screen.title,
				label: function (i) { return P.short(choices[i].label); },
				renderCard: function (i, card) {
					var t = isType ? choices[i].label : app.type();
					window.HD_DD_DoorCard.paint(card, { model: app.model, assetBase: app.assetBase(), type: t, design: probe(choices[i]), closeUp: screen.main ? CLOSEUP[screen.main.key] : null });
				},
				onUser: userMoved,
				onChange: function (i) {
					if (isType) { app.setType(choices[i].label); } else { app.select(headingKey, choices[i]); }
					updateCaption(i);
					renderSubs(top, subs, app.currentScreen());
				}
			});
			updateCaption(selectedIndex());
			renderSubs(top, subs, screen);
			setCta(app.nextLabel() + ' →', function () { app.next(); });
		}

		// Sub-choices under the carousel. Changes that alter what the cards show (finish,
		// letterplate position, hinge side) repaint the whole screen without the entry animation.
		var TOP_SUBS = { hardware: true };
		function renderSubs(topBox, bottomBox, screen) {
			topBox.innerHTML = '';
			bottomBox.innerHTML = '';
			if (!screen) { return; }
			var d = app.design();
			function repaint(step) { return function (c) { app.select(step.heading, c); v.render(true); }; }
			screen.subs.forEach(function (s) {
				var box = TOP_SUBS[s.key] ? topBox : bottomBox;
				var cur = d[s.heading] ? d[s.heading].label : '';
				if (s.key === 'hinge') { box.appendChild(P.segmented(/Master Leaf/.test(s.heading) ? 'Opens first' : 'Hinges on', s.choices, cur, repaint(s))); }
				else if (s.key === 'letterplatePosition' || s.key === 'sidelightType') { box.appendChild(P.segmented(s.key === 'sidelightType' ? 'Side panels' : 'Letterplate sits', s.choices, cur, repaint(s))); }
				else if (s.key === 'hardware') { box.appendChild(P.chips('Hardware colour', s.choices, cur, repaint(s), function (c) { return { swatch: Shared.HARDWARE_HEX[c.label] || '#ccc' }; })); }
				else if (s.key === 'sidelightGlass') {
					box.appendChild(P.chips('Side panel glass', s.choices, cur, repaint(s), function (c) { return { img: P.glassThumb(app.assetBase(), app.model, c.id == null && d['Door Glass'] ? d['Door Glass'].label : c.label) }; }));
				} else if (s.key === 'intColour') {
					box.appendChild(P.disclosure('Inside: ' + (cur || 'White'), function () {
						return P.chips('', s.choices, cur, function (c) { app.select(s.heading, c); v.render(true); }, function (c) { return { img: P.colourThumb(app.assetBase(), app.model, app.type(), c.label) }; });
					}));
				}
			});
			// Aluminium designs come in several cassette colours — a variant of the design itself.
			if (screen.key === 'colour' && app.chosen && app.chosen.variants.length > 1) {
				var style = d['Door Design'] ? d['Door Design'].label : '';
				var opts = app.chosen.variants.map(function (x) { return { label: x.label, display: x.cassette }; });
				bottomBox.appendChild(P.chips('Glass surround', opts, style, function (c) { app.setVariant(c.label); v.render(true); }));
			}
		}

		// ---- Review / form / done ------------------------------------------------------
		function reviewRows() {
			var d = app.design();
			var edits = {};
			app.screens().forEach(function (s) {
				if (s.main) { edits[s.main.heading] = s.key; }
				s.subs.forEach(function (x) { edits[x.heading] = s.key; });
			});
			var hasTypeScreen = app.screens().some(function (s) { return s.key === 'type'; });
			var rows = [{ name: 'Design', value: app.chosen ? app.chosen.name : '', edit: 'design' },
				{ name: 'Door type', value: P.short(app.type()), edit: hasTypeScreen ? 'type' : null }];
			app.wiz.state().steps.forEach(function (s) {
				if (s.heading === 'Door Design' || !d[s.heading]) { return; }
				rows.push({ name: s.name || s.label, value: String(d[s.heading].label).trim(), edit: edits[s.heading] || null });
			});
			return rows;
		}

		// The save bar above the door picture: shown on Review, gone once the form is open.
		// Left alone while it is already up, so its one-off entrance does not replay.
		function renderSaveBar(show) {
			show = show && !!window.HD_DD_Trust;
			if (show && !saveBar.hidden) { return; }
			saveBar.innerHTML = '';
			saveBar.hidden = !show;
			if (!show) { return; }
			window.HD_DD_Trust.renderSaveBar(saveBar, CFG.trust, function () { app.track('door_save_top'); app.go('form'); });
		}

		function paintStage() {
			if (compositor) { try { compositor.render(app.type(), app.design()); } catch (e) { /* missing asset */ } }
		}

		// The review list, the trust block, and — once "Save my design" is tapped — the save
		// form opened in place beneath them. Returns the form's box (or null) for scrolling.
		function review(formOpen) {
			heading('Your door', 'Here’s your design. Tap Edit to change anything.');
			body.appendChild(P.reviewList(reviewRows(), function (key) { app.go(key); }));
			body.appendChild(el('div', 'hd-dd__disclaimer', 'We make every effort to show your door accurately, but this preview is an impression, not a perfect representation of the finished product.'));
			if (window.HD_DD_Trust) { window.HD_DD_Trust.render(body, CFG.trust); }
			if (!formOpen) {
				setCta((window.HD_DD_Trust ? window.HD_DD_Trust.COPY.cta : 'Save my design & get my price') + ' →', function () { app.track('door_save_bottom'); app.go('form'); });
				return null;
			}
			var box = el('div', 'hd-dd__savebox');
			body.appendChild(box);
			enquiryCtl().renderForm(box);
			setCta(null);
			return box;
		}

		v.loading = function () { if (!shell) { build(); } body.textContent = I18N.loadingDesign || 'Loading your saved design…'; };

		v.render = function (quiet) {
			if (!shell) { build(); }
			if (carousel) { carousel.destroy(); carousel = null; }
			if (hint) { hint.dismiss(); hint = null; }
			body.innerHTML = '';
			var scr = app.screen;
			var formBox = null;
			shell.className = 'hd-dd hd-sw hd-sw--' + (scr === 'design' || scr === 'review' || scr === 'form' || scr === 'done' ? scr : 'option');
			back.hidden = scr === 'design' || scr === 'done';
			renderProgress();
			stage.hidden = !(scr === 'review' || scr === 'form');
			renderSaveBar(scr === 'review');
			if (scr === 'design') { showcase(); }
			else if (scr === 'review') { paintStage(); review(false); }
			else if (scr === 'form') { paintStage(); formBox = review(true); }
			else if (scr === 'done') {
				setCta(null);
				enquiryCtl().renderSuccess(body, app.lastResult, function () { enquiryCtl().reset(); app.reset(); v.render(); });
			} else {
				var screen = app.currentScreen();
				if (screen) { optionScreen(screen); } else { app.go('review'); return; }
			}
			if (!quiet) {
				body.classList.remove('is-entering');
				void body.offsetWidth; // restart the entry animation
				body.classList.add('is-entering');
				if (scr === 'review') { stage.classList.remove('is-revealing'); void stage.offsetWidth; stage.classList.add('is-revealing'); }
				if (formBox) { window.HD_DD_Enquiry.scrollToForm(formBox, app.root); }
			}
		};

		return v;
	}

	window.HD_DD_SwipeView = { create: create };
})();
