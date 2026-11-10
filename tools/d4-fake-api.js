// tools/d4-fake-api.js — harness only (tools/d4-test.html), never loaded by the plugin.
// Answers the Designer 4 REST calls from memory, shaped like includes/ d4 routes reply, so every
// screen and state can be reached without WordPress:
//   d4/lead, d4/door, d4/door/{token}, d4/door/{token}/remove, d4/details, d4/designs, design/{token}
// Starts with three doors: tA waiting for a price with no doorway answered, tB "Estimate sent" with
// a doorway, tC on a closed deal. The designs reply says the postcode is missing and older: true.
//
//   HD_DD_D4FakeApi.create(URLSearchParams) -> api(path, opts) -> Promise<{ ok, status, body }>
//   ?fail=designs,remove,open,details makes those calls fail; ?slow=1 answers after 1.5s.
(function (W) {
  'use strict';

  var EMAIL = 'sam@example.com';
  var POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i;

  function now(daysAgo) {
    var d = new Date(Date.now() - (daysAgo || 0) * 864e5);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00';
  }
  function L(label, id) { var o = { label: label }; if (id != null) { o.id = id; } return o; }
  function design(style, colour, frameId, frameLabel) {
    return { 'Door Type': L('Single Door'), 'Door Design': L(style), 'Door Colour (External)': L(colour),
      'Handle': L('Lever/Lever'), 'Frame Design': L(frameLabel || 'No Sidelights', frameId || 1) };
  }
  // A stand-in picture (the frame drawing) as a path on this server: the card only takes https
  // or a path, and the real door snapshot is a data URL the server would have turned into a file.
  function picture(frameId) {
    var D = W.HD_DD_D4Doorway, rel = D && D.drawing ? D.drawing(frameId || 1) : '';
    return rel ? new URL('../' + rel, W.location.href).pathname : '';
  }
  function nameOf(d) {
    var s = d['Door Design'] ? d['Door Design'].label : 'Door', c = d['Door Colour (External)'];
    return c && c.label ? s + ' in ' + String(c.label).trim() : s;
  }

  function create(q) {
    var fails = String((q && q.get('fail')) || '').split(',');
    var delay = q && q.get('slow') ? 1500 : 250;
    var seq = 90;
    var st = {
      email: EMAIL, older: true,
      missing: { name: false, postcode: true, phone: false },
      doors: [
        { token: 'tA', status: 'pending', frame: null, savedAt: now(0), design: design('Abbott', 'Anthracite Grey') },
        { token: 'tB', status: 'estimate_sent', frame: { id: 5, label: 'Sidelight Right' }, savedAt: now(3), design: design('Alto', 'Chartwell Green', 5, 'Sidelight Right') },
        { token: 'tC', status: 'closed', frame: { id: 1, label: 'No Sidelights' }, savedAt: now(40), design: design('Aneto', 'Claystone') }
      ]
    };
    st.doors.forEach(function (d, i) { d.reference = 'HD-2026-0000' + (80 + i); });
    W.__api = [];

    function find(t) { return st.doors.filter(function (d) { return d.token === t; })[0] || null; }
    function reply(status, body) { return { ok: status >= 200 && status < 300, status: status, body: body }; }
    function failing(k) { return fails.indexOf(k) !== -1; }
    function listed(d) {
      var f = d.frame ? d.frame.id : 1;
      return { token: d.token, reference: d.reference, name: nameOf(d.design), image: picture(f), savedAt: d.savedAt,
        frame: d.frame, sideGlass: '', status: d.status };
    }
    function addDoor(body) {
      var t = 't' + (++seq), d = body.design || {};
      st.doors.unshift({ token: t, reference: 'HD-2026-0000' + seq, status: 'pending', frame: null, savedAt: now(0), design: d });
      if (body.email) { st.email = body.email; }
      return reply(200, { ok: true, token: t, reference: 'HD-2026-0000' + seq });
    }
    function update(d, body) {
      if (!d) { return reply(409, { ok: false, code: 'door_removed', message: 'That door has been removed.' }); }
      if (d.status === 'closed') { return reply(409, { ok: false, code: 'deal_closed', message: 'That door can no longer be changed.' }); }
      if (body.design) { d.design = body.design; }
      var f = d.design['Frame Design'];
      if (body.doorway === 'picked' && f) { d.frame = { id: Number(f.id), label: String(f.label || '').trim() }; }
      return reply(200, { ok: true });
    }
    function details(body) {
      if (failing('details')) { return reply(500, { ok: false, message: 'Something went wrong. Please try again.' }); }
      if (body.postcode && !POSTCODE.test(String(body.postcode).trim())) {
        return reply(422, { ok: false, code: 'bad_postcode', data: { fields: { postcode: 'Please enter a valid UK postcode.' } } });
      }
      if (body.name) { st.missing.name = false; }
      if (body.postcode) { st.missing.postcode = false; }
      if (body.telephone) { st.missing.phone = false; }
      return reply(200, { ok: true });
    }

    function answer(path, body) {
      var m;
      if (path === 'd4/lead' || path === 'd4/door') { return addDoor(body); }
      if (path === 'd4/designs') {
        if (failing('designs')) { return reply(500, { ok: false }); }
        return reply(200, { ok: true, email: st.email, owner: true, doors: st.doors.map(listed), missing: st.missing, older: st.older });
      }
      if (path === 'd4/details') { return details(body); }
      if ((m = /^d4\/door\/([^/]+)\/remove$/.exec(path))) {
        if (failing('remove')) { return reply(500, { ok: false }); }
        var t = decodeURIComponent(m[1]);
        st.doors = st.doors.filter(function (d) { return d.token !== t; });
        return reply(200, { ok: true });
      }
      if ((m = /^d4\/door\/([^/]+)$/.exec(path))) { return update(find(decodeURIComponent(m[1])), body); }
      if ((m = /^design\/([^/]+)$/.exec(path))) {
        var d = failing('open') ? null : find(decodeURIComponent(m[1]));
        return d ? reply(200, { ok: true, design: JSON.parse(JSON.stringify(d.design)), kind: 'enquiry' }) : reply(404, { ok: false });
      }
      return reply(404, { ok: false, message: 'Not in the fake API: ' + path });
    }

    return function api(path, opts) {
      var body = {};
      try { body = opts && opts.body ? JSON.parse(opts.body) : {}; } catch (e) { body = {}; }
      var res = answer(String(path), body);
      W.__api.push({ path: path, method: (opts && opts.method) || 'GET', body: body, status: res.status });
      console.log('[fake api]', (opts && opts.method) || 'GET', path, res.status);
      return new Promise(function (done) { setTimeout(function () { done(res); }, delay); });
    };
  }

  W.HD_DD_D4FakeApi = { create: create };
})(typeof window !== 'undefined' ? window : this);
