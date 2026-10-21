// assets/js/designer3/d3-toolbox.js
// Designer 3's toolbox: one row per part (Colour, Door style, Handle, Letterplate, Knocker,
// More options), each showing its current choice. On a desktop a row opens its options in
// place, under the row. Below 720px the rows are a strip of tabs under the door and the options
// open in a bottom sheet (the door shrinks above it). Picks go to app.pick(), which redraws.
//
//   var tb = HD_DD_D3Toolbox.create(app); tb.render(el, { sheet: sheetEl, onLayout(isSheet) }); tb.open(key); tb.close(); tb.refresh();
//   HD_DD_D3Toolbox.rows(app) -> [{key, label, value}]; .moreGroups(app) -> [{key, title, heading, kind}]
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
	else { root.HD_DD_D3Toolbox = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (W) {
	'use strict';

	var PHONE = '(max-width: 719px)';
	var PART_SLOTS = { Handle: ['Handles', 'HandlesRight'], Letterplate: ['Letterplates'], Knocker: ['Knockers'] };
	// A dot opens its section; the glass dot opens More options at the door glass.
	var DOT_TO = { colour: ['colour'], handle: ['handle'], letterplate: ['letterplate'], knocker: ['knocker'], glass: ['more', 'glass'] };

	function g() { return (typeof window !== 'undefined' ? window : W) || {}; }
	function parts() { return g().HD_DD_SwipeParts || null; }
	function short(label) { var P = parts(); return P ? P.short(label) : String(label).trim(); }
	function current(app, heading) { var d = app.design()[heading]; return d ? String(d.label).trim() : ''; }

	function rows(app) {
		var out = [
			{ key: 'colour', label: 'Colour', heading: 'Door Colour (External)' },
			{ key: 'style', label: 'Door style', heading: 'Door Design' },
			{ key: 'handle', label: 'Handle', heading: 'Handle' },
			{ key: 'letterplate', label: 'Letterplate', heading: 'Letterplate' },
			{ key: 'knocker', label: 'Knocker', heading: 'Knocker' },
			{ key: 'more', label: 'More options', heading: null }
		].filter(function (r) { return !r.heading || r.key === 'style' || !!app.stepFor(r.heading); });
		out.forEach(function (r) {
			if (r.heading) { r.value = current(app, r.heading); return; }
			var glass = current(app, 'Door Glass'), hw = current(app, 'Hardware Type');
			r.value = [glass ? (/unglazed/i.test(glass) ? 'Solid' : glass + ' glass') : '', hw ? hw + ' finish' : ''].filter(Boolean).join(', ');
		});
		return out;
	}

	// Hinge side, inside colour, door glass, hardware finish and letterplate position.
	function moreGroups(app) {
		var n = app.node() || {};
		var hinge = n.hingeSideField || 'Door Hinged On';
		return [
			{ key: 'hinge', title: hinge === 'Master Leaf' ? 'Which leaf opens first' : 'Hinge side', heading: hinge, kind: 'seg' },
			{ key: 'inside', title: 'Inside colour', heading: 'Door Colour (Internal)', kind: 'colour' },
			{ key: 'glass', title: 'Door glass', heading: 'Door Glass', kind: 'glass' },
			{ key: 'hardware', title: 'Hardware finish', heading: 'Hardware Type', kind: 'finish' },
			{ key: 'lpPos', title: 'Letterplate position', heading: 'Letterplate Position', kind: 'seg' }
		].filter(function (grp) { return !!app.stepFor(grp.heading); });
	}

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	function resolveUrl(base, rel) {
		var u = (/^https?:\/\//.test(rel) || rel.charAt(0) === '/' || !base) ? rel : base + '/' + rel;
		return encodeURI(u).replace(/'/g, '%27');
	}

	// The part's own picture, in the finish on the door (assembled exactly as it would be drawn).
	function partImage(app, heading, label) {
		var RM = g().HD_DD_RenderModel;
		if (!RM || !app.model || /^no /i.test(label)) { return null; }
		var d = {};
		Object.keys(app.design()).forEach(function (h) { d[h] = app.design()[h]; });
		d[heading] = { label: label };
		var slots = PART_SLOTS[heading];
		var layer = RM.assemble(app.model, app.type(), d, app.OPTS).filter(function (l) { return slots.indexOf(l.slot) !== -1; })[0];
		return layer ? resolveUrl(app.assetBase(), layer.url) : null;
	}

	function media(app, kind, heading, c) {
		var P = parts(), base = app.assetBase(), S = g().HD_DD_Shared;
		if (kind === 'colour') { return { img: P && P.colourThumb(base, app.model, app.type(), c.label) }; }
		if (kind === 'style') { return { img: P && P.blankThumb(base, app.model, app.type(), c.label), tall: true }; }
		if (kind === 'glass') { return { img: P && P.glassThumb(base, app.model, c.label) }; }
		if (kind === 'finish') { return { swatch: (S && S.HARDWARE_HEX[c.label]) || '#bbb' }; }
		return { img: partImage(app, heading, c.label) };
	}

	// A grid of large option pictures.
	function tiles(app, section, heading, kind, choices) {
		var grid = el('div', 'hd-d3-tiles' + (kind === 'style' ? ' hd-d3-tiles--tall' : ''));
		var on = current(app, heading);
		choices.forEach(function (c) {
			var sel = String(c.label).trim() === on;
			var b = el('button', 'hd-d3-tile' + (sel ? ' is-on' : ''));
			b.type = 'button';
			b.setAttribute('aria-pressed', sel ? 'true' : 'false');
			b.setAttribute('data-k', 'opt:' + heading + ':' + c.label);
			var m = media(app, kind, heading, c);
			var box = el('span', 'hd-d3-tile__media');
			if (m.swatch) { box.style.background = m.swatch; }
			if (m.img) {
				var im = el('img');
				im.alt = ''; im.loading = 'lazy';
				im.onerror = function () { if (im.parentNode) { im.parentNode.removeChild(im); } };
				im.src = m.img;
				box.appendChild(im);
			} else if (!m.swatch) { box.className += ' is-none'; box.textContent = /^no /i.test(c.label) ? '—' : ''; }
			b.appendChild(box);
			b.appendChild(el('span', 'hd-d3-tile__label', short(c.label)));
			b.addEventListener('click', function () { app.pick(section, heading, c.label); });
			grid.appendChild(b);
		});
		return grid;
	}

	function segmented(app, heading, choices) {
		var row = el('div', 'hd-d3-seg');
		row.setAttribute('role', 'radiogroup');
		var on = current(app, heading);
		choices.forEach(function (c) {
			var sel = String(c.label).trim() === on;
			var b = el('button', 'hd-d3-seg__btn' + (sel ? ' is-on' : ''), short(c.label));
			b.type = 'button';
			b.setAttribute('role', 'radio');
			b.setAttribute('aria-checked', sel ? 'true' : 'false');
			b.setAttribute('data-k', 'opt:' + heading + ':' + c.label);
			b.addEventListener('click', function () { app.pick('more', heading, c.label); });
			row.appendChild(b);
		});
		return row;
	}

	// Handles and letterplates not made in the chosen finish are left out.
	function usable(app, heading, stepKey) {
		var S = g().HD_DD_Shared, step = app.stepFor(heading);
		var list = step ? step.choices : [];
		if (!S || !app.model) { return list; }
		var ok = list.filter(function (c) { return !S.disabledReason(app.model, app.type(), app.design(), stepKey, c.label); });
		return ok.length ? ok : list;
	}

	function section(app, key) {
		var box = el('div', 'hd-d3-section hd-d3-section--' + key);
		box.id = 'hd-d3-panel-' + key;
		if (key === 'colour') { box.appendChild(tiles(app, key, 'Door Colour (External)', 'colour', app.stepFor('Door Colour (External)').choices)); }
		else if (key === 'style') { box.appendChild(tiles(app, key, 'Door Design', 'style', app.styles())); }
		else if (key === 'handle') { box.appendChild(tiles(app, key, 'Handle', 'part', usable(app, 'Handle', 'handle'))); }
		else if (key === 'letterplate') { box.appendChild(tiles(app, key, 'Letterplate', 'part', usable(app, 'Letterplate', 'letterplate'))); }
		else if (key === 'knocker') { box.appendChild(tiles(app, key, 'Knocker', 'part', app.stepFor('Knocker').choices)); }
		else if (key === 'more') {
			moreGroups(app).forEach(function (grp) {
				var wrap = el('div', 'hd-d3-group');
				wrap.setAttribute('data-group', grp.key);
				wrap.appendChild(el('div', 'hd-d3-group__title', grp.title));
				var choices = app.stepFor(grp.heading).choices;
				wrap.appendChild(grp.kind === 'seg' ? segmented(app, grp.heading, choices) : tiles(app, 'more', grp.heading, grp.kind, choices));
				box.appendChild(wrap);
			});
		}
		return box;
	}

	// ---- Focus: every control carries data-k, so a redraw can put focus back on its twin ----
	function inside(n, roots) {
		for (; n; n = n.parentNode) { if (roots.indexOf(n) !== -1) { return true; } }
		return false;
	}
	function findFirst(rootEl, test) {
		if (!rootEl) { return null; }
		if (test(rootEl)) { return rootEl; }
		var kids = rootEl.children || [];
		for (var i = 0; i < kids.length; i++) { var hit = findFirst(kids[i], test); if (hit) { return hit; } }
		return null;
	}
	function attr(n, name) { return (n && n.getAttribute && n.getAttribute(name)) || ''; }
	function findKey(rootEl, k) { return k ? findFirst(rootEl, function (n) { return attr(n, 'data-k') === k; }) : null; }
	// The data-k of the focused control when it sits inside one of roots, else null.
	function focusedKey(roots) {
		var a = typeof document !== 'undefined' ? document.activeElement : null;
		return (attr(a, 'data-k') && inside(a, roots)) ? attr(a, 'data-k') : null;
	}
	function focusEl(n) {
		if (!n || !n.focus) { return false; }
		try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); }
		return true;
	}
	function restoreFocus(roots, k) {
		for (var i = 0; k && i < roots.length; i++) { if (focusEl(findKey(roots[i], k))) { return true; } }
		return false;
	}
	// The option to land on inside a panel: the selected one, else the first.
	function firstOption(panel) {
		var isOpt = function (n) { return attr(n, 'data-k').indexOf('opt:') === 0; };
		return findFirst(panel, function (n) { return isOpt(n) && (' ' + n.className + ' ').indexOf(' is-on ') !== -1; }) || findFirst(panel, isOpt);
	}

	function create(app) {
		var host = null, sheet = null, root = null, openKey = null, focus = null, onLayout = null, wasSheet = false;
		var openedBy = null;   // data-k of the tab, row or dot that opened the section
		function isPhone() { try { return !!(g().matchMedia && g().matchMedia(PHONE).matches); } catch (e) { return false; } }

		function rowButton(r, cls, kind) {
			var b = el('button', cls + (r.key === openKey ? ' is-open' : ''));
			b.type = 'button';
			b.setAttribute('data-k', kind + ':' + r.key);
			b.setAttribute('aria-expanded', r.key === openKey ? 'true' : 'false');
			b.setAttribute('aria-controls', kind === 'tab' ? 'hd-d3-sheet' : 'hd-d3-panel-' + r.key);
			b.appendChild(el('span', cls + '__label', r.label));
			b.appendChild(el('span', cls + '__value', r.value ? short(r.value) : ''));
			b.addEventListener('click', function () { if (openKey === r.key) { close(); } else { open(r.key, kind + ':' + r.key); } });
			return b;
		}

		function draw() {
			if (!host) { return; }
			var keep = focusedKey([host, sheet]);
			var keepScroll = sheet ? sheet.scrollTop : 0;
			host.innerHTML = '';
			var list = rows(app);
			if (openKey && !list.some(function (r) { return r.key === openKey; })) { openKey = null; }
			var tabs = el('div', 'hd-d3-tabs');
			tabs.setAttribute('aria-label', 'Change part of the door');
			var desk = el('div', 'hd-d3-rows');
			var phone = isPhone();
			list.forEach(function (r) {
				tabs.appendChild(rowButton(r, 'hd-d3-tab', 'tab'));
				desk.appendChild(rowButton(r, 'hd-d3-row', 'row'));
				if (r.key === openKey && !phone) { desk.appendChild(section(app, r.key)); }
			});
			host.appendChild(tabs); host.appendChild(desk);
			if (sheet) {
				sheet.innerHTML = '';
				sheet.hidden = !(openKey && phone);
				if (openKey && phone) {
					var head = el('div', 'hd-d3-sheet__head');
					var title = el('span', 'hd-d3-sheet__title', list.filter(function (r) { return r.key === openKey; })[0].label);
					title.id = 'hd-d3-sheet-title';
					head.appendChild(title);
					var done = el('button', 'hd-d3-sheet__close', 'Done');
					done.type = 'button';
					done.setAttribute('data-k', 'done');
					done.addEventListener('click', close);
					head.appendChild(done);
					sheet.appendChild(head);
					sheet.appendChild(section(app, openKey));
					sheet.scrollTop = keepScroll;
				}
			}
			var isSheet = !!(openKey && phone);
			if (app.shell && app.shell.classList) { app.shell.classList.toggle('is-sheet', isSheet); }
			if (isSheet !== wasSheet) { wasSheet = isSheet; if (onLayout) { onLayout(isSheet); } }   // the door resizes
			restoreFocus([host, sheet], keep);
		}

		// Bring a More options group (door glass, from the glass dot) into view; in the phone
		// sheet, move focus into it: that group's option, or the section's, else Done.
		function land(phone) {
			var where = phone ? sheet : host;
			var grp = focus ? findFirst(where, function (n) { return attr(n, 'data-group') === focus; }) : null;
			focus = null;
			if (grp) { try { grp.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* older browsers */ } }
			if (phone) { focusEl(firstOption(grp || sheet) || findKey(sheet, 'done')); }
		}

		// opener: data-k of what opened it ('tab:handle', 'row:handle', 'dot:glass'), for focus on close.
		function open(key, opener) {
			var to = DOT_TO[key] || [key];
			var changed = openKey !== to[0];
			openKey = to[0];
			focus = to[1] || null;
			openedBy = opener || openedBy;
			if (sheet) { sheet.scrollTop = 0; }
			draw();
			if (changed && app.opened) { app.opened(openKey); }
			land(isPhone());
		}
		function close() {
			var back = openedBy;
			openKey = null; openedBy = null;
			draw();
			if (back) { restoreFocus([host, root], back); }
		}
		function onKey(e) { if (e && e.key === 'Escape' && openKey) { if (e.preventDefault) { e.preventDefault(); } close(); } }

		return {
			render: function (el2, slots) {
				host = el2;
				sheet = (slots && slots.sheet) || null;
				root = (slots && slots.root) || null;
				onLayout = (slots && slots.onLayout) || null;
				host.addEventListener('keydown', onKey);
				if (sheet) {
					sheet.id = 'hd-d3-sheet';
					sheet.setAttribute('role', 'dialog');
					sheet.setAttribute('aria-labelledby', 'hd-d3-sheet-title');
					sheet.addEventListener('keydown', onKey);
				}
				draw();
			},
			refresh: draw,
			open: open,
			close: close,
			openKey: function () { return openKey; }
		};
	}

	return { create: create, rows: rows, moreGroups: moreGroups, partImage: partImage, focusedKey: focusedKey, restoreFocus: restoreFocus };
}));
