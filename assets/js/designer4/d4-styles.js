// assets/js/designer4/d4-styles.js
// Designer 4's style screen: the most-chosen styles first, the rest behind "See all styles".
// Which styles are popular comes from the server (HD_DD_CONFIG.popularStyles, built from the doors
// people have really sent, on top of a starting list: class-hd-d4-popular.php), so the order
// improves by itself. A type with few styles, or no list, shows every style as Designer 3 does.
//
//   HD_DD_D4Styles.render(app, shell)
//   HD_DD_D4Styles.split(labels, popular, chosen) -> { top: [...], rest: [...] }
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
	else { root.HD_DD_D4Styles = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (W) {
	'use strict';

	var COPY = {
		title: 'Pick your style',
		help: 'Pick one and we’ll show you the finished door straight away. You can change anything after.',
		popular: 'Most popular',
		all: 'All styles',
		more: 'See all {n} styles'
	};
	var TOP = 8;         // styles shown before "See all"
	var FEW = 12;        // a type with this many styles or fewer just shows them all
	var FILTERS = ['Glazed', 'Solid', 'Contemporary', 'Georgian'];

	function g() { return (typeof window !== 'undefined' ? window : W) || {}; }
	function trim(s) { return String(s == null ? '' : s).trim(); }
	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	// Popular styles first (in the server's order), then the others as the catalogue lists them.
	// The style already on the door is always in the first group.
	function split(labels, popular, chosen) {
		var rank = {};
		(popular || []).forEach(function (l, i) { if (rank[trim(l)] == null) { rank[trim(l)] = i; } });
		var hits = labels.filter(function (l) { return rank[trim(l)] != null; })
			.sort(function (a, b) { return rank[trim(a)] - rank[trim(b)]; });
		var top = hits.slice(0, TOP);
		if (chosen && labels.indexOf(chosen) !== -1 && top.indexOf(chosen) === -1) { top = [chosen].concat(top); }
		return { top: top, rest: labels.filter(function (l) { return top.indexOf(l) === -1; }) };
	}

	function render(app, shell) {
		var Sc = g().HD_DD_D3Screens, P = g().HD_DD_SwipeParts;
		var parts = Sc && Sc.parts;
		if (!parts) { if (Sc && Sc.style) { Sc.style(app, shell); } return; }
		parts.header(app, shell, COPY.title, COPY.help, 'type');
		var cats = (app.categories && app.categories[app.type()]) || {};
		var labels = app.styles().map(function (s) { return s.label; });
		var cfg = app.cfg ? app.cfg() : {};
		var popular = (cfg.popularStyles && cfg.popularStyles[app.type()]) || [];
		var present = {};
		labels.forEach(function (l) { if (cats[l]) { present[cats[l]] = true; } });
		var filters = ['All'].concat(FILTERS.filter(function (f) { return present[f]; }));
		var body = el('div', 'hd-d4-styles');

		function tile(label) {
			var img = parts.styleTile(app, label) || (P ? P.blankThumb(app.assetBase(), app.model, app.type(), label) : null);
			return parts.card(P ? P.short(label) : trim(label), '', img, label === app.style(), function () { app.select('Door Design', label); });
		}
		function grid(list) {
			var gr = el('div', 'hd-d3-grid hd-d3-grid--styles');
			list.forEach(function (l) { gr.appendChild(tile(l)); });
			return gr;
		}
		function fill() {
			body.innerHTML = '';
			var f = app.styleFilter || 'All';
			var sp = split(labels, popular, app.style());
			if (f !== 'All') {
				var ordered = sp.top.concat(sp.rest).filter(function (l) { return cats[l] === f; });
				body.appendChild(grid(ordered));
				return;
			}
			if (labels.length <= FEW || sp.top.length < 4) { body.appendChild(grid(labels)); return; }
			body.appendChild(el('p', 'hd-d4-styles__eyebrow', COPY.popular));
			body.appendChild(grid(sp.top));
			if (!app.allStyles) {
				var more = el('button', 'hd-d4-styles__more', COPY.more.replace('{n}', String(labels.length)));
				more.type = 'button';
				more.setAttribute('data-k', 'styles:all');
				more.addEventListener('click', function () { app.allStyles = true; fill(); });
				body.appendChild(more);
				return;
			}
			body.appendChild(el('p', 'hd-d4-styles__eyebrow hd-d4-styles__eyebrow--all', COPY.all));
			body.appendChild(grid(sp.rest));
		}

		if (filters.length > 2) {
			var bar = el('div', 'hd-d3-filters');
			filters.forEach(function (f) {
				var b = el('button', 'hd-d3-filter' + ((app.styleFilter || 'All') === f ? ' is-on' : ''), f);
				b.type = 'button';
				b.addEventListener('click', function () {
					app.styleFilter = f;
					Array.prototype.forEach.call(bar.children, function (x) {
						x.className = 'hd-d3-filter' + (x === b ? ' is-on' : '');
					});
					fill();
				});
				bar.appendChild(b);
			});
			shell.appendChild(bar);
		}
		fill();
		shell.appendChild(body);
	}

	return { render: render, split: split, COPY: COPY, TOP: TOP };
}));
