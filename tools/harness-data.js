// tools/harness-data.js — shared by the QA harnesses (preview-test.html, swipe-test.html).
// Loads the plugin's data files and projects the full catalogue to the customer view exactly
// like class-hd-catalogue.php → customer_view(). Exposes window.HD_DD_HarnessData.load().
(function () {
  // Mirror of class-hd-catalogue.php → customer_view(): project the full catalogue
  // down to the compact, customer-facing shape the wizard consumes.
  var CUSTOMER_HEADINGS = [
    'Door Type', 'Frame Design', 'Frame Colour', 'Door Design',
    'Door Colour (External)', 'Door Colour (Internal)', 'Door Glass',
    'Door Hinged On', 'Master Leaf', 'Hardware Type', 'Handle', 'Letterplate', 'Knocker'
  ];
  function slimChoices(choices) {
    return (choices || []).map(function (c) { return { label: c.label || '', id: c.id != null ? c.id : null }; });
  }
  function slimGlazing(byStyle) {
    var out = {};
    Object.keys(byStyle || {}).forEach(function (s) { out[s] = Array.isArray(byStyle[s]) ? slimChoices(byStyle[s]) : []; });
    return out;
  }
  function slimSidelights(node) {
    if (!node || typeof node !== 'object') { return null; }
    function pick(key) { return (node[key] && Array.isArray(node[key].choices)) ? slimChoices(node[key].choices) : []; }
    return { sidelightType: pick('sidelightType'), sidelightGlass: pick('sidelightGlass') };
  }
  function buildCustomerView(full) {
    var types = [], byType = {};
    Object.keys(full).forEach(function (typeName) {
      var node = full[typeName];
      if (!node || typeof node !== 'object' || !node.fields) { return; } // skip _assetBase/_schema/etc.
      types.push(typeName);
      var fields = {};
      CUSTOMER_HEADINGS.forEach(function (h) {
        if (node.fields[h] && node.fields[h].choices) { fields[h] = slimChoices(node.fields[h].choices); }
      });
      byType[typeName] = {
        hingeSideField: node.fields['Door Hinged On'] ? 'Door Hinged On' : (node.fields['Master Leaf'] ? 'Master Leaf' : ''),
        hasInternalColour: !!node.fields['Door Colour (Internal)'],
        hasKnocker: !!node.fields['Knocker'],
        hasFrameShape: !!(node.fields['Frame Design'] && node.fields['Frame Design'].choices.length > 1),
        fields: fields,
        glazingByStyle: slimGlazing(node.glazingByStyle),
        knockerByStyle: slimGlazing(node.knockerByStyle),
        sidelights: slimSidelights(node.sidelights)
      };
    });
    return { types: types, byType: byType };
  }


  window.HD_DD_HarnessData = {
    load: function () {
      return Promise.all([
        fetch('../data/endurance-catalogue-full.json').then(function (r) { return r.json(); }),
        fetch('../data/render-model.json').then(function (r) { return r.json(); }),
        fetch('../data/style-categories.json').then(function (r) { return r.json(); }).catch(function () { return null; })
      ]).then(function (res) {
        return { customerView: buildCustomerView(res[0]), model: res[1], categories: res[2] };
      });
    }
  };
})();
