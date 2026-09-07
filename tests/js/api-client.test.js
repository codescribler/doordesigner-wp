// Plain-Node tests for HD_DD_ApiClient — no framework: `node tests/js/api-client.test.js`.
// The client owns the REST plumbing the wizard submits through: JSON headers, the
// WordPress nonce, and the stale-nonce self-heal (fetch a fresh nonce once, retry once).
var assert = require('assert');
var Client = require('../../assets/js/api-client.js');

// A scripted fetch: each call pops the next entry. {status, body} → a Response-like
// object; an Error → a rejected promise (network failure); body === undefined → json() rejects.
function fakeFetch(script) {
  var fn = function (url, opts) {
    fn.calls.push({ url: url, opts: opts || {} });
    var next = script.shift();
    if (!next) { throw new Error('unexpected fetch: ' + url); }
    if (next instanceof Error) { return Promise.reject(next); }
    return Promise.resolve({
      ok: next.status < 400,
      status: next.status,
      json: function () { return next.body === undefined ? Promise.reject(new Error('not json')) : Promise.resolve(next.body); }
    });
  };
  fn.calls = [];
  return fn;
}

var REST = 'https://example.test/wp-json/hd-door-designer/v1/';
var STALE = { status: 403, body: { code: 'rest_cookie_invalid_nonce', message: 'Cookie check failed', data: { status: 403 } } };
var OK = { status: 201, body: { ok: true, reference: 'HD-2026-000040', token: 'abc' } };

