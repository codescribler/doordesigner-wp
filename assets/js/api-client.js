// assets/js/api-client.js
// REST client for the designer: JSON headers, the WordPress nonce, and the stale-nonce
// self-heal. A tab left open past the nonce lifetime (about a day — common on phones)
// used to fail with "Cookie check failed"; now the client fetches a fresh nonce once
// and retries the request once. The retry carries X-HD-DD-Attempt: 2 so the server
// can tell a final failure from the first, self-healed one.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_ApiClient = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // WordPress core rejects a stale nonce before our code runs (rest_cookie_invalid_nonce);
  // the plugin's own gate rejects a missing one (hd_dd_bad_nonce).
  var NONCE_CODES = { rest_cookie_invalid_nonce: true, hd_dd_bad_nonce: true };

  function isNonceFailure(res) {
    return !!(res && res.status === 403 && res.body && NONCE_CODES[res.body.code]);
  }

  // Resolve fetch's Response into { ok, status, body }. A non-JSON body (host error page,
  // CDN challenge) becomes body: null rather than a rejection, so callers always get a status.
  function toResult(r) {
    return r.json().then(
      function (body) { return { ok: r.ok, status: r.status, body: body }; },
      function () { return { ok: r.ok, status: r.status, body: null }; }
    );
  }

  function create(cfg) {
    cfg = cfg || {};
    var restUrl = cfg.restUrl || '';
    var nonce = cfg.nonce || '';
    var fetchImpl = cfg.fetch || function () { return window.fetch.apply(window, arguments); };

    function send(path, opts, attempt) {
      opts = opts || {};
      var o = {};
      Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
      var headers = { 'Content-Type': 'application/json' };
      Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
      if (nonce) { headers['X-WP-Nonce'] = nonce; }
      headers['X-HD-DD-Attempt'] = String(attempt);
      o.headers = headers;
      o.credentials = 'same-origin';
      return fetchImpl(restUrl + path, o).then(toResult);
    }

    // Deliberately no nonce header: WordPress rejects any request carrying a stale one
    // before routing, whereas a nonce-less GET is simply treated as anonymous.
    function refreshNonce() {
      return fetchImpl(restUrl + 'nonce', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
        .then(toResult)
        .then(function (res) {
          if (res.body && typeof res.body.nonce === 'string' && res.body.nonce) { nonce = res.body.nonce; return true; }
          return false;
        }, function () { return false; });
    }

    function request(path, opts) {
      return send(path, opts, 1).then(function (res) {
        if (!isNonceFailure(res)) { return res; }
        return refreshNonce().then(function (ok) { return ok ? send(path, opts, 2) : res; });
      });
    }

    return { request: request, nonce: function () { return nonce; } };
  }

  return { create: create, isNonceFailure: isNonceFailure };
}));
