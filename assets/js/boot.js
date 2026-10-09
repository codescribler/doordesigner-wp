// assets/js/boot.js
// WordPress entry for every [hd_door_designer] container. Loads the catalogue, render model and
// categories once, decides which FLOW this visitor gets, then starts it:
//   • ?flow= or the shortcode's data-flow force a flow (testing — never counted in experiments)
//   • else a running A/B experiment assigns the visitor to an arm (sticky, see experiment.js)
//   • else the site's default flow (wp-admin setting)
// Each flow reports to its own analytics funnel: classic -> 'door-designer', swipe2 -> 'door-designer-v3'.
(function () {
	'use strict';

	var CFG = window.HD_DD_CONFIG || {};
	var FUNNELS = { classic: 'door-designer', swipe2: 'door-designer-v3' };

	function funnelFor(flow) {
		var F = window.HD_DD_Funnel;
		if (!F || !F.create) { return { step: function () {}, lead: function () {} }; }
		return flow === 'swipe2' ? F.create(FUNNELS.swipe2, F.ORDER_V3) : F.create(FUNNELS.classic, F.ORDER);
	}

	function chooseFlow(root) {
		var E = window.HD_DD_Experiment;
		var flowCfg = CFG.flow || { 'default': 'classic', experiment: null };
		if (!E) { return { flow: flowCfg['default'] || 'classic', counted: false }; }
		var forced = E.forcedFlow(window.location.search, root);
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
			var saved = null;
			try { saved = new URLSearchParams(window.location.search).get('design'); } catch (e) { saved = null; }
			var doorType = root.getAttribute('data-door-type') || '';

			// Start one flow. `assignment` is null for forced flows, muted visits and return links.
			function launch(flow, assignment) {
				if (!muted) { try { if (typeof window.clarity === 'function') { window.clarity('set', 'hd_flow', flow); } } catch (e) { /* best-effort */ } }
				root.innerHTML = '';
				if (muted) { showMutedBadge(); }
				var funnel = funnelFor(flow);
				if (flow === 'swipe2') {
					var sw = new window.HD_DD_SwipeApp(root, cv, rm, res[2], { api: api, funnel: funnel, experiment: assignment, doorType: doorType, flow: flow });
					if (saved) { sw.loadSaved(saved); } else { sw.render(); }
				} else {
					var app = new window.HD_DD_App(root, cv, rm, res[2]);
					app.experiment = assignment;
					if (saved) { app.loadSavedDesign(saved); } else { app.render(); }
				}
				// Everyone who gets a designer on screen, so the dashboard can show who never
				// starts. A return link is someone coming back, not a new arrival.
				if (!saved) { funnel.step('opened'); }
			}

			// The normal route: forced flow, else the A/B arm, else the site default.
			function launchAssigned() {
				var a = chooseFlow(root);
				// The swipe flow draws every card from the render model; without it, or without
				// one of its scripts, fall back to classic (not counted in the test).
				var flow = (a.flow === 'swipe2' && canSwipe) ? 'swipe2' : 'classic';
				var assignment = (!muted && a.counted && flow === a.flow) ? { experimentId: a.experimentId, visitorId: a.visitorId, arm: a.arm } : null;
				if (assignment && window.HD_DD_Experiment) { window.HD_DD_Experiment.expose(api, a); }
				launch(flow, assignment);
			}

			// A saved design reopens in the flow it was saved from, without a new assignment:
			// the arm recorded when it was saved is what a later quote request converts for.
			if (saved && window.HD_DD_Experiment && window.HD_DD_Experiment.storedFlow) {
				api('design/' + encodeURIComponent(saved), { method: 'GET' }).then(function (r) {
					var flow = (r && r.ok) ? window.HD_DD_Experiment.storedFlow(r.body, canSwipe) : '';
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
