// assets/js/designer4/d4-store.js
// Designer 4's session store: which doors this browser made, the email typed, and the calls to the
// plugin's d4/* REST routes. Tokens and the email live in sessionStorage (hd_dd_d4_session). The owner
// pair {token, k} from the emailed link is kept in the same tab's sessionStorage (hd_dd_d4_owner), so a
// reload still works once boot.js has taken k out of the address bar. It is never written to
// localStorage and never sent anywhere but the plugin's own d4/* routes.
//
//   var s = HD_DD_D4Store.create({ api, storage?, pageUrl? });   api(path, opts) -> Promise<{ok,status,body}>
//   s.auth()  { token, k } when an owner is set, else { tokens }
//   s.lead(body) / s.addDoor(body) / s.update(token, body) / s.remove(token) / s.details(body) / s.list()
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_D4Store = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'hd_dd_d4_session';
  var OWNER_KEY = 'hd_dd_d4_owner';
  var MAX_TOKENS = 50;

  function defaultStorage() {
    try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch (e) { return null; }
  }
  function copy(body) {
    var out = {};
    Object.keys(body || {}).forEach(function (k) { out[k] = body[k]; });
    return out;
  }

  function create(o) {
    var api = o.api;
    var storage = o.storage === undefined ? defaultStorage() : o.storage;
    var owner = null;
    var tokens = [];
    var email = '';

    try {
      var saved = JSON.parse(storage.getItem(KEY));
      if (saved && Array.isArray(saved.tokens)) {
        tokens = saved.tokens.filter(function (t) { return typeof t === 'string' && t; }).slice(-MAX_TOKENS);
      }
      if (saved && typeof saved.email === 'string') { email = saved.email; }
    } catch (e) { /* no storage, or nothing usable in it */ }
    try {
      var o2 = JSON.parse(storage.getItem(OWNER_KEY));
      if (o2 && typeof o2.token === 'string' && o2.token && typeof o2.k === 'string' && o2.k) { owner = { token: o2.token, k: o2.k }; }
    } catch (e) { /* no storage, or nothing usable in it */ }

    function persist() {
      try { storage.setItem(KEY, JSON.stringify({ tokens: tokens, email: email })); } catch (e) { /* ignore */ }
    }
    function addToken(t) {
      if (typeof t !== 'string' || !t) { return; }
      tokens = tokens.filter(function (x) { return x !== t; });
      tokens.push(t);
      if (tokens.length > MAX_TOKENS) { tokens = tokens.slice(-MAX_TOKENS); }
      persist();
    }
    function auth() { return owner ? { token: owner.token, k: owner.k } : { tokens: tokens.slice() }; }

    function post(path, body) {
      try { return Promise.resolve(api(path, { method: 'POST', body: JSON.stringify(body) })); }
      catch (e) { return Promise.reject(e); }
    }
    function withAuth(body) { var out = copy(body); out.auth = auth(); return out; }
    function withPage(body) {
      var out = copy(body);
      if (!out.pageUrl && o.pageUrl) { out.pageUrl = o.pageUrl; }
      return out;
    }
    function remember(res) {
      if (res && res.ok && res.body && res.body.ok && res.body.token) { addToken(res.body.token); }
      return res;
    }
    function door(token) { return 'd4/door/' + encodeURIComponent(token); }

    return {
      auth: auth,
      setOwner: function (token, k) {
        owner = (token && k) ? { token: String(token), k: String(k) } : null;
        try { if (owner) { storage.setItem(OWNER_KEY, JSON.stringify(owner)); } else { storage.removeItem(OWNER_KEY); } } catch (e) { /* ignore */ }
      },
      addToken: addToken,
      email: function () { return email; },
      setEmail: function (e) { email = String(e == null ? '' : e); persist(); },
      lead: function (body) { return post('d4/lead', withPage(body)).then(remember); },
      addDoor: function (body) { return post('d4/door', withAuth(withPage(body))).then(remember); },
      update: function (token, body) { return post(door(token), withAuth(body)); },
      remove: function (token) { return post(door(token) + '/remove', withAuth({})); },
      details: function (body) { return post('d4/details', withAuth(body)); },
      list: function () { return post('d4/designs', withAuth({})); }
    };
  }

  return { create: create, KEY: KEY, OWNER_KEY: OWNER_KEY };
}));
