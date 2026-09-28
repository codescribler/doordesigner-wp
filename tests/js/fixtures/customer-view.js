// Build the customer view from the full catalogue exactly as HD_DD_Catalogue::customer_view()
// does (labels/ids only), so Node tests exercise the same shape the browser receives.
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..', '..');
var full = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/endurance-catalogue-full.json'), 'utf8'));

function slim(list) { return (list || []).map(function (c) { return { label: c.label, id: c.id }; }); }

function node(type) {
  var n = full[type];
  var cv = {
    fields: {}, glazingByStyle: {}, knockerByStyle: {},
    sidelights: n.sidelights ? {
      sidelightType: slim(n.sidelights.sidelightType && n.sidelights.sidelightType.choices),
      sidelightGlass: slim(n.sidelights.sidelightGlass && n.sidelights.sidelightGlass.choices)
    } : null,
    hasInternalColour: !!n.fields['Door Colour (Internal)'],
    hasKnocker: !!n.fields['Knocker'],
    hasFrameShape: !!(n.fields['Frame Design'] && n.fields['Frame Design'].choices.length > 1),
    hingeSideField: n.fields['Door Hinged On'] ? 'Door Hinged On' : (n.fields['Master Leaf'] ? 'Master Leaf' : '')
  };
  Object.keys(n.fields).forEach(function (h) { cv.fields[h] = slim(n.fields[h].choices); });
  Object.keys(n.glazingByStyle || {}).forEach(function (s) { cv.glazingByStyle[s] = slim(n.glazingByStyle[s]); });
  Object.keys(n.knockerByStyle || {}).forEach(function (s) { cv.knockerByStyle[s] = slim(n.knockerByStyle[s]); });
  return cv;
}

function customerView() {
  var types = Object.keys(full).filter(function (k) { return k.charAt(0) !== '_' && full[k] && full[k].fields; });
  var byType = {};
  types.forEach(function (t) { byType[t] = node(t); });
  return { types: types, byType: byType };
}

function categories() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/style-categories.json'), 'utf8'));
}

module.exports = { customerView: customerView, categories: categories, ROOT: ROOT };
