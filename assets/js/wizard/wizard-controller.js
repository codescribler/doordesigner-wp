(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Wizard = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function create(customerView, stepConfig) {
    var SC = stepConfig || (typeof HD_DD_StepConfig !== 'undefined' ? HD_DD_StepConfig : null);
    var design = {};
    var stepIndex = 0;
    var atReview = false;

    function typeLabel() { return design['Door Type'] && design['Door Type'].label; }
    function node() { return customerView.byType[typeLabel()] || null; }
    function steps() { var n = node(); return n ? SC.applicableSteps(n, design) : []; }

    function applyDefaults() {
      // optional steps with a defaultLabel get pre-filled so they never block.
      steps().forEach(function (s) {
        if (s.optional && s.defaultLabel && !design[s.heading]) {
          var c = s.choices.filter(function (x) { return x.label === s.defaultLabel; })[0];
          if (c) { design[s.heading] = { label: c.label, id: c.id != null ? c.id : null }; }
        }
      });
    }

    function pruneInvalid() {
      // drop any selection whose heading is no longer an applicable step, or whose
      // chosen label is no longer in that step's current choice list.
      var valid = {};
      steps().forEach(function (s) { valid[s.heading] = s.choices; });
      Object.keys(design).forEach(function (h) {
        if (h === 'Door Type') { return; }
        var list = valid[h];
        if (!list || !list.some(function (c) { return c.label === design[h].label; })) { delete design[h]; }
      });
    }

    function selectType(label) {
      var t = customerView.byType[label] ? label : null;
      if (!t) { return; }
      design = { 'Door Type': { label: label, id: typeIdOf(label) } };
      stepIndex = 0; atReview = false;
    }
    function typeIdOf(label) {
      var any = customerView.byType[label];
      var dt = any && any.fields['Door Type'];
      var hit = dt && dt.filter(function (c) { return c.label === label; })[0];
      return hit ? hit.id : null;
    }

    function select(heading, choice) {
      design[heading] = { label: choice.label, id: choice.id != null ? choice.id : null };
      pruneInvalid();
      applyDefaults();
    }

    function indexOfKey(key) { var ss = steps(); for (var i = 0; i < ss.length; i++) { if (ss[i].key === key) { return i; } } return -1; }
    function next() { var ss = steps(); if (stepIndex < ss.length - 1) { stepIndex++; } else { atReview = true; } }
    function back() { if (atReview) { atReview = false; return; } if (stepIndex > 0) { stepIndex--; } }
    function jumpTo(key) { var i = indexOfKey(key); if (i >= 0) { stepIndex = i; atReview = false; } }

    function state() {
      var ss = steps();
      if (stepIndex > ss.length - 1) { stepIndex = Math.max(0, ss.length - 1); }
      return { design: design, steps: ss, stepIndex: stepIndex, atReview: atReview,
        progress: { current: Math.min(stepIndex + 1, ss.length), total: ss.length } };
    }

    return { selectType: selectType, select: select, next: next, back: back, jumpTo: jumpTo, state: state };
  }

  return { create: create };
}));
