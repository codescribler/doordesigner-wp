// assets/js/swipe/flow-steps.js
// The swipe flow's screen order. It does NOT re-decide which choices are valid — that stays in
// HD_DD_StepConfig.applicableSteps() (the rules the classic wizard and its tests already rely
// on). This only groups those steps into the swipe screens, in the new order, with the copy.
//
// Each screen has one MAIN step (the carousel) and optional SUB steps (small toggles/chips on
// the same screen): hinge side sits on the door-type screen, hardware finish on the handle
// screen, inside colour on the colour screen, and so on.
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_FlowSteps = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var DESIGN_SCREEN = {
		key: 'design',
		title: 'Find a door you love',
		help: 'Swipe to browse. Tap Choose when one catches your eye — colour comes next.'
	};

	// main: wizard step key ('__type__' = the door-type cards, drawn from the design index).
	var SCREENS = [
		{ key: 'type', main: '__type__', subs: ['hinge'], short: 'door type',
			title: 'Single, double or stable?', help: 'Swipe to see it as each kind of door, then pick the hinge side.' },
		{ key: 'colour', main: 'extColour', subs: ['intColour'], short: 'colour',
			title: 'Pick your colour', help: 'Swipe to see your door in every colour.' },
		{ key: 'glazing', main: 'glazing', subs: [], short: 'glass',
			title: 'Choose your glass', help: 'Swipe through the glass. Frosted and textured glass adds privacy.' },
		{ key: 'handle', main: 'handle', subs: ['hardware'], short: 'handle',
			title: 'Choose your handle', help: 'Pick your hardware colour, then swipe through the handles that come in it.' },
		{ key: 'letterplate', main: 'letterplate', subs: ['letterplatePosition'], short: 'letterplate',
			title: 'Add a letterplate?', help: 'Swipe to compare letterboxes, or keep “No Letterplate”.' },
		{ key: 'knocker', main: 'knocker', subs: [], short: 'knocker',
			title: 'Add a knocker?', help: 'A finishing touch. Swipe to compare, or keep “No Knocker”.' },
		{ key: 'sides', main: 'frame', subs: ['sidelightType', 'sidelightGlass'], short: 'side panels',
			title: 'Side panels or a window above?', help: 'Glass beside or above the door brings in light. Just the door is fine too.' }
	];

	// Aluminium comes as a single door only, so its first screen is just the hinge side.
	var HINGE_SCREEN = { key: 'hinge', main: 'hinge', subs: [], short: 'hinge side',
		title: 'Which side should it hinge?', help: 'Viewed from outside — the handle sits opposite the hinges.' };

	// Wizard step key → door-designer-v2 funnel key, in the funnel's canonical order.
	var FUNNEL_KEYS = [
		['__type__', 'type'], ['hinge', 'hinge'], ['extColour', 'colour'], ['intColour', 'intcolour'],
		['glazing', 'glazing'], ['hardware', 'hardware'], ['handle', 'handle'], ['letterplate', 'letterplate'],
		['letterplatePosition', 'letterplateposition'], ['knocker', 'knocker'], ['frame', 'frame'],
		['sidelightType', 'sidelighttype'], ['sidelightGlass', 'sidelightglass']
	];

	function isAluminium(design) { return !!(design['Door Type'] && design['Door Type'].label === 'Avantal'); }

	function screens(node, design, stepConfig) {
		var byKey = {};
		stepConfig.applicableSteps(node, design).forEach(function (s) { byKey[s.key] = s; });
		var defs = isAluminium(design) ? [HINGE_SCREEN].concat(SCREENS.slice(1)) : SCREENS;
		var out = [];
		defs.forEach(function (def) {
			var main = def.main === '__type__' ? null : byKey[def.main];
			if (def.main !== '__type__' && !main) { return; }
			// A step with a single possible answer isn't a choice — the app auto-picks it.
			if (main && main.choices.length < 2) { return; }
			out.push({
				key: def.key, title: def.title, help: def.help, short: def.short, main: main,
				subs: def.subs.map(function (k) { return byKey[k]; }).filter(Boolean)
			});
		});
		return out;
	}

	// Required steps with exactly one choice and nothing picked yet: [[heading, choice], …].
	function autoPicks(node, design, stepConfig) {
		return stepConfig.applicableSteps(node, design).filter(function (s) {
			return s.choices.length === 1 && !design[s.heading];
		}).map(function (s) { return [s.heading, s.choices[0]]; });
	}

	// The funnel events a screen reports when the visitor moves forward past it:
	// [[funnelKey, choiceLabel], …] in canonical order.
	function funnelEvents(screen, design) {
		var present = {};
		if (screen.key === 'type') { present.__type__ = design['Door Type'] ? design['Door Type'].label : ''; }
		[screen.main].concat(screen.subs).forEach(function (s) {
			if (s) { present[s.key] = design[s.heading] ? design[s.heading].label : ''; }
		});
		return FUNNEL_KEYS.filter(function (p) { return Object.prototype.hasOwnProperty.call(present, p[0]); })
			.map(function (p) { return [p[1], present[p[0]]]; });
	}

	return { DESIGN_SCREEN: DESIGN_SCREEN, screens: screens, autoPicks: autoPicks, funnelEvents: funnelEvents };
}));
