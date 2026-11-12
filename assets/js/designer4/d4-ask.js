// assets/js/designer4/d4-ask.js
// Designer 4's ask: the visitor types their email beside the finished door. That email IS the price
// request and the lead. Same surface as HD_DD_D3Save (render/update/saved/token/setToken), same
// honeypot, email checks, busy lock, paint wait and one-update-at-a-time logic as d3-save.js.
//
//   HD_DD_D4Ask.create({ store, cfg, known, getDesign(), getCanvas(), whenPainted?(), experiment(),
//                        hasHandle(), onNoHandle(), onLead(body), nextStep?() })
//   known: reached from My designs, so the person is already known: no email input, store.addDoor.
//   After the lead the form gives way to one slim line (hd-d4-saved): what autosave is doing
//   (saved / saving / failed / held for no handle) and a link on, "Next: your doorway" when
//   nextStep() is 'doorway', else "See my designs" (it calls onLead({again: true})).
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
    saved: '✓ Saved. Changes save automatically.',
    saving: 'Saving…',
    saveFailed: 'Couldn\'t save just now. We\'ll try again when you change something.',
    next: 'Next: your doorway',
    designs: 'See my designs',
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
    var saveState = 'saved';   // after the lead: saved | saving | failed | held (no handle)
    var line = null;           // the slim line's status text, once drawn
    var STATE_TEXT = { saved: COPY.saved, saving: COPY.saving, failed: COPY.saveFailed, held: COPY.noHandle };

    function onPage(n) {
      var b = document.body;
      return !b || !b.contains || b.contains(n);
    }
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

    // The slim line's status: only its text and class change, so focus stays where it is.
    function show(s) {
      saveState = s;
      if (!line) { return; }
      line.textContent = STATE_TEXT[s];
      line.className = 'hd-d4-saved__text' + (s === 'held' || s === 'failed' ? ' hd-d4-saved__text--error' : '');
    }

    function savedLine(container) {
      var wrap = el('div', 'hd-d4-saved');
      line = el('span', 'hd-d4-saved__text');
      line.setAttribute('role', 'status');
      line.setAttribute('aria-live', 'polite');
      wrap.appendChild(line);
      var to = o.nextStep ? o.nextStep() : 'doorway';
      var btn = el('button', 'hd-d3-textlink hd-d4-saved__next', to === 'doorway' ? COPY.next : COPY.designs);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        if (!o.hasHandle()) {   // the same check as the email button: no handle, nothing sent
          show('held');
          if (o.onNoHandle) { o.onNoHandle(); }
          return;
        }
        update();
        if (o.onLead) { o.onLead({ ok: true, token: token, again: true }); }
      });
      wrap.appendChild(btn);
      show(!o.hasHandle() ? 'held' : (saveState === 'held' ? 'saved' : saveState));
      container.appendChild(wrap);
      return btn;
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

    // Phones: the box starts as just the button so the door and its options keep the screen. The
    // first tap opens the email field; the next one sends. Open from the start once an email is typed.
    function phone() {
      try { return !!(window.matchMedia && window.matchMedia('(max-width: 719px)').matches); } catch (e) { return false; }
    }

    function render(container) {
      container.innerHTML = '';
      line = null;
      if (token) { return savedLine(container); }
      var f = document.createElement('form');
      f.className = 'hd-d4-ask';
      f.setAttribute('novalidate', 'novalidate');
      var open = o.known || !!email;
      f.setAttribute('data-open', open ? 'true' : 'false');
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
      error.setAttribute('aria-live', 'polite');   // announced when a message is set (no handle, bad email)
      var status = el('div', 'hd-d4-ask__status');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      f.appendChild(error); f.appendChild(status);

      f.addEventListener('submit', function (e) {
        if (e && e.preventDefault) { e.preventDefault(); }
        if (busy) { return; }
        error.textContent = ''; status.textContent = '';
        // The handle check comes first: with no handle nothing is sent, whatever the email box holds.
        if (!o.hasHandle()) {
          error.textContent = COPY.noHandle;
          if (o.onNoHandle) { o.onNoHandle(); }
          return;
        }
        if (input && !open && phone()) {
          open = true;
          f.setAttribute('data-open', 'true');
          if (input.focus) { input.focus(); }
          return;
        }
        if (input) {
          open = true;
          f.setAttribute('data-open', 'true');
          email = RS.cleanEmail(input.value);
          if (!RS.validEmail(email)) { error.textContent = COPY.badEmail; return; }
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
        var work = o.effort ? o.effort() : null;
        if (work) { body.effort = work; }
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
          saveState = 'saved';
          if (input) { store.setEmail(email); }
          var a = document.activeElement, hadFocus = !!(a && f.contains && f.contains(a));
          try { if (o.onLead) { o.onLead(res.body); } } catch (err) { /* the lead itself worked */ }
          // Still on this screen (the app did not move on): the form turns into the slim line here.
          if (f.parentNode === container && onPage(container)) {
            var next = render(container);
            if (hadFocus && next && next.focus) { next.focus(); }
          }
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
    // One update at a time. A 409 (closed or removed) resolves false and clears nothing. With no
    // handle the save is held (the server refuses such a door); the next change after a handle
    // pick sends it.
    function update() {
      if (!token || !cfg.restUrl) { return Promise.resolve(false); }
      if (!o.hasHandle()) { show('held'); return Promise.resolve(false); }
      return painted().then(send);
    }
    function send() {
      if (!token) { return false; }
      if (pending) { return pending.then(function (ok) { return ok ? update() : false; }); }
      var key = RS.designKey(o.getDesign());
      if (key === savedKey) { show('saved'); return Promise.resolve(true); }
      var body = { design: Enquiry.cleanDesign(o.getDesign()) };
      var work = o.effort ? o.effort() : null;
      if (work) { body.effort = work; }
      var shot = snapshot();
      if (shot) { body.image = shot; }
      show('saving');
      var p = Promise.resolve(store.update(token, body)).then(function (res) {
        pending = null;
        if (res && res.ok) { savedKey = key; show('saved'); return true; }
        show('failed');
        return false;
      }, function () { pending = null; show('failed'); return false; });
      pending = p;
      return p;
    }

    return {
      render: render,
      saved: function () { return !!token; },
      token: function () { return token; },
      setToken: function (t) { token = t || null; savedKey = token ? RS.designKey(o.getDesign()) : null; saveState = 'saved'; },
      update: update
    };
  }

  return { create: create, COPY: COPY };
}));
