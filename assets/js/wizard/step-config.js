(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_StepConfig = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // key: internal; label: plain-English; hint: one-line lay explanation shown under the
  // title (door terms aren't obvious to non-experts); heading: real Endurance heading (or
  // token); tileType: how the renderer draws choices; visibleWhen/choicesFor decide inclusion.
  var STEPS = [
    { key: 'type', label: 'What kind of door?', name: 'Door type', heading: 'Door Type', tileType: 'icon' },
    { key: 'frame', label: 'Just the door, or side panels too?', name: 'Side panels', heading: 'Frame Design', tileType: 'icon', groupFirst: true,
      hint: 'Add glazed side panels beside the door or a window above it.',
      visibleWhen: function (n) { return !!n.hasFrameShape; } },
    { key: 'style', label: 'Pick your style', name: 'Style', heading: 'Door Design', tileType: 'door', categoryFirst: true,
      hint: 'The panel shape and glass layout of the door itself.' },
    { key: 'hinge', label: 'Hinge side', name: 'Hinge', heading: '__hinge__', tileType: 'choice',
      hint: 'Which side the hinges are on, viewed from outside — the handle sits on the opposite side.' },
    { key: 'extColour', label: 'Choose your colour', name: 'Colour', heading: 'Door Colour (External)', tileType: 'swatch',
      hint: 'The colour of the outside of your door.' },
    { key: 'intColour', label: 'Inside colour', name: 'Inside colour', heading: 'Door Colour (Internal)', tileType: 'swatch',
      hint: 'The colour on the inside face — many people keep this white.',
      optional: true, defaultLabel: 'White', visibleWhen: function (n) { return !!n.hasInternalColour; } },
    { key: 'sidelightType', label: 'Side panels: glazed or solid?', name: 'Side panels', heading: 'Sidelight Type', tileType: 'choice', source: 'sidelightType',
      hint: 'Glazed lets light through the side panels; solid is a closed panel.',
      visibleWhen: function (n, d) { return sidelit(n, d); } },
    { key: 'sidelightGlass', label: 'Side panel glass', name: 'Side panel glass', heading: 'Sidelight Glass', tileType: 'glass', source: 'sidelightGlass',
      hint: 'The glass design used in the side panels.',
      visibleWhen: function (n, d) { return sidelit(n, d) && sidelightGlazed(d); } },
    { key: 'glazing', label: 'Choose your glass', name: 'Glass', heading: 'Door Glass', tileType: 'glass', source: 'glazing',
      hint: 'The glass design in the door panels.' },
    { key: 'hardware', label: 'Hardware finish', name: 'Hardware', heading: 'Hardware Type', tileType: 'swatch',
      hint: 'The colour and finish of your handle, letterplate and metal fittings.' },
    { key: 'handle', label: 'Choose your handle', name: 'Handle', heading: 'Handle', tileType: 'handle',
      hint: 'The style of door handle.' },
    { key: 'letterplate', label: 'Add a letterplate?', name: 'Letterplate', heading: 'Letterplate', tileType: 'choice', optional: true, defaultLabel: 'No Letterplate',
      hint: 'A letterbox in the door for post. Optional.' },
    { key: 'letterplatePosition', label: 'Where should the letterplate sit?', name: 'Letterplate position', heading: 'Letterplate Position', tileType: 'choice', source: 'letterplatePosition', optional: true, defaultLabel: 'Middle',
      hint: 'Whether the letterbox sits in the middle or near the bottom.',
      visibleWhen: function (n, d) { return letterplatePosAvailable(n, d); } },
    { key: 'knocker', label: 'Add a knocker?', name: 'Knocker', heading: 'Knocker', tileType: 'choice', source: 'knocker', optional: true, defaultLabel: 'No Knocker',
      hint: 'A door knocker. Optional.',
      visibleWhen: function (n) { return !!n.hasKnocker; } }
  ];

  function sidelit(n, d) {
    if (!n.hasFrameShape) { return false; }
    var shape = (d['Frame Design'] && d['Frame Design'].label) || '';
    return shape !== 'No Sidelights' && /sidelight|half flag/i.test(shape);
  }

  function sidelightGlazed(d) {
    return !!(d['Sidelight Type'] && d['Sidelight Type'].label === 'Glazed');
  }

  // The Middle/Bottom letterplate-position choice only exists on moulds whose default (Middle)
  // spot is up in the central rail — the App marks those styles (from the render model) as
  // n.letterplatePosStyles. Only offer it once a real letterplate is chosen.
  function letterplatePosAvailable(n, d) {
    var style = d['Door Design'] && d['Door Design'].label;
    var lp = d['Letterplate'] && d['Letterplate'].label;
    if (!style || !lp || /^no /i.test(lp)) { return false; }
    return !!(n.letterplatePosStyles && n.letterplatePosStyles[style]);
  }

  // The default letterplate position for the current style. Glazed styles whose Middle plate
  // would cover the glass are seeded 'bottom' by the App (from the render model) so the plate
  // defaults to the clear bottom rail; everything else defaults to Middle.
  function letterplatePosDefault(n, d) {
    var style = d['Door Design'] && d['Door Design'].label;
    return (style && n.letterplatePosStyles && n.letterplatePosStyles[style] === 'bottom') ? 'Bottom' : 'Middle';
  }

  // High-level grouping for the Frame Design step's progressive disclosure: a layperson
  // first picks one of these three, then sees only the matching variants.
  function frameGroup(label) {
    if (/^no sidelights$/i.test(label)) { return 'Just the door'; } // must precede the /sidelight/ test
    if (/toplight/i.test(label)) { return 'With a window above'; }
    if (/sidelight|half flag/i.test(label)) { return 'With side panels'; }
    return 'Just the door';
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
    } else if (step.source === 'letterplatePosition') {
      choices = [{ label: 'Middle', id: null }, { label: 'Bottom', id: null }];
    } else { choices = n.fields[heading]; }
    return { heading: heading, choices: choices };
  }

  function applicableSteps(n, d) {
    var out = [];
    STEPS.forEach(function (step) {
      if (step.visibleWhen && !step.visibleWhen(n, d)) { return; }
      var r = resolve(step, n, d);
      if (!r.choices || !r.choices.length) { return; }
      var defaultLabel = step.key === 'letterplatePosition' ? letterplatePosDefault(n, d) : step.defaultLabel;
      out.push({ key: step.key, label: step.label, hint: step.hint || '', name: step.name || step.label, heading: r.heading, tileType: step.tileType,
        optional: !!step.optional, defaultLabel: defaultLabel, categoryFirst: !!step.categoryFirst, groupFirst: !!step.groupFirst, choices: r.choices });
    });
    return out;
  }

  return { steps: STEPS, applicableSteps: applicableSteps, sidelit: sidelit, frameGroup: frameGroup };
}));
