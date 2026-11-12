// assets/js/designer4/d4-effort.js
// How much work went into a door: the changes the visitor made and the time they spent on it. It
// is sent with the lead so the business can tell a considered design from a passing look. It never
// gates anything. Time is "active" time: each stretch between two things the visitor did counts,
// up to IDLE at most, so a phone left on the table adds nothing.
//
//   var e = HD_DD_D4Effort.create({ now? });
//   e.enter(); e.touch(); e.change('colour'); e.leave(); e.snapshot() -> { changes, seconds, parts }
//   e.restore(snapshot); e.reset();   HD_DD_D4Effort.describe(snapshot) -> "7 changes over 6 min"
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_D4Effort = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var IDLE = 90 * 1000;
	var MAX_PARTS = 12;

	function create(o) {
		var now = (o && o.now) || function () { return Date.now(); };
		var changes = 0, ms = 0, parts = [], last = null;

		function tick() {
			var t = now();
			if (last != null && t > last) { ms += Math.min(t - last, IDLE); }
			last = t;
		}
		return {
			enter: function () { if (last == null) { last = now(); } },
			touch: function () { if (last != null) { tick(); } },
			leave: function () { if (last != null) { tick(); last = null; } },
			change: function (part) {
				if (last == null) { last = now(); } else { tick(); }
				changes++;
				part = String(part || '');
				if (part && parts.indexOf(part) === -1 && parts.length < MAX_PARTS) { parts.push(part); }
			},
			snapshot: function () {
				var live = last != null ? Math.min(Math.max(now() - last, 0), IDLE) : 0;
				return { changes: changes, seconds: Math.round((ms + live) / 1000), parts: parts.slice() };
			},
			restore: function (s) {
				if (!s) { return; }
				changes = Math.max(0, Number(s.changes) || 0);
				ms = Math.max(0, Number(s.seconds) || 0) * 1000;
				parts = Array.isArray(s.parts) ? s.parts.filter(function (p) { return typeof p === 'string' && p; }).slice(0, MAX_PARTS) : [];
				last = null;
			},
			reset: function () { changes = 0; ms = 0; parts = []; last = null; }
		};
	}

	function describe(s) {
		if (!s) { return ''; }
		var n = Number(s.changes) || 0, sec = Number(s.seconds) || 0;
		var time = sec < 60 ? sec + ' sec' : Math.round(sec / 60) + ' min';
		return n + (n === 1 ? ' change' : ' changes') + ' over ' + time;
	}

	return { create: create, describe: describe, IDLE: IDLE };
}));
