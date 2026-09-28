(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Funnel = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FUNNEL = 'door-designer';

  // Canonical dashboard order — fixed per step key regardless of which conditional
  // steps a given visitor is offered, so the funnel draws a stable sequence.
  var ORDER = {
    type: 1, frame: 2, style: 3, hinge: 4, extColour: 5, intColour: 6,
    sidelightType: 7, sidelightGlass: 8, glazing: 9, hardware: 10, handle: 11,
    letterplate: 12, letterplatePosition: 13, knocker: 14, review: 15, details: 16
  };

  // The swipe flow reports as its own funnel ('door-designer-v2') with its own order:
  // the manager treats a funnel's lowest-ordered step as "started" across the whole date
  // range, so re-ordering steps inside the classic funnel would miscount both flows.
  // Keys are lower-case because the analytics pipeline lower-cases step names anyway.
  var ORDER_V2 = {
    design: 1, type: 2, hinge: 3, colour: 4, intcolour: 5, glazing: 6, hardware: 7,
    handle: 8, letterplate: 9, letterplateposition: 10, knocker: 11, frame: 12,
    sidelighttype: 13, sidelightglass: 14, review: 15, details: 16
  };

  // "Don't count me": ?notrack=1 switches every designer analytics call off in this browser
  // and remembers it (localStorage), so the owner can use the live designer without skewing
  // the stats; ?notrack=0 switches it back on. Covers hdAnalytics funnel events and leads,
  // Clarity events and A/B-test counting (boot.js / the apps check muted()).
  var MUTE_KEY = 'hd_dd_notrack';
  function muted() {
    if (typeof window === 'undefined' || !window.location) { return false; }
    var m = String(window.location.search || '').match(/[?&]notrack=([^&#]*)/);
    try {
      if (m) {
        if (m[1] === '0') { window.localStorage.removeItem(MUTE_KEY); return false; }
        window.localStorage.setItem(MUTE_KEY, '1');
        return true;
      }
      return window.localStorage.getItem(MUTE_KEY) === '1';
    } catch (e) { return !!m && m[1] !== '0'; } // storage blocked: honour the URL only
  }

  // The site-wide analytics plugin defines window.hdAnalytics before our code runs
  // and queues early calls, so when present it is always safe to call. When absent
  // (plugin deactivated, QA harness) — or muted — every call is a silent no-op.
  function tracker() {
    if (muted()) { return null; }
    return (typeof window !== 'undefined' && window.hdAnalytics) ? window.hdAnalytics : null;
  }

  // This plugin's own version, printed into HD_DD_CONFIG by class-hd-assets.php.
  // Read at call time, not at load: the config is localised onto the main app
  // script, which loads after this file. Stamped on every event so the manager
  // dashboard can compare completion per release.
  function version() {
    var cfg = (typeof window !== 'undefined' && window.HD_DD_CONFIG) ? window.HD_DD_CONFIG : null;
    return (cfg && cfg.version) ? String(cfg.version) : '';
  }

  // A reporter bound to one funnel name + order map.
  function create(name, order) {
    function step(key, choice) {
      var t = tracker();
      if (!t || !order[key]) { return; }
      var opts = { order: order[key] };
      if (choice) { opts.choice = choice; }
      var ver = version();
      if (ver) { opts.version = ver; }
      try { t.step(name, key, opts); } catch (e) { /* analytics is best-effort */ }
    }

    function lead() {
      var t = tracker();
      if (!t) { return; }
      var ver = version();
      try {
        if (ver) { t.lead(name, { version: ver }); } else { t.lead(name); }
      } catch (e) { /* analytics is best-effort */ }
    }

    return { name: name, step: step, lead: lead };
  }

  var classic = create(FUNNEL, ORDER);

  return { ORDER: ORDER, ORDER_V2: ORDER_V2, create: create, step: classic.step, lead: classic.lead, muted: muted };
}));