function run() {
  return Promise.resolve()

  // 1) Plain request: JSON content type, nonce header, attempt 1, same-origin cookies;
  //    result shape is { ok, status, body } exactly as the app expects.
  .then(function () {
    var f = fakeFetch([OK]);
    var c = Client.create({ restUrl: REST, nonce: 'n1', fetch: f });
    return c.request('enquiry', { method: 'POST', body: '{"a":1}' }).then(function (res) {
      assert.deepStrictEqual(res, { ok: true, status: 201, body: OK.body });
      assert.strictEqual(f.calls.length, 1);
      assert.strictEqual(f.calls[0].url, REST + 'enquiry');
      assert.strictEqual(f.calls[0].opts.method, 'POST');
      assert.strictEqual(f.calls[0].opts.body, '{"a":1}');
      assert.strictEqual(f.calls[0].opts.credentials, 'same-origin');
      assert.strictEqual(f.calls[0].opts.headers['Content-Type'], 'application/json');
      assert.strictEqual(f.calls[0].opts.headers['X-WP-Nonce'], 'n1');
      assert.strictEqual(f.calls[0].opts.headers['X-HD-DD-Attempt'], '1');
    });
  })

  // 2) Stale nonce: fetch a fresh one (GET …/nonce, WITHOUT the stale nonce header,
  //    uncached), retry the original request once with it as attempt 2, and hand back
  //    the retry's result. The fresh nonce is kept for later calls.
  .then(function () {
    var f = fakeFetch([STALE, { status: 200, body: { nonce: 'n2' } }, OK]);
    var c = Client.create({ restUrl: REST, nonce: 'n1', fetch: f });
    return c.request('enquiry', { method: 'POST', body: '{}' }).then(function (res) {
      assert.deepStrictEqual(res, { ok: true, status: 201, body: OK.body });
      assert.strictEqual(f.calls.length, 3);
      var refresh = f.calls[1];
      assert.strictEqual(refresh.url, REST + 'nonce');
      assert.ok(!refresh.opts.method || refresh.opts.method === 'GET');
      assert.strictEqual(refresh.opts.credentials, 'same-origin');
      assert.strictEqual(refresh.opts.cache, 'no-store');
      assert.ok(!refresh.opts.headers || !refresh.opts.headers['X-WP-Nonce'], 'refresh must not carry the stale nonce (core would reject it)');
      var retry = f.calls[2];
      assert.strictEqual(retry.url, REST + 'enquiry');
      assert.strictEqual(retry.opts.method, 'POST');
      assert.strictEqual(retry.opts.body, '{}');
      assert.strictEqual(retry.opts.headers['X-WP-Nonce'], 'n2');
      assert.strictEqual(retry.opts.headers['X-HD-DD-Attempt'], '2');
      assert.strictEqual(c.nonce(), 'n2');
    });
  })

  // 3) Retry at most once: a second nonce failure comes back as-is (no loop) and
  //    isNonceFailure() identifies it so the UI can say "please reload".
  .then(function () {
    var f = fakeFetch([STALE, { status: 200, body: { nonce: 'n2' } }, STALE]);
    var c = Client.create({ restUrl: REST, nonce: 'n1', fetch: f });
    return c.request('enquiry', { method: 'POST', body: '{}' }).then(function (res) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(f.calls.length, 3);
      assert.strictEqual(Client.isNonceFailure(res), true);
    });
  })

  // 4) Refresh reply without a nonce → original failure returned, nothing retried.
  .then(function () {
    var f = fakeFetch([STALE, { status: 200, body: {} }]);
    var c = Client.create({ restUrl: REST, nonce: 'n1', fetch: f });
    return c.request('enquiry', { method: 'POST', body: '{}' }).then(function (res) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'rest_cookie_invalid_nonce');
      assert.strictEqual(f.calls.length, 2);
      assert.strictEqual(c.nonce(), 'n1');
    });
  })

  // 5) Refresh network error → original failure returned; request() never rejects for it.
  .then(function () {
    var f = fakeFetch([STALE, new Error('offline')]);
    var c = Client.create({ restUrl: REST, nonce: 'n1', fetch: f });
    return c.request('enquiry', { method: 'POST', body: '{}' }).then(function (res) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(f.calls.length, 2);
    });
  })

  // 6) The plugin's own missing/bad-nonce code triggers the same self-heal.
  .then(function () {
    var f = fakeFetch([{ status: 403, body: { code: 'hd_dd_bad_nonce', message: 'Security check failed.' } }, { status: 200, body: { nonce: 'n2' } }, OK]);
    var c = Client.create({ restUrl: REST, nonce: 'n1', fetch: f });
    return c.request('enquiry', { method: 'POST', body: '{}' }).then(function (res) {
      assert.strictEqual(res.status, 201);
      assert.strictEqual(f.calls.length, 3);
    });
  })

  // 7) Other errors are not retried and are not nonce failures.
  .then(function () {
    var v = { status: 422, body: { code: 'hd_dd_validation', message: 'Please check the highlighted fields.', data: { status: 422, fields: { postcode: 'x' } } } };
    var f = fakeFetch([v]);
    var c = Client.create({ restUrl: REST, nonce: 'n1', fetch: f });
    return c.request('enquiry', { method: 'POST', body: '{}' }).then(function (res) {
      assert.deepStrictEqual(res, { ok: false, status: 422, body: v.body });
      assert.strictEqual(f.calls.length, 1);
      assert.strictEqual(Client.isNonceFailure(res), false);
    });
  })

  // 8) A non-JSON reply (host error page, CDN challenge) resolves with body null
  //    instead of rejecting, so the UI can still show its generic error.
  .then(function () {
    var f = fakeFetch([{ status: 502 }]);
    var c = Client.create({ restUrl: REST, nonce: 'n1', fetch: f });
    return c.request('enquiry', { method: 'POST', body: '{}' }).then(function (res) {
      assert.deepStrictEqual(res, { ok: false, status: 502, body: null });
    });
  })

  // 9) GET works the same way; isNonceFailure tolerates junk input.
  .then(function () {
    var f = fakeFetch([{ status: 200, body: { design: {} } }]);
    var c = Client.create({ restUrl: REST, nonce: 'n1', fetch: f });
    return c.request('design/abc', { method: 'GET' }).then(function (res) {
      assert.strictEqual(res.ok, true);
      assert.strictEqual(f.calls[0].opts.headers['X-WP-Nonce'], 'n1');
      assert.strictEqual(Client.isNonceFailure(null), false);
      assert.strictEqual(Client.isNonceFailure({ status: 403, body: null }), false);
    });
  });
}

run().then(
  function () { console.log('api-client.test.js: all assertions passed'); },
  function (e) { console.error((e && e.stack) || e); process.exit(1); }
);
