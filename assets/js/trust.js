// assets/js/trust.js
// The block above "Save my design & get my price" on the Review step, in both flows: the
// Checkatrade rating line, one real customer quote, and what saving gets you. The rating and
// quotes come from wp-admin settings via HD_DD_CONFIG.trust; with none set, only the benefits
// show. Copy rule: nothing here may make a promise about phone calls
// (tests/js/copy-rule.test.js scans every line of this file, comments included).
//
//   HD_DD_Trust.render(container, HD_DD_CONFIG.trust);
//   HD_DD_Trust.renderSaveBar(container, HD_DD_CONFIG.trust, onClick);  // above the door picture
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
		cta: 'Save my design & get my price',
		barHeading: 'Your door is ready',
		barNote: 'Free, no obligation'
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

	// The save bar that sits above the door picture when the customer arrives on Review: the
	// same action and the same words as the button at the foot of the step, offered before
	// they scroll, with the rating and the reassurance on the line directly beneath it.
	function renderSaveBar(container, trust, onClick) {
		var bar = el('div', 'hd-dd__savebar');
		bar.appendChild(el('div', 'hd-dd__savebar-heading', COPY.barHeading));
		var btn = el('button', 'hd-dd__savebar-btn', COPY.cta);
		btn.type = 'button';
		btn.addEventListener('click', onClick);
		bar.appendChild(btn);
		var rated = ratingLine(trust);
		bar.appendChild(el('div', 'hd-dd__savebar-note',
			(rated ? '★ ' + trust.rating + '/10 on Checkatrade · ' : '') + COPY.barNote));
		container.appendChild(bar);
		return bar;
	}

	return { COPY: COPY, ratingLine: ratingLine, pickQuote: pickQuote, render: render, renderSaveBar: renderSaveBar };
}));
