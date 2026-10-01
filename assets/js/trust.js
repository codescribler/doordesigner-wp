// assets/js/trust.js
// The block above "Save my design & get my price" on the Review step, in both flows: the
// Checkatrade rating line, one real customer quote, and what saving gets you. The rating and
// quotes come from wp-admin settings via HD_DD_CONFIG.trust; with none set, only the benefits
// show. Copy rule: nothing here may make a promise about phone calls
// (tests/js/copy-rule.test.js scans every line of this file, comments included).
//
//   HD_DD_Trust.render(container, HD_DD_CONFIG.trust);
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_Trust = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var COPY = {
		heading: 'Save this design and get your price',
		benefits: [
			'We’ll email you a link so you can come back to it any time',
			'We’ll work out a price for this exact door and send it to you',
			'No pressure and no obligation. You decide what happens next.'
		],
		cta: 'Save my design & get my price'
	};

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	// The rating line needs both figures; a link is used only if it is http(s).
	function ratingLine(trust) {
		if (!trust || !trust.rating || !trust.count) { return null; }
		var url = /^https?:\/\//i.test(trust.url || '') ? trust.url : '';
		return { text: '★ ' + trust.rating + ' on Checkatrade · ' + trust.count + ' reviews', url: url };
	}

	function pickQuote(trust, rand) {
		var quotes = trust && trust.quotes;
		if (!quotes || !quotes.length) { return null; }
		var i = Math.floor((rand || Math.random)() * quotes.length);
		return quotes[Math.min(quotes.length - 1, Math.max(0, i))];
	}

	function render(container, trust, rand) {
		var box = el('div', 'hd-dd__trust');

		var line = ratingLine(trust);
		if (line) {
			var rating = el(line.url ? 'a' : 'div', 'hd-dd__trust-rating', line.text);
			if (line.url) { rating.href = line.url; rating.target = '_blank'; rating.rel = 'noopener'; }
			box.appendChild(rating);
		}

		var quote = pickQuote(trust, rand);
		if (quote) {
			var fig = el('figure', 'hd-dd__trust-quote');
			fig.appendChild(el('blockquote', null, '“' + quote.text + '”'));
			if (quote.by) { fig.appendChild(el('figcaption', null, '— ' + quote.by)); }
			box.appendChild(fig);
		}

		box.appendChild(el('div', 'hd-dd__trust-heading', COPY.heading));
		var list = el('ul', 'hd-dd__trust-benefits');
		COPY.benefits.forEach(function (b) { list.appendChild(el('li', null, b)); });
		box.appendChild(list);

		container.appendChild(box);
		return box;
	}

	return { COPY: COPY, ratingLine: ratingLine, pickQuote: pickQuote, render: render };
}));
