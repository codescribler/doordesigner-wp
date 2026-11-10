// assets/js/designer4/d4-ask.js
// Designer 4's ask: the visitor types their email beside the finished door. That email IS the price
// request and the lead. Same surface as HD_DD_D3Save (render/update/saved/token/setToken), same
// honeypot, email checks, busy lock, paint wait and one-update-at-a-time logic as d3-save.js.
//
//   HD_DD_D4Ask.create({ store, cfg, known, getDesign(), getCanvas(), whenPainted?(), experiment(),
//                        hasHandle(), onNoHandle(), onLead(body) })
//   known: reached from My designs, so the person is already known: no email input, store.addDoor.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../swipe/review-save.js'), require('../enquiry.js'));
  } else { root.HD_DD_D4Ask = factory(root.HD_DD_ReviewSave, root.HD_DD_Enquiry); }
}(typeof self !== 'undefined' ? self : this, function (RS, Enquiry) {
  'use strict';

  var PAINT_WAIT = 4000;   // never hold a save longer than this for a picture

  var COPY = {
    button: 'Email me this design and its price',
    knownButton: 'Add this door to my estimate',
    note: "We'll send a link to your design now. Your price follows by email within 1 working day.",
    label: 'Your email',
    placeholder: 'you@example.com',
    noHandle: 'Oops, your door needs a handle to be saved.',
    sentLine: '✓ Sent. Any changes you make here are saved too.',
    next: 'Next: your doorway',
    badEmail: RS.COPY.badEmail,
    failed: RS.COPY.failed,
    expired: RS.COPY.expired,
    preview: RS.COPY.preview
  };

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (txt != null) { n.textContent = txt; }
    return n;
  }

  function create(o) {
    var cfg = o.cfg || {};
    var store = o.store;
    var token = null;
    var savedKey = null;
    var busy = false;
    var pending = null;
    var email = '';

    function pageUrl() { return o.pageUrl || (window.location.origin + window.location.pathname); }
    function snapshot() {
      try { return Enquiry.snapshot(o.getCanvas ? o.getCanvas() : null); } catch (e) { return null; }
    }
    function message(res) {
      var api = typeof window !== 'undefined' && window.HD_DD_ApiClient;
      if (res && api && api.isNonceFailure && api.isNonceFailure(res)) { return COPY.expired; }
      var f = res && res.body && res.body.data && res.body.data.fields;
      return (f && (f.handle || f.email)) || (res && res.body && res.body.message) || COPY.failed;
    }

    function doneState(container) {
      var wrap = el('div', 'hd-d4-ask hd-d4-ask--done');
      wrap.appendChild(el('div', 'hd-d4-ask__done', COPY.sentLine));
      var btn = el('button', 'hd-d4-ask__btn', COPY.next);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        update();
        if (o.onLead) { o.onLead({ ok: true, token: token, again: true }); }
      });
      wrap.appendChild(btn);
      container.appendChild(wrap);
    }

    function emailField(row, hp) {
      var lab = el('label', 'hd-d4-ask__label');
      lab.appendChild(el('span', 'hd-d3-sr', COPY.label));
      var input = document.createElement('input');
      input.className = 'hd-d4-ask__input';
      input.type = 'email'; input.name = 'email'; input.value = email;
      input.setAttribute('placeholder', COPY.placeholder);
      input.setAttribute('autocomplete', 'email');
      input.addEventListener('input', function () { email = input.value; });
      lab.appendChild(input);
      row.appendChild(lab);
      return input;
    }

    function render(container) {
      container.innerHTML = '';
      if (token) { doneState(container); return; }
      var f = document.createElement('form');
      f.className = 'hd-d4-ask';
      f.setAttribute('novalidate', 'novalidate');
      var row = el('div', 'hd-d4-ask__row');
      var hp = document.createElement('input'); // honeypot: bots fill it, people never see it
      hp.type = 'text'; hp.name = 'hd_hp'; hp.className = 'hd-dd__hp'; hp.tabIndex = -1;
      hp.setAttribute('autocomplete', 'off');
      hp.setAttribute('aria-hidden', 'true');
      var input = o.known ? null : emailField(row);
      var btn = el('button', 'hd-d4-ask__btn', o.known ? COPY.knownButton : COPY.button);
      btn.type = 'submit';
      row.appendChild(btn);
      f.appendChild(row); f.appendChild(hp);
      if (!o.known) { f.appendChild(el('div', 'hd-d4-ask__note', COPY.note)); }
      var error = el('div', 'hd-d4-ask__error');
      var status = el('div', 'hd-d4-ask__status');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      f.appendChild(error); f.appendChild(status);

      f.addEventListener('submit', function (e) {
        if (e && e.preventDefault) { e.preventDefault(); }
        if (busy) { return; }
        error.textContent = ''; status.textContent = '';
        if (input) {
          email = RS.cleanEmail(input.value);
          if (!RS.validEmail(email)) { error.textContent = COPY.badEmail; return; }
        }
        if (!o.hasHandle()) {
          error.textContent = COPY.noHandle;
          if (o.onNoHandle) { o.onNoHandle(); }
          return;
        }
        if (!cfg.restUrl) {
          status.textContent = COPY.preview;
          if (o.onLead) { o.onLead({ ok: true, preview: true, token: null }); }
          return;
        }
        var body = { design: Enquiry.cleanDesign(o.getDesign()), pageUrl: pageUrl() };
        if (input) { body.email = email; body.hd_hp = hp.value || ''; }
        var exp = o.experiment ? o.experiment() : null;
        if (exp) { body.experiment = exp; }
        var shot = snapshot();
        if (shot) { body.image = shot; }
        var key = RS.designKey(o.getDesign());
        busy = true; btn.disabled = true; status.textContent = '…';
        function done(res) {
          busy = false; status.textContent = '';
          var ok = !!(res && res.ok && res.body && res.body.ok && res.body.token);
          if (!ok) { btn.disabled = false; error.textContent = message(res); return; }
          token = res.body.token;
          savedKey = key;
          if (input) { store.setEmail(email); }
          try { if (o.onLead) { o.onLead(res.body); } } catch (err) { /* the lead itself worked */ }
        }
        var call;
        try { call = o.known ? store.addDoor(body) : store.lead(body); } catch (err) { call = Promise.reject(err); }
        Promise.resolve(call).then(done, function () { done(null); });
      });
      container.appendChild(f);
    }

    // The latest paint, waited for after the current task, and never for longer than PAINT_WAIT.
    function painted() {
      if (!o.whenPainted) { return Promise.resolve(); }
      return new Promise(function (done) {
        var t = setTimeout(done, PAINT_WAIT);
        function fin() { clearTimeout(t); done(); }
        Promise.resolve().then(function () { return o.whenPainted(); }).then(fin, fin);
      });
    }

    // Bring the stored door in line with the design on screen. Resolves true when it matches.
    // One update at a time. A 409 (closed or removed) resolves false and clears nothing.
    function update() {
      if (!token || !cfg.restUrl) { return Promise.resolve(false); }
      return painted().then(send);
    }
    function send() {
      if (!token) { return false; }
      if (pending) { return pending.then(function (ok) { return ok ? update() : false; }); }
      var key = RS.designKey(o.getDesign());
      if (key === savedKey) { return Promise.resolve(true); }
      var body = { design: Enquiry.cleanDesign(o.getDesign()) };
      var shot = snapshot();
      if (shot) { body.image = shot; }
      var p = Promise.resolve(store.update(token, body)).then(function (res) {
        pending = null;
        if (res && res.ok) { savedKey = key; return true; }
        return false;
      }, function () { pending = null; return false; });
      pending = p;
      return p;
    }

    return {
      render: render,
      saved: function () { return !!token; },
      token: function () { return token; },
      setToken: function (t) { token = t || null; savedKey = token ? RS.designKey(o.getDesign()) : null; },
      update: update
    };
  }

  return { create: create, COPY: COPY };
}));
