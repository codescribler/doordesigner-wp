// assets/js/experiment.js
// A/B test assignment for the designer flows. Reads HD_DD_CONFIG.flow:
//   { default: 'classic', experiment: null | { id, control, challenger, percent } }
// A visitor is assigned once per experiment (weighted by `percent` to the challenger)
// and kept on that arm for 90 days via localStorage['hd_dd_exp']. When the designer
// opens, expose() tells the server once, so the visitor is counted in their arm.
// A forced flow (?flow= or the shortcode's data-flow) always wins and is never counted.
// Nothing here may break the designer: every browser touch is try/caught.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Experiment = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'hd_dd_exp';
  var MAX_AGE = 90 * 24 * 60 * 60 * 1000;
  var ARMS = { control: true, challenger: true };
  var VISITOR_RE = /^[a-f0-9]{32}$/;

  // The first swipe flow was retired when Swipe 2 replaced it; old links keep working.
  var ALIASES = { swipe: 'swipe2' };
  function canonical(flow) {
    var f = String(flow == null ? '' : flow).trim().toLowerCase();
    return ALIASES[f] || f;
  }

  // The flow a saved design should reopen in, from GET design/{token}. '' = not recorded
  // (rows saved before this was stored): the caller falls back to the normal assignment.
  // `caps` is a boolean (can run swipe2, the old form) or {swipe2:bool, designer3:bool}.
  function storedFlow(body, caps) {
    var f = canonical(body && body.flow);
    var c = (caps && typeof caps === 'object') ? caps : { swipe2: !!caps, designer3: false };
    if (f === 'classic') { return 'classic'; }
    if (f === 'swipe2') { return c.swipe2 ? 'swipe2' : 'classic'; }
    if (f === 'designer3') { return c.designer3 ? 'designer3' : 'classic'; }
    return '';
  }

  // Swipe 2 may only start when everything it needs is loaded: the render model and its
  // scripts. A cached page from before an update can lack a script tag the new code relies
  // on; those visitors get classic instead (boot.js), and are not counted.
  function canRunSwipe(win, renderModel) {
    return !!(renderModel && win && win.HD_DD_SwipeApp && win.HD_DD_ReviewSave && win.HD_DD_SwipeHint);
  }

  // Designer 3 needs the render model, its app and preview scripts, and the modules the app
  // reaches for after the first screen (same fallback rule as Swipe 2).
  var D3_NEEDS = ['HD_DD_Designer3App', 'HD_DD_Preview', 'HD_DD_D3AfterSave', 'HD_DD_D3Save', 'HD_DD_D3Toolbox', 'HD_DD_D3FrameStep'];
  function canRunDesigner3(win, renderModel) {
    return !!(renderModel && win) && D3_NEEDS.every(function (k) { return !!win[k]; });
  }

  // Flows a forced value may name: the built-in ones plus whatever the config mentions.
  function knownFlows(cfg) {
    var known = { classic: true, swipe2: true, designer3: true };
    cfg = cfg || {};
    if (cfg['default']) { known[cfg['default']] = true; }
    if (cfg.experiment) {
      if (cfg.experiment.control) { known[cfg.experiment.control] = true; }
      if (cfg.experiment.challenger) { known[cfg.experiment.challenger] = true; }
    }
    return known;
  }

  function hexFromRand(rand) {
    var out = '';
    for (var i = 0; i < 32; i++) { out += (Math.floor(rand() * 16) & 15).toString(16); }
    return out;
  }

  function hexFromCrypto(c) {
    try {
      if (!c || typeof c.getRandomValues !== 'function') { return ''; }
      var bytes = c.getRandomValues(new Uint8Array(16));
      var out = '';
      for (var i = 0; i < bytes.length; i++) { out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); }
      return VISITOR_RE.test(out) ? out : '';
    } catch (e) { return ''; }
  }

  function validStored(stored, exp, now) {
    return !!(stored && typeof stored === 'object' &&
      stored.experimentId === exp.id &&
      ARMS[stored.arm] === true &&
      typeof stored.visitorId === 'string' && VISITOR_RE.test(stored.visitorId) &&
      typeof stored.assignedAt === 'number' && now - stored.assignedAt < MAX_AGE && stored.assignedAt <= now);
  }

  // Pure: decide the flow for this page load.
  //   flowCfg  HD_DD_CONFIG.flow
  //   forced   '' or a flow from forcedFlow()
  //   stored   the parsed localStorage record, or null
  //   rand     () => [0, 1)   (Math.random in the browser)
  //   now      ms timestamp (optional; Date.now())
  // Returns { flow, experimentId, arm, visitorId, counted, store, exposed } where `store`
  // is the record to save (null = leave storage alone).
  function assign(flowCfg, forced, stored, rand, now) {
    var cfg = flowCfg || {};
    rand = typeof rand === 'function' ? rand : Math.random;
    now = typeof now === 'number' ? now : Date.now();
    var result = { flow: canonical(cfg['default']) || 'classic', experimentId: null, arm: null, visitorId: null, counted: false, store: null, exposed: false };

    if (forced && knownFlows(cfg)[forced]) { result.flow = forced; return result; }

    var exp = cfg.experiment;
    if (!exp || !exp.id || !exp.control || !exp.challenger) { return result; }

    result.experimentId = exp.id;
    result.counted = true;
    if (validStored(stored, exp, now)) {
      result.arm = stored.arm;
      result.visitorId = stored.visitorId;
      result.exposed = stored.exposed === true;
    } else {
      var pct = Number(exp.percent);
      if (!(pct >= 0 && pct <= 100)) { pct = 50; }
      result.arm = rand() * 100 < pct ? 'challenger' : 'control';
      result.visitorId = hexFromRand(rand);
      result.store = { experimentId: exp.id, arm: result.arm, visitorId: result.visitorId, assignedAt: now };
    }
    result.flow = canonical(exp[result.arm]);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Browser wrapper. `env` (optional, for tests): { storage, rand, now, crypto }.
  // ---------------------------------------------------------------------------
  function browserStorage() {
    try { return (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null; } catch (e) { return null; }
  }

  function envStorage(env) {
    return (env && 'storage' in env) ? env.storage : browserStorage();
  }

  function read(storage) {
    try {
      var raw = storage ? storage.getItem(KEY) : null;
      var data = raw ? JSON.parse(raw) : null;
      return (data && typeof data === 'object') ? data : null;
    } catch (e) { return null; }
  }

  function write(storage, record) {
    try { if (storage) { storage.setItem(KEY, JSON.stringify(record)); return true; } } catch (e) { /* private mode / quota */ }
    return false;
  }

  // Assign this page load's flow, persisting a new assignment when storage allows.
  function resolve(flowCfg, forced, env) {
    env = env || {};
    try {
      var storage = envStorage(env);
      var a = assign(flowCfg, forced, read(storage), env.rand || Math.random, env.now);
      if (a.store) {
        var c = ('crypto' in env) ? env.crypto : (typeof window !== 'undefined' ? window.crypto : null);
        var id = hexFromCrypto(c);
        if (id) { a.visitorId = id; a.store.visitorId = id; }
        write(storage, a.store);
      }
      return a;
    } catch (e) {
      var cfg = flowCfg || {};
      return { flow: canonical(cfg['default']) || 'classic', experimentId: null, arm: null, visitorId: null, counted: false, store: null, exposed: false };
    }
  }

  // 'phone' when the narrower of the screen and the window is under 768px, else 'desktop';
  // '' when the browser says nothing. `win` is injectable for tests.
  function deviceKind(win) {
    try {
      var w = win || (typeof window !== 'undefined' ? window : null);
      if (!w) { return ''; }
      var sizes = [w.innerWidth, w.screen && w.screen.width].filter(function (n) { return typeof n === 'number' && n > 0; });
      if (!sizes.length) { return ''; }
      return Math.min.apply(Math, sizes) < 768 ? 'phone' : 'desktop';
    } catch (e) { return ''; }
  }

  // Count this visitor in their arm: POST experiment/expose once per visitor per
  // experiment. `apiRequest` is HD_DD_ApiClient.create(...).request. Resolves true
  // when the server recorded it; never rejects.
  function expose(apiRequest, a, env) {
    try {
      if (!a || !a.counted || a.exposed || typeof apiRequest !== 'function') { return Promise.resolve(false); }
      var payload = { experimentId: a.experimentId, visitorId: a.visitorId, arm: a.arm };
      var device = deviceKind(env && env.window);
      if (device) { payload.device = device; }
      var body = JSON.stringify(payload);
      return Promise.resolve(apiRequest('experiment/expose', { method: 'POST', body: body })).then(function (res) {
        if (res && res.ok) {
          // Any 2xx is final (a stale experiment id won't improve on retry); a 429 / 5xx retries next load.
          a.exposed = true;
          var storage = envStorage(env);
          var rec = read(storage);
          if (rec && rec.experimentId === a.experimentId && rec.visitorId === a.visitorId) {
            rec.exposed = true;
            write(storage, rec);
          }
        }
        return !!(res && res.ok && res.body && res.body.ok);
      }, function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  // The forced flow for this page: ?flow= first, then the mount's data-flow; '' if
  // absent or not a known flow. `flowCfg` (optional) widens the known list.
  function forcedFlow(search, mountEl, flowCfg) {
    try {
      var known = knownFlows(flowCfg);
      var m = /[?&]flow=([^&#]*)/.exec(String(search || ''));
      var q = m ? canonical(decodeURIComponent(m[1].replace(/\+/g, ' '))) : '';
      if (q && known[q]) { return q; }
      var d = (mountEl && typeof mountEl.getAttribute === 'function') ? canonical(mountEl.getAttribute('data-flow')) : '';
      return (d && known[d]) ? d : '';
    } catch (e) { return ''; }
  }

  // The `experiment` object for the enquiry POST body, or null when not counted.
  function enquiryRef(a) {
    return (a && a.counted && a.experimentId) ? { experimentId: a.experimentId, visitorId: a.visitorId, arm: a.arm } : null;
  }

  return { canonical: canonical, storedFlow: storedFlow, canRunSwipe: canRunSwipe, canRunDesigner3: canRunDesigner3, assign: assign, resolve: resolve, expose: expose, forcedFlow: forcedFlow, enquiryRef: enquiryRef, deviceKind: deviceKind, STORAGE_KEY: KEY };
}));
