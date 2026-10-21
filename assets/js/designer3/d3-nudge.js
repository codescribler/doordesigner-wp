// assets/js/designer3/d3-nudge.js
// The gentle "save this?" prompt: fires once, on the visitor's 3rd change, once per visit
// (sessionStorage key hd_dd_d3_nudged). Storage is injectable; any storage error is ignored.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_D3Nudge = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var KEY = 'hd_dd_d3_nudged';

  function defaultStorage() { try { return root && root.sessionStorage; } catch (e) { return null; } }

  function create(opts) {
    opts = opts || {};
    var after = opts.after || 3;
    var storage = opts.storage !== undefined ? opts.storage : defaultStorage();
    var count = 0;

    function read() { try { return !!(storage && storage.getItem(KEY)); } catch (e) { return false; } }
    function write() { try { if (storage) { storage.setItem(KEY, '1'); } } catch (e) { /* ignore */ } }

    var done = read();
    return {
      change: function () {
        if (done) { return false; }
        count += 1;
        if (count < after) { return false; }
        done = true;
        write();
        return true;
      },
      dismiss: function () { done = true; write(); }
    };
  }

  return { create: create, KEY: KEY };
}));
