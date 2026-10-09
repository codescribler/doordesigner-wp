// assets/js/swipe/swipe-parts.js
// Small building blocks for the swipe screens: segmented toggles, chip rows, swatches, the
// review list and the thumbnail helpers. Stateless — every function takes what it draws.
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_SwipeParts = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	// Short, friendly labels for the customer; the stored design keeps Endurance's exact label.
	var SHORT = {
		'Hinges on Left': 'Left', 'Hinges on Right': 'Right', 'Left Leaf': 'Left leaf', 'Right Leaf': 'Right leaf',
		'Single Door': 'Single', 'Double Door': 'Double', 'Stable Door': 'Stable', 'Avantal': 'Aluminium',
		'Unglazed': 'Solid', 'No Sidelights': 'Just the door', 'No Letterplate': 'No letterplate', 'No Knocker': 'No knocker'
	};
	function short(label) { return SHORT[label] || String(label).trim(); }

	var TYPE_DESC = {
		'Single Door': 'One leaf, the classic front door.',
		'Double Door': 'Two leaves opening from the centre, for wide entrances.',
		'Stable Door': 'Split across the middle, so the top half opens on its own.',
		'Avantal': 'Slim aluminium frame with more glass.'
	};

	// A labelled segmented control: [Left | Right].
	function segmented(title, choices, selectedLabel, onPick) {
		var wrap = el('div', 'hd-sw-sub');
		wrap.appendChild(el('span', 'hd-sw-sub__title', title));
		var row = el('div', 'hd-sw-seg');
		row.setAttribute('role', 'radiogroup');
		row.setAttribute('aria-label', title);
		choices.forEach(function (c) {
			var b = el('button', 'hd-sw-seg__btn' + (c.label === selectedLabel ? ' is-on' : ''), short(c.label));
			b.type = 'button';
			b.setAttribute('role', 'radio');
			b.setAttribute('aria-checked', c.label === selectedLabel ? 'true' : 'false');
			b.addEventListener('click', function () { onPick(c); });
			row.appendChild(b);
		});
		wrap.appendChild(row);
		return wrap;
	}

	// A horizontally scrolling chip row; media(c) may return {swatch:css} or {img:url}.
	function chips(title, choices, selectedLabel, onPick, media) {
		var wrap = el('div', 'hd-sw-sub');
		if (title) { wrap.appendChild(el('span', 'hd-sw-sub__title', title)); }
		var row = el('div', 'hd-sw-chips');
		choices.forEach(function (c) {
			var on = c.label === selectedLabel;
			var b = el('button', 'hd-sw-chip' + (on ? ' is-on' : ''));
			b.type = 'button';
			b.setAttribute('aria-pressed', on ? 'true' : 'false');
			var m = media ? media(c) : null;
			if (m && m.swatch) { var sw = el('span', 'hd-sw-chip__swatch'); sw.style.background = m.swatch; b.appendChild(sw); }
			if (m && m.img) {
				var im = el('img', 'hd-sw-chip__img');
				im.alt = ''; im.loading = 'lazy';
				im.onerror = function () { if (im.parentNode) { im.parentNode.removeChild(im); } };
				im.src = m.img;
				b.appendChild(im);
			}
			b.appendChild(el('span', 'hd-sw-chip__label', c.display || short(c.label)));
			b.addEventListener('click', function () { onPick(c); });
			row.appendChild(b);
		});
		wrap.appendChild(scroller(row));
		// Bring the selected chip into view without scrolling the page.
		setTimeout(function () {
			var on = row.querySelector('.is-on');
			if (on) { row.scrollLeft = Math.max(0, on.offsetLeft - row.clientWidth / 2 + on.clientWidth / 2); }
		}, 0);
		return wrap;
	}

	// ‹ › buttons at the ends of a horizontally scrolling row. Each shows only while there is
	// more to see that way — scrolling a chip row with a mouse is awkward, and the last chips
	// can sit almost out of sight.
	function scroller(row) {
		var box = el('div', 'hd-sw-scroller');
		var prev = el('button', 'hd-sw-scroller__btn hd-sw-scroller__btn--prev', '‹');
		var next = el('button', 'hd-sw-scroller__btn hd-sw-scroller__btn--next', '›');
		prev.type = next.type = 'button';
		prev.setAttribute('aria-label', 'Previous options');
		next.setAttribute('aria-label', 'More options');
		function update() {
			var max = row.scrollWidth - row.clientWidth;
			prev.hidden = row.scrollLeft <= 2;
			next.hidden = row.scrollLeft >= max - 2;
			box.classList.toggle('has-prev', !prev.hidden);
			box.classList.toggle('has-next', !next.hidden);
		}
		function by(dir) {
			var amount = Math.max(120, row.clientWidth * 0.7) * dir;
			row.scrollLeft += amount; // a direct jump: smooth scrollBy can stall and leave the row put
			update();
		}
		prev.addEventListener('click', function () { by(-1); });
		next.addEventListener('click', function () { by(1); });
		row.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		box.appendChild(prev); box.appendChild(row); box.appendChild(next);
		setTimeout(update, 0);
		setTimeout(update, 60); // after the selected chip has been scrolled into view
		return box;
	}

	// "Inside: White · change" — collapsed until tapped.
	function disclosure(summary, build) {
		var wrap = el('div', 'hd-sw-sub hd-sw-disclose');
		var btn = el('button', 'hd-sw-disclose__btn');
		btn.type = 'button';
		btn.appendChild(el('span', null, summary));
		btn.appendChild(el('span', 'hd-sw-disclose__link', 'change'));
		btn.setAttribute('aria-expanded', 'false');
		var body = null;
		btn.addEventListener('click', function () {
			if (body) { wrap.removeChild(body); body = null; btn.setAttribute('aria-expanded', 'false'); return; }
			body = build();
			wrap.appendChild(body);
			btn.setAttribute('aria-expanded', 'true');
		});
		wrap.appendChild(btn);
		return wrap;
	}

	// Review summary rows with Edit links.
	function reviewList(rows, onEdit) {
		var list = el('div', 'hd-dd__review hd-sw-review');
		rows.forEach(function (r) {
			var row = el('div', 'hd-dd__review-row');
			row.appendChild(el('span', 'hd-dd__review-label', r.name));
			row.appendChild(el('span', 'hd-dd__review-value', r.value));
			if (r.edit) {
				var b = el('button', 'hd-dd__edit', 'Edit');
				b.type = 'button';
				b.addEventListener('click', function () { onEdit(r.edit); });
				row.appendChild(b);
			} else { row.appendChild(el('span', 'hd-dd__edit')); }
			list.appendChild(row);
		});
		return list;
	}

	// "Abbott, Anthracite Grey, Satin glass, Chrome hardware" (joined with a middle dot): the Review step's one-line
	// summary, from the same rows the full list shows.
	function reviewSummary(rows) {
		var by = {};
		(rows || []).forEach(function (r) { if (r && r.value) { by[r.name] = String(r.value).trim(); } });
		var parts = [];
		if (by['Design']) { parts.push(by['Design']); }
		if (by['Colour']) { parts.push(by['Colour']); }
		if (by['Glass']) { parts.push(/^(solid|unglazed)$/i.test(by['Glass']) ? 'Solid' : by['Glass'] + ' glass'); }
		if (by['Hardware']) { parts.push(by['Hardware'] + ' hardware'); }
		return parts.join(' \u00b7 ');
	}

	// A cheap still thumbnail of a design (the mould's blank image) for the showcase strip.
	function blankThumb(base, model, type, styleLabel) {
		var T = model && model.types && model.types[type];
		var s = T && T.styles && T.styles[styleLabel];
		if (!base || !s || !s.mould) { return null; }
		return encodeURI(base + '/Assets/CompositeDoors/Images/DoorBlanks/' + s.mould + '/Thumbnails/' + T.baselineColour + '.jpg');
	}

	function glassThumb(base, model, label) {
		var gt = model && model.glassThumbs;
		var key = gt && gt[label];
		return (base && key) ? encodeURI(base + '/Assets/CompositeDoors/Images/DoorGlazing/' + label + '/Thumbnails/' + key + '.png') : null;
	}

	function colourThumb(base, model, type, label) {
		var T = model && model.types && model.types[type];
		return (base && T && T.baselineMould) ? encodeURI(base + '/Assets/CompositeDoors/Images/DoorBlanks/' + T.baselineMould + '/Thumbnails/' + label + '.jpg') : null;
	}

	return {
		el: el, short: short, TYPE_DESC: TYPE_DESC, segmented: segmented, chips: chips, disclosure: disclosure,
		reviewList: reviewList, reviewSummary: reviewSummary, scroller: scroller, blankThumb: blankThumb, glassThumb: glassThumb, colourThumb: colourThumb
	};
}));
