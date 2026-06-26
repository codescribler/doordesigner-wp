// assets/js/wizard/step-renderer.js
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_StepRenderer = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';
	function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (txt != null) { n.textContent = txt; } return n; }

	function tile(step, choice, ctx) {
		var t = el('button', 'hd-dd__tile');
		t.type = 'button';
		if (ctx.design[ctx.heading] && ctx.design[ctx.heading].label === choice.label) { t.className += ' is-selected'; }
		var media = ctx.thumbFor(step, choice); // {kind:'img',url} | {kind:'swatch',color} | null
		if (media && media.kind === 'img') { var im = el('img', 'hd-dd__tile-media'); im.src = media.url; im.alt = choice.label; im.loading = 'lazy'; t.appendChild(im); }
		else if (media && media.kind === 'swatch') { var sw = el('div', 'hd-dd__swatch'); sw.style.background = media.color; t.appendChild(sw); }
		t.appendChild(el('span', 'hd-dd__tile-label', friendly(choice.label)));
		t.addEventListener('click', function () { ctx.onSelect(ctx.heading, choice); });
		return t;
	}

	function friendly(label) { return label; } // display-only mapping hook; keep raw for now

	function renderStep(container, step, ctx) {
		container.innerHTML = '';
		container.appendChild(el('div', 'hd-dd__steptitle', step.label));
		if (step.categoryFirst && !ctx.design._styleCategory) {
			var cats = uniqueCategories(step, ctx);
			var row = el('div', 'hd-dd__carousel');
			cats.forEach(function (cat) {
				var b = el('button', 'hd-dd__tile'); b.type = 'button';
				b.appendChild(el('span', 'hd-dd__tile-label', cat));
				b.addEventListener('click', function () { ctx.design._styleCategory = cat; ctx.rerender(); });
				row.appendChild(b);
			});
			container.appendChild(row);
			return;
		}
		var carousel = el('div', 'hd-dd__carousel');
		var choices = step.choices;
		if (step.categoryFirst) { choices = choices.filter(function (c) { return ctx.categoryOf(c.label) === ctx.design._styleCategory; }); }
		choices.forEach(function (c) { carousel.appendChild(tile(step, c, ctx)); });
		container.appendChild(carousel);
	}

	function uniqueCategories(step, ctx) {
		var seen = {}; var out = [];
		step.choices.forEach(function (c) { var k = ctx.categoryOf(c.label); if (k && !seen[k]) { seen[k] = 1; out.push(k); } });
		return out;
	}

	return { renderStep: renderStep };
}));
