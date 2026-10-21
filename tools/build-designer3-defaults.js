// Builds data/designer3-defaults.json: the most-chosen furniture per door style, from the
// design labels customers actually saved (tools/data/enquiry-designs.json).
//   node tools/build-designer3-defaults.js          build the data file
//   node tools/build-designer3-defaults.js --test   check the rules
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var FIELDS = ['colour', 'handle', 'hardware', 'letterplate', 'knocker'];
var THRESHOLD = 2; // a style entry only keeps a value seen at least this many times
var NO_DATA = { colour: 'Anthracite Grey', handle: 'Lever/Lever', hardware: 'Chrome', letterplate: 'Letterplate', knocker: 'No Knocker' };

function clean(v) { return (typeof v === 'string' && v.trim()) ? v.trim() : null; }

// The most common value in a {value: count} map ('' if empty); first seen wins a tie.
function top(counts) {
	var best = null;
	Object.keys(counts).forEach(function (v) { if (best === null || counts[v] > counts[best]) { best = v; } });
	return best;
}

function tally(list, field) {
	var c = {};
	list.forEach(function (d) { var v = clean(d[field]); if (v) { c[v] = (c[v] || 0) + 1; } });
	return c;
}

function build(designs, builtAt) {
	var out = { _builtAt: builtAt || new Date().toISOString(), fallback: {} };
	// Spec: too little data means a plain chrome lever, a chrome letterplate, no knocker and the
	// most popular colour overall. Only the colour is learned; the rest are fixed.
	out.fallback = { colour: top(tally(designs, 'colour')) || NO_DATA.colour, handle: NO_DATA.handle, hardware: NO_DATA.hardware, letterplate: NO_DATA.letterplate, knocker: NO_DATA.knocker };
	var groups = {};
	designs.forEach(function (d) {
		if (!d.type || !d.style) { return; }
		var k = d.type.trim() + '\u0000' + d.style.trim();
		(groups[k] = groups[k] || []).push(d);
	});
	Object.keys(groups).forEach(function (k) {
		var parts = k.split('\u0000');
		var entry = {};
		FIELDS.forEach(function (f) {
			var counts = tally(groups[k], f);
			var best = top(counts);
			if (best && counts[best] >= THRESHOLD) { entry[f] = best; }
		});
		if (Object.keys(entry).length) {
			out[parts[0]] = out[parts[0]] || {};
			out[parts[0]][parts[1]] = entry;
		}
	});
	return out;
}

// Drop labels the live catalogue doesn't offer for that type (label drift), trimmed match.
function validAgainst(designs, catalogue) {
	var HEADING = { colour: 'Door Colour (External)', handle: 'Handle', hardware: 'Hardware Type', letterplate: 'Letterplate' };
	return designs.map(function (d) {
		var node = catalogue[(d.type || '').trim()];
		if (!node) { return null; }
		var copy = { type: d.type, style: d.style };
		var has = function (list, v) { return (list || []).some(function (c) { return String(c.label).trim() === v; }); };
		Object.keys(HEADING).forEach(function (f) {
			var v = clean(d[f]);
			var fld = node.fields[HEADING[f]];
			copy[f] = v && fld && has(fld.choices, v) ? v : null;
		});
		var kn = clean(d.knocker);
		var kList = (node.knockerByStyle && node.knockerByStyle[(d.style || '').trim()]) || (node.fields.Knocker && node.fields.Knocker.choices);
		copy.knocker = kn && has(kList, kn) ? kn : null;
		return copy;
	}).filter(Boolean);
}

function selfTest() {
	var assert = require('assert');
	var mk = function (style, h, k) { return { type: 'Single Door', style: style, colour: 'Black', handle: h, hardware: 'Chrome', letterplate: null, knocker: k || null }; };
	var out = build([mk('A', 'Lever/Lever'), mk('A', 'Lever/Lever '), mk('A', 'Pull'), mk('B', 'Pull'), mk('C', 'No Handle ')], 'T');
	assert.strictEqual(out['Single Door'].A.handle, 'Lever/Lever', 'seen twice (trimmed) is kept');
	assert.strictEqual(out['Single Door'].A.colour, 'Black');
	assert.strictEqual(out['Single Door'].B, undefined, 'seen once is not kept');
	assert.strictEqual(out['Single Door'].C, undefined);
	assert.strictEqual(out.fallback.colour, 'Black', 'colour fallback = most popular overall');
	var pulls = build([mk('A', 'Pull'), mk('A', 'Pull'), { type: 'Single Door', style: 'A', letterplate: 'No Letterplate', knocker: 'Bee' }, { type: 'Single Door', style: 'A', letterplate: 'No Letterplate', knocker: 'Bee' }], 'T');
	assert.deepStrictEqual([pulls.fallback.handle, pulls.fallback.hardware, pulls.fallback.letterplate, pulls.fallback.knocker], ['Lever/Lever', 'Chrome', 'Letterplate', 'No Knocker'], 'fixed fallbacks ignore popularity');
	var empty = build([], 'T');
	assert.deepStrictEqual(empty.fallback, NO_DATA);
	var cat = { 'Single Door': { fields: { Handle: { choices: [{ label: 'Pull' }] }, 'Door Colour (External)': { choices: [] } }, knockerByStyle: {} } };
	var v = validAgainst([mk('A', 'Pull'), mk('A', 'Gone')], cat);
	assert.strictEqual(v[0].handle, 'Pull');
	assert.strictEqual(v[1].handle, null, 'unknown label dropped');
	console.log('build-designer3-defaults: ok');
}

if (require.main === module) {
	if (process.argv.indexOf('--test') !== -1) { selfTest(); }
	else {
		var src = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/enquiry-designs.json'), 'utf8'));
		var cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/endurance-catalogue-full.json'), 'utf8'));
		var data = build(validAgainst(src.designs, cat));
		fs.writeFileSync(path.join(ROOT, 'data/designer3-defaults.json'), JSON.stringify(data, null, '\t') + '\n');
		console.log('wrote data/designer3-defaults.json from ' + src.designs.length + ' designs');
	}
}
module.exports = { build: build, validAgainst: validAgainst };
