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

	function create(app) {
		var host = null, sheet = null, openKey = null, focus = null, onLayout = null, wasSheet = false;
		function isPhone() { try { return !!(g().matchMedia && g().matchMedia(PHONE).matches); } catch (e) { return false; } }

		function rowButton(r, cls) {
			var b = el('button', cls + (r.key === openKey ? ' is-open' : ''));
			b.type = 'button';
			b.setAttribute('aria-expanded', r.key === openKey ? 'true' : 'false');
			b.appendChild(el('span', cls + '__label', r.label));
			b.appendChild(el('span', cls + '__value', r.value ? short(r.value) : ''));
			b.addEventListener('click', function () { if (openKey === r.key) { close(); } else { open(r.key); } });
			return b;
		}

		function draw() {
			if (!host) { return; }
			var keepScroll = sheet ? sheet.scrollTop : 0;
			host.innerHTML = '';
			var list = rows(app);
			if (openKey && !list.some(function (r) { return r.key === openKey; })) { openKey = null; }
			var tabs = el('div', 'hd-d3-tabs');
			tabs.setAttribute('aria-label', 'Change part of the door');
			var desk = el('div', 'hd-d3-rows');
			var phone = isPhone();
			list.forEach(function (r) {
				tabs.appendChild(rowButton(r, 'hd-d3-tab'));
				desk.appendChild(rowButton(r, 'hd-d3-row'));
				if (r.key === openKey && !phone) { desk.appendChild(section(app, r.key)); }
			});
			host.appendChild(tabs); host.appendChild(desk);
			if (sheet) {
				sheet.innerHTML = '';
				sheet.hidden = !(openKey && phone);
				if (openKey && phone) {
					var head = el('div', 'hd-d3-sheet__head');
					head.appendChild(el('span', 'hd-d3-sheet__title', list.filter(function (r) { return r.key === openKey; })[0].label));
					var done = el('button', 'hd-d3-sheet__close', 'Done');
					done.type = 'button';
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
		}

		function scrollToFocus() {
			if (!focus) { return; }
			var where = (isPhone() ? sheet : host);
			var target = where && where.querySelector && where.querySelector('[data-group="' + focus + '"]');
			focus = null;
			if (!target) { return; }
			try { target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* older browsers */ }
		}

		function open(key) {
			var to = DOT_TO[key] || [key];
			openKey = to[0];
			focus = to[1] || null;
			if (sheet) { sheet.scrollTop = 0; }
			draw();
			scrollToFocus();
		}
		function close() { openKey = null; draw(); }

		return {
			render: function (el2, slots) { host = el2; sheet = (slots && slots.sheet) || null; onLayout = (slots && slots.onLayout) || null; draw(); },
			refresh: draw,
			open: open,
			close: close,
			openKey: function () { return openKey; }
		};
	}

	return { create: create, rows: rows, moreGroups: moreGroups, partImage: partImage };
}));
