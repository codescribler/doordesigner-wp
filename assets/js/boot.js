// assets/js/boot.js
// WordPress entry for every [hd_door_designer] container. Loads the catalogue, render model and
// categories once, decides which FLOW this visitor gets, then starts it:
//   • ?flow= or the shortcode's data-flow force a flow (testing — never counted in experiments)
//   • else a running A/B experiment assigns the visitor to an arm (sticky, see experiment.js)
//   • else the site's default flow (wp-admin setting)
// Each flow reports to its own analytics funnel: classic -> 'door-designer', swipe2 -> 'door-designer-v3', designer3 -> 'door-designer-v4', designer4 -> 'door-designer-v5'.
(function () {
	'use strict';

	var CFG = window.HD_DD_CONFIG || {};
	var FUNNELS = { classic: 'door-designer', swipe2: 'door-designer-v3', designer3: 'door-designer-v4', designer4: 'door-designer-v5' };

	function funnelFor(flow) {
		var F = window.HD_DD_Funnel;
		if (!F || !F.create) { return { step: function () {}, lead: function () {} }; }
		if (flow === 'designer4') { return F.create(FUNNELS.designer4, F.ORDER_V5); }
		if (flow === 'designer3') { return F.create(FUNNELS.designer3, F.ORDER_V4); }
		return flow === 'swipe2' ? F.create(FUNNELS.swipe2, F.ORDER_V3) : F.create(FUNNELS.classic, F.ORDER);
	}

	function chooseFlow(root) {
		var E = window.HD_DD_Experiment;
		var flowCfg = CFG.flow || { 'default': 'classic', experiment: null };
		if (!E) { return { flow: flowCfg['default'] || 'classic', counted: false }; }
		var forced = E.forcedFlow(window.location.search, root, flowCfg);
		return E.resolve(flowCfg, forced) || { flow: flowCfg['default'] || 'classic', counted: false };
	}

	// A small reminder that this browser is excluded from the stats (?notrack=0 turns it off).
	function showMutedBadge() {
		if (document.querySelector('.hd-dd-notrack')) { return; }
		var b = document.createElement('div');
		b.className = 'hd-dd-notrack';
		b.textContent = 'Analytics off (you)';
		b.title = 'Your visits are not counted. Add ?notrack=0 to the address to count them again.';
		b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:#161616;color:#fff;font:12px/1.2 system-ui,sans-serif;padding:5px 9px;border-radius:99px;opacity:.75;pointer-events:none';
		document.body.appendChild(b);
	}

	function start(root) {
		var client = window.HD_DD_ApiClient ? window.HD_DD_ApiClient.create({ restUrl: CFG.restUrl || '', nonce: CFG.nonce }) : null;
		var api = function (path, opts) { return client ? client.request(path, opts) : Promise.reject(new Error('no api client')); };
		var catUrl = CFG.catalogueUrl || (CFG.restUrl + 'catalogue');
		var rmUrl = CFG.renderModelUrl || (CFG.restUrl + 'render-model');
		Promise.all([
			fetch(catUrl).then(function (r) { return r.json(); }),
			fetch(rmUrl).then(function (r) { return r.json(); }).catch(function () { return null; }),
			CFG.categoriesUrl ? fetch(CFG.categoriesUrl).then(function (r) { return r.json(); }).catch(function () { return null; }) : Promise.resolve(null)
		]).then(function (res) {
			var cv = res[0] && res[0].catalogue ? res[0].catalogue : res[0];
			var rm = (res[1] && res[1].available && res[1].model) ? res[1].model : null;
			if (!cv || !cv.byType) {
				root.textContent = (CFG.i18n && CFG.i18n.notLoaded) || 'The door designer is being set up.';
				return;
			}
			// ?notrack=1 (remembered): the owner using the live designer — no analytics, no A/B counting.
			var muted = !!(window.HD_DD_Funnel && window.HD_DD_Funnel.muted && window.HD_DD_Funnel.muted());
			// Swipe 2 needs the render model and all of its scripts (experiment.js canRunSwipe).
			var X = window.HD_DD_Experiment;
			var canSwipe = !!(X && X.canRunSwipe && X.canRunSwipe(window, rm));
			var canD3 = !!(X && X.canRunDesigner3 && X.canRunDesigner3(window, rm));
			var canD4 = !!(X && X.canRunDesigner4 && X.canRunDesigner4(window, rm));
			var saved = null;
			var designs = null; // a Designer 4 "my designs" link: ?designs=TOKEN&k=KEY
			var designsKey = '';
			try {
				var qs = new URLSearchParams(window.location.search);
				saved = qs.get('design');
				designs = qs.get('designs');
				designsKey = qs.get('k') || '';
			} catch (e) { saved = null; designs = null; }
			var doorType = root.getAttribute('data-door-type') || '';

			// Start one flow. `assignment` is null for forced flows, muted visits and return links.
			function launch(flow, assignment) {
				if (!muted) { try { if (typeof window.clarity === 'function') { window.clarity('set', 'hd_flow', flow); } } catch (e) { /* best-effort */ } }
				root.innerHTML = '';
				if (muted) { showMutedBadge(); }
				var funnel = funnelFor(flow);
				if (flow === 'designer4') {
					var d4 = new window.HD_DD_Designer4App(root, cv, rm, res[2], { api: api, funnel: funnel, experiment: assignment, doorType: doorType, flow: flow });
					if (designs) { d4.loadDesigns(designs, designsKey); } else if (saved) { d4.loadSaved(saved); } else { d4.render(); }
				} else if (flow === 'designer3') {
					var d3 = new window.HD_DD_Designer3App(root, cv, rm, res[2], { api: api, funnel: funnel, experiment: assignment, doorType: doorType, flow: flow });
					if (saved) { d3.loadSaved(saved); } else { d3.render(); }
				} else if (flow === 'swipe2') {
					var sw = new window.HD_DD_SwipeApp(root, cv, rm, res[2], { api: api, funnel: funnel, experiment: assignment, doorType: doorType, flow: flow });
					if (saved) { sw.loadSaved(saved); } else { sw.render(); }
				} else {
					var app = new window.HD_DD_App(root, cv, rm, res[2]);
					app.experiment = assignment;
					if (saved) { app.loadSavedDesign(saved); } else { app.render(); }
				}
				// Everyone who gets a designer on screen, so the dashboard can show who never
				// starts. A return link is someone coming back, not a new arrival.
				if (!saved && !(designs && flow === 'designer4')) { funnel.step('opened'); }
			}

			// The normal route: forced flow, else the A/B arm, else the site default.
			function launchAssigned() {
				var a = chooseFlow(root);
				// The swipe flow draws every card from the render model; without it, or without
				// one of its scripts, fall back to classic (not counted in the test).
				var flow = (a.flow === 'swipe2' && canSwipe) ? 'swipe2' : 'classic';
				if (a.flow === 'designer3') {
					if (canD3) { flow = 'designer3'; } else { console.warn('[HD DD] Designer 3 unavailable, showing Classic'); }
				}
				if (a.flow === 'designer4') {
					if (canD4) { flow = 'designer4'; } else { console.warn('[HD DD] Designer 4 unavailable, showing Classic'); }
				}
				var assignment = (!muted && a.counted && flow === a.flow) ? { experimentId: a.experimentId, visitorId: a.visitorId, arm: a.arm } : null;
				var exposed = (assignment && window.HD_DD_Experiment) ? window.HD_DD_Experiment.expose(api, a) : null;
				// How far this visitor gets (started / saw their door / opened the quote form), for
				// the A/B report. Only for counted visitors, and only once the expose has landed.
				var F = window.HD_DD_Funnel;
				if (F && F.attach) {
					F.attach(assignment ? function (step) {
						return api('experiment/step', { method: 'POST', body: JSON.stringify({ experimentId: assignment.experimentId, visitorId: assignment.visitorId, arm: assignment.arm, step: step }) });
					} : null, exposed);
				}
				launch(flow, assignment);
			}

			// A "my designs" link opens Designer 4 whatever the A/B assignment, and needs no lookup.
			if (designs && canD4) { launch('designer4', null); return; }

			// A saved design reopens in the flow it was saved from, without a new assignment:
			// the arm recorded when it was saved is what a later quote request converts for.
			if (saved && window.HD_DD_Experiment && window.HD_DD_Experiment.storedFlow) {
				api('design/' + encodeURIComponent(saved), { method: 'GET' }).then(function (r) {
					var flow = (r && r.ok) ? window.HD_DD_Experiment.storedFlow(r.body, { swipe2: canSwipe, designer3: canD3, designer4: canD4 }) : '';
					if (flow) { launch(flow, null); } else { launchAssigned(); }
				}, function () { launchAssigned(); });
				return;
			}
			launchAssigned();
		}).catch(function () {
			root.textContent = (CFG.i18n && CFG.i18n.notLoaded) || 'The door designer is being set up.';
		});
	}

	document.addEventListener('DOMContentLoaded', function () {
		Array.prototype.forEach.call(document.querySelectorAll('[data-hd-door-designer]'), start);
	});
})();
