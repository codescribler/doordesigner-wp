// assets/js/designer4/d4-card.js
// One door's card on My designs (d4-mydesigns.js): picture, name, date saved, the price tag, the
// doorway (a prompt, or its caption and Change; nothing when its type has no side or top lights:
// door.doorway false), Open and adjust, and Remove, which first swaps the card to its question. A
// door on a closed deal shows its picture, name and date only.
//
//   HD_DD_D4Card.render(door, { confirming, busy, error }, actions) -> <li>
//     actions: open(door), doorway(door), ask(door), keep(door), remove(door)
//   HD_DD_D4Card.shortDate('2026-11-10 06:49:12') -> '10 Nov';  .picture(url) -> url or ''
(function (W) {
	'use strict';

	var COPY = {
		saved: 'Saved {date}',
		pending: 'Price on its way',
		estimate_sent: 'Estimate sent',
		askQ: 'Does your doorway have glass at the side or top?',
		askMore: 'Tell us for a closer price ›',
		change: 'Change',
		open: 'Open and adjust',
		remove: 'Remove',
		removeQ: 'Remove {name}?',
		removeSub: 'We won\'t price this one.',
		keep: 'Keep it',
		failed: 'Sorry, that didn\'t work. Please try again.'
	};
	var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}
	function button(cls, txt, key, onClick) {
		var b = el('button', cls, txt);
		b.type = 'button';
		b.setAttribute('data-k', key);
		b.addEventListener('click', onClick);
		return b;
	}

	// "YYYY-MM-DD HH:MM:SS" in the site's time -> "10 Nov"; '' when it isn't that shape.
	function shortDate(s) {
		var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/.exec(String(s == null ? '' : s));
		var mon = m ? Number(m[2]) : 0, day = m ? Number(m[3]) : 0;
		return (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) ? day + ' ' + MONTHS[mon - 1] : '';
	}
	// Only an https URL or a path on this site ("/..." but not "//..." or "/\...").
	function picture(url) {
		var u = String(url == null ? '' : url);
		return (/^https:\/\//i.test(u) || /^\/(?![\/\\])/.test(u)) ? u : '';
	}
	function caption(frame) {
		var D = W.HD_DD_D4Doorway, c = D && D.CAPTIONS ? D.CAPTIONS[frame.id] : '';
		return c || String(frame.label || '');
	}

	// null when the door's type has no side or top lights (doorway: false): nothing to ask or change.
	function doorway(d, actions) {
		if (d.doorway === false) { return null; }
		if (!d.frame) {
			var ask = button('hd-d4-card__doorway hd-d4-card__ask', null, 'doorway:' + d.token, function () { actions.doorway(d); });
			ask.appendChild(el('span', null, COPY.askQ + ' '));
			ask.appendChild(el('b', null, COPY.askMore));
			return ask;
		}
		var p = el('p', 'hd-d4-card__doorway');
		p.appendChild(el('span', null, caption(d.frame) + ' · '));
		p.appendChild(button('hd-d3-textlink', COPY.change, 'change:' + d.token, function () { actions.doorway(d); }));
		return p;
	}

	function question(li, d, state, actions) {
		li.appendChild(el('p', 'hd-d4-card__q', COPY.removeQ.replace('{name}', d.name || '')));
		li.appendChild(el('p', 'hd-d4-card__sub', COPY.removeSub));
		var two = el('div', 'hd-d4-card__two');
		var yes = button('hd-d4-card__yes', COPY.remove, 'confirm:' + d.token, function () {
			if (yes.disabled) { return; }
			yes.disabled = true; no.disabled = true;
			actions.remove(d);
		});
		var no = button('hd-d4-card__keep', COPY.keep, 'keep:' + d.token, function () { if (!no.disabled) { actions.keep(d); } });
		yes.disabled = no.disabled = !!state.busy;
		two.appendChild(yes); two.appendChild(no);
		li.appendChild(two);
	}

	function render(d, state, actions) {
		var closed = d.status === 'closed';
		var li = el('li', 'hd-d4-card' + (closed ? ' is-closed' : '') + (state.confirming && !closed ? ' is-removing' : ''));
		if (state.confirming && !closed) { question(li, d, state, actions); return li; }
		var src = picture(d.image);
		if (src) { var im = el('img', 'hd-d4-card__pic'); im.alt = ''; im.src = src; li.appendChild(im); }
		li.appendChild(el('p', 'hd-d4-card__name', d.name || ''));
		var date = shortDate(d.savedAt);
		if (date) { li.appendChild(el('p', 'hd-d4-card__date', COPY.saved.replace('{date}', date))); }
		if (closed) { return li; }
		if (d.status === 'pending' || d.status === 'estimate_sent') { li.appendChild(el('p', 'hd-d4-card__tag', COPY[d.status])); }
		var dw = doorway(d, actions);
		if (dw) { li.appendChild(dw); }
		li.appendChild(button('hd-d4-card__open', COPY.open, 'open:' + d.token, function () { actions.open(d); }));
		var rm = button('hd-d4-card__remove', COPY.remove, 'remove:' + d.token, function () { actions.ask(d); });
		rm.setAttribute('aria-label', COPY.removeQ.replace('{name}', d.name || '').replace(/\?$/, ''));
		li.appendChild(rm);
		if (state.error) {
			var err = el('p', 'hd-d4-card__error', COPY.failed);
			err.setAttribute('role', 'alert');
			li.appendChild(err);
		}
		return li;
	}

	W.HD_DD_D4Card = { render: render, shortDate: shortDate, picture: picture, COPY: COPY };
})(typeof window !== 'undefined' ? window : this);
