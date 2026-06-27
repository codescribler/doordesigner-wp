(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_StepConfig = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // key: internal; label: plain-English; heading: real Endurance heading (or token);
  // tileType: how the renderer draws choices; visibleWhen/choicesFor decide inclusion.
  var STEPS = [
    { key: 'type', label: 'What kind of door?', name: 'Door type', heading: 'Door Type', tileType: 'icon' },
    { key: 'frame', label: 'Just the door, or side panels too?', name: 'Side panels', heading: 'Frame Design', tileType: 'icon',
      visibleWhen: function (n) { return !!n.hasFrameShape; } },
    { key: 'style', label: 'Pick your style', name: 'Style', heading: 'Door Design', tileType: 'door', categoryFirst: true },
    { key: 'extColour', label: 'Choose your colour', name: 'Colour', heading: 'Door Colour (External)', tileType: 'swatch' },
    { key: 'intColour', label: 'Inside colour', name: 'Inside colour', heading: 'Door Colour (Internal)', tileType: 'swatch',
      optional: true, defaultLabel: 'White', visibleWhen: function (n) { return !!n.hasInternalColour; } },
    { key: 'sidelightType', label: 'Side panels: glazed or solid?', name: 'Side panels', heading: 'Sidelight Type', tileType: 'choice', source: 'sidelightType',
      visibleWhen: function (n, d) { return sidelit(n, d); } },
    { key: 'sidelightGlass', label: 'Side panel glass', name: 'Side panel glass', heading: 'Sidelight Glass', tileType: 'glass', source: 'sidelightGlass',
      visibleWhen: function (n, d) { return sidelit(n, d) && sidelightGlazed(d); } },
    { key: 'glazing', label: 'Choose your glass', name: 'Glass', heading: 'Door Glass', tileType: 'glass', source: 'glazing' },
    { key: 'hardware', label: 'Hardware finish', name: 'Hardware', heading: 'Hardware Type', tileType: 'swatch' },
    { key: 'handle', label: 'Choose your handle', name: 'Handle', heading: 'Handle', tileType: 'handle' },
    { key: 'letterplate', label: 'Add a letterplate?', name: 'Letterplate', heading: 'Letterplate', tileType: 'choice', optional: true, defaultLabel: 'No Letterplate' },
    { key: 'knocker', label: 'Add a knocker?', name: 'Knocker', heading: 'Knocker', tileType: 'choice', source: 'knocker', optional: true, defaultLabel: 'No Knocker',
      visibleWhen: function (n) { return !!n.hasKnocker; } },
    { key: 'hinge', label: 'Hinge side', name: 'Hinge', heading: '__hinge__', tileType: 'choice' }
  ];

  function sidelit(n, d) {
    if (!n.hasFrameShape) { return false; }
    var shape = (d['Frame Design'] && d['Frame Design'].label) || '';
    return shape !== 'No Sidelights' && /sidelight|half flag/i.test(shape);
  }

  function sidelightGlazed(d) {
    return !!(d['Sidelight Type'] && d['Sidelight Type'].label === 'Glazed');
  }

  // Resolve the real heading + choice list for a step given the active type+design.
  function resolve(step, n, d) {
    var heading = step.heading;
    var choices = null;
    if (heading === '__hinge__') { heading = n.hingeSideField || 'Door Hinged On'; choices = n.fields[heading]; }
    else if (step.source === 'glazing') {
      var style = d['Door Design'] && d['Door Design'].label;
      choices = (style && n.glazingByStyle && n.glazingByStyle[style]) ? n.glazingByStyle[style] : n.fields['Door Glass'];
    } else if (step.source === 'knocker') {
      var ks = d['Door Design'] && d['Door Design'].label;
      choices = (ks && n.knockerByStyle && n.knockerByStyle[ks]) ? n.knockerByStyle[ks] : n.fields['Knocker'];
    } else if (step.source === 'sidelightType') {
      choices = n.sidelights ? n.sidelights.sidelightType : null;
    } else if (step.source === 'sidelightGlass') {
      choices = n.sidelights ? n.sidelights.sidelightGlass : null;
    } else { choices = n.fields[heading]; }
    return { heading: heading, choices: choices };
  }

  function applicableSteps(n, d) {
    var out = [];
    STEPS.forEach(function (step) {
      if (step.visibleWhen && !step.visibleWhen(n, d)) { return; }
      var r = resolve(step, n, d);
      if (!r.choices || !r.choices.length) { return; }
      out.push({ key: step.key, label: step.label, name: step.name || step.label, heading: r.heading, tileType: step.tileType,
        optional: !!step.optional, defaultLabel: step.defaultLabel, categoryFirst: !!step.categoryFirst, choices: r.choices });
    });
    return out;
  }

  return { steps: STEPS, applicableSteps: applicableSteps, sidelit: sidelit };
}));
