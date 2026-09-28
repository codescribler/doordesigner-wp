// assets/js/boot.js
// WordPress entry for every [hd_door_designer] container. Loads the catalogue, render model and
// categories once, decides which FLOW this visitor gets, then starts it:
//   • ?flow= or the shortcode's data-flow force a flow (testing — never counted in experiments)
//   • else a running A/B experiment assigns the visitor to an arm (sticky, see experiment.js)
//   • else the site's default flow (wp-admin setting)
// Each flow reports to its own analytics funnel: classic → 'door-designer', swipe → 'door-designer-v2'.
(function () {
	'use strict';

	var CFG = window.HD_DD_CONFIG || {};
	var FUNNELS = { classic: 'door-designer', swipe: 'door-designer-v2' };

	function funnelFor(flow) {
		var F = window.HD_DD_Funnel;
		if (!F || !F.create) { return { step: function () {}, lead: function () {} }; }
		return flow === 'swipe' ? F.create(FUNNELS.swipe, F.ORDER_V2) : F.create(FUNNELS.classic, F.ORDER);
	}

	function chooseFlow(root) {
		var E = window.HD_DD_Experiment;
		var flowCfg = CFG.flow || { 'default': 'classic', experiment: null };
		if (!E) { return { flow: flowCfg['default'] || 'classic', counted: false }; }
		var forced = E.forcedFlow(window.location.search, root);
		return E.resolve(flowCfg, forced) || { flow: flowCfg['default'] || 'classic', counted: false };
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
			var a = chooseFlow(root);
			// The swipe flow draws every card from the render model; without it, fall back.
			var flow = (a.flow === 'swipe' && rm && window.HD_DD_SwipeApp) ? 'swipe' : 'classic';
			var assignment = (a.counted && flow === a.flow) ? { experimentId: a.experimentId, visitorId: a.visitorId, arm: a.arm } : null;
			try { if (typeof window.clarity === 'function') { window.clarity('set', 'hd_flow', flow); } } catch (e) { /* best-effort */ }
			if (assignment && window.HD_DD_Experiment) { window.HD_DD_Experiment.expose(api, a); }

			var saved = null;
			try { saved = new URLSearchParams(window.location.search).get('design'); } catch (e) { saved = null; }
			var doorType = root.getAttribute('data-door-type') || '';
			root.innerHTML = '';

			if (flow === 'swipe') {
				var sw = new window.HD_DD_SwipeApp(root, cv, rm, res[2], { api: api, funnel: funnelFor('swipe'), experiment: assignment, doorType: doorType });
				if (saved) { sw.loadSaved(saved); } else { sw.render(); }
				return;
			}
			var app = new window.HD_DD_App(root, cv, rm, res[2]);
			app.experiment = assignment;
			if (saved) { app.loadSavedDesign(saved); } else { app.render(); }
		}).catch(function () {
			root.textContent = (CFG.i18n && CFG.i18n.notLoaded) || 'The door designer is being set up.';
		});
	}

	document.addEventListener('DOMContentLoaded', function () {
		Array.prototype.forEach.call(document.querySelectorAll('[data-hd-door-designer]'), start);
	});
})();
