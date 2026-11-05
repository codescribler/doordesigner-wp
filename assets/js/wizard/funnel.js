(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Funnel = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FUNNEL = 'door-designer';

  // Canonical dashboard order — fixed per step key regardless of which conditional
  // steps a given visitor is offered, so the funnel draws a stable sequence.
  var ORDER = {
    opened: 0, type: 1, frame: 2, style: 3, hinge: 4, extColour: 5, intColour: 6,
    sidelightType: 7, sidelightGlass: 8, glazing: 9, hardware: 10, handle: 11,
    letterplate: 12, letterplatePosition: 13, knocker: 14, review: 15, details: 16
  };

  // Swipe 2 reports as its own funnel ('door-designer-v3'). `opened` (the designer drew its
  // first screen) and `browsed` (the first swipe or tap through the doors) come before any
  // choice, so the dashboard can show who arrived and never started. `saved` is the
  // email-only save on Review; the quote request is the lead. Keys are lower-case because
  // the analytics pipeline lower-cases step names anyway.
  var ORDER_V3 = {
    opened: 0, browsed: 1, design: 2, type: 3, hinge: 4, colour: 5, intcolour: 6, glazing: 7,
    hardware: 8, handle: 9, letterplate: 10, letterplateposition: 11, knocker: 12, frame: 13,
    sidelighttype: 14, sidelightglass: 15, review: 16, saved: 17
  };

  // Designer 3 reports as 'door-designer-v4'. The lead is funnel.lead(), not a step.
  var ORDER_V4 = {
    opened: 0, type: 1, style: 2, shown: 3, colour: 4, handle: 5, letterplate: 6, knocker: 7,
    more: 8, saved: 9, frame: 10, quoteform: 11, callback: 12
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

  // A/B journey milestones (HD_DD_Experiment_Tracking on the server), read from the funnel
  // steps each flow already reports, so the control flow's own files never change:
  //   started  any choice   shown  saw their finished door   form  opened the quote form
  // Saves, quote requests and call backs are recorded by the server, not here.
  var MILESTONES = {
    'door-designer': { shown: 'review', form: 'details' },     // classic: Review, then the form
    'door-designer-v3': { shown: 'review' },
    'door-designer-v4': { shown: 'shown', form: 'quoteform' }  // Designer 3: the complete door
  };
  var BEFORE_CHOICE = { opened: true, browsed: true };
  function milestoneFor(name, key) {
    var m = MILESTONES[name];
    if (!m || !key || BEFORE_CHOICE[key]) { return ''; }
    if (m.form === key) { return 'form'; }
    if (m.shown === key) { return 'shown'; }
    return 'started';
  }

  // attach(send, ready): boot.js hands over send(milestone) for a visitor counted in the test,
  // and the expose promise, so no milestone reaches the server before the visitor's row
  // exists. Each milestone is sent at most once per page; nothing here may throw.
  var journey = null;
  function attach(send, ready) {
    journey = typeof send === 'function' ? { send: send, ready: ready, sent: {} } : null;
  }
  function report(name, key) {
    try {
      var m = journey && milestoneFor(name, key);
      if (!m || journey.sent[m] || muted()) { return; }
      journey.sent[m] = true;
      var j = journey;
      Promise.resolve(j.ready).then(function () { return j.send(m); }, function () { return j.send(m); })
        .then(null, function () { /* best-effort */ });
    } catch (e) { /* best-effort */ }
  }

  // A reporter bound to one funnel name + order map. `opts.auto`: a step the visitor didn't
  // take themselves (a door_type link picking the type), so it is no A/B milestone.
  function create(name, order) {
    function step(key, choice, opts) {
      if (!(opts && opts.auto)) { report(name, key); }
      var t = tracker();
      if (!t || order[key] == null) { return; }
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

  return { ORDER: ORDER, ORDER_V3: ORDER_V3, ORDER_V4: ORDER_V4, create: create, step: classic.step, lead: classic.lead, muted: muted, attach: attach, milestoneFor: milestoneFor };
}));
