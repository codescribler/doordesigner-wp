// assets/js/trust.js
// Social proof on the swipe flow's Review step: the Checkatrade rating line and one real
// customer quote, from wp-admin settings via HD_DD_CONFIG.trust. With nothing set, nothing
// is drawn. Copy rule: nothing here may make a promise about phone calls
// (tests/js/copy-rule.test.js scans every line of this file, comments included).
//
//   HD_DD_Trust.renderProof(container, HD_DD_CONFIG.trust);
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_Trust = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

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
		return { text: '★ ' + trust.rating + '/10 on Checkatrade · ' + trust.count + ' reviews', url: url };
	}

	function pickQuote(trust, rand) {
		var all = (trust && trust.quotes) || [];
		var quotes = [];
		for (var k = 0; k < all.length; k++) {
			if (all[k] && typeof all[k] === 'object' && all[k].text) { quotes.push(all[k]); }
		}
		if (!quotes.length) { return null; }
		var i = Math.floor((rand || Math.random)() * quotes.length);
		return quotes[Math.min(quotes.length - 1, Math.max(0, i))];
	}

	// The rating line and a quote. Returns the block, or null when there is nothing to show.
	function renderProof(container, trust, rand) {
		var line = ratingLine(trust);
		var quote = pickQuote(trust, rand);
		if (!line && !quote) { return null; }
		var box = el('div', 'hd-dd__trust');
		if (line) {
			var rating = el(line.url ? 'a' : 'div', 'hd-dd__trust-rating', line.text);
			if (line.url) { rating.href = line.url; rating.target = '_blank'; rating.rel = 'noopener'; }
			box.appendChild(rating);
		}
		if (quote) {
			var fig = el('figure', 'hd-dd__trust-quote');
			fig.appendChild(el('blockquote', null, '\u201c' + quote.text + '\u201d'));
			if (quote.by) { fig.appendChild(el('figcaption', null, '\u2014 ' + quote.by)); }
			box.appendChild(fig);
		}
		container.appendChild(box);
		return box;
	}

	return { ratingLine: ratingLine, pickQuote: pickQuote, renderProof: renderProof };
}));
