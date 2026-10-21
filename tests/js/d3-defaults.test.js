// Designer 3 pre-picked furniture. `node tests/js/d3-defaults.test.js`
var assert = require('assert');
var model = require('../../data/render-model.json');
var S = require('../../assets/js/design-shared.js');
var D = require('../../assets/js/designer3/d3-defaults.js');
var fx = require('./fixtures/customer-view.js');

var cv = S.enrichCustomerView(fx.customerView(), model);
var TYPE = 'Single Door';
var node = cv.byType[TYPE];
var table = {
	fallback: { colour: 'Anthracite Grey', handle: 'Lever/Lever', hardware: 'Chrome', letterplate: 'Letterplate', knocker: 'No Knocker' },
	'Single Door': {
		Etna: { colour: 'French Navy', handle: 'Finger Pull', knocker: 'Bogus Knocker' },
		Bruce: { handle: 'Finger Pull', letterplate: 'Letterplate' }
	}
};
var labels = function (list) { return (list || []).map(function (c) { return c.label.trim(); }); };

// a style with an entry gets its popular handle and colour
var etna = D.resolve(node, model, TYPE, 'Etna', table);
assert.strictEqual(etna['Handle'], 'Finger Pull');
assert.strictEqual(etna['Door Colour (External)'], 'French Navy');

// a popular knocker the style does not offer becomes No Knocker
assert.strictEqual(etna['Knocker'], 'No Knocker');

// bottom-position styles get Bottom, middle ones Middle, and none where the step does not apply
assert.strictEqual(node.letterplatePosStyles['Bruce'], 'bottom');
assert.strictEqual(D.resolve(node, model, TYPE, 'Bruce', table)['Letterplate Position'], 'Bottom');
assert.strictEqual(etna['Letterplate Position'], 'Middle');
var noPos = Object.keys(node.knockerByStyle).filter(function (s) { return !node.letterplatePosStyles[s]; })[0];
assert.ok(noPos, 'fixture has a style without a position choice');
assert.strictEqual(D.resolve(node, model, TYPE, noPos, table)['Letterplate Position'], undefined);

// a style with no entry gets the fallback
var plain = D.resolve(node, model, TYPE, 'Alto', table);
assert.strictEqual(plain['Door Colour (External)'], 'Anthracite Grey');
assert.strictEqual(plain['Handle'], 'Lever/Lever');
assert.strictEqual(plain['Hardware Type'], 'Chrome');

// a real letterplate is always picked, so a bottom style always has its position
assert.notStrictEqual(D.resolve(node, model, TYPE, 'Bruce', table)['Letterplate'], 'No Letterplate');

// the rest: no frame, Satin glass, first hinge side, white inside
assert.strictEqual(etna['Frame Design'], 'No Sidelights');
assert.strictEqual(etna['Door Glass'], 'Satin');
assert.strictEqual(etna['Door Hinged On'], node.fields['Door Hinged On'][0].label);
assert.strictEqual(etna['Door Colour (Internal)'], 'White');

// an unknown fallback never leaks through
var junk = D.resolve(node, model, TYPE, 'Etna', { fallback: { colour: 'Nope', handle: 'Nope', hardware: 'Nope', letterplate: 'Nope', knocker: 'Nope' } });
assert.strictEqual(junk['Door Colour (External)'], node.fields['Door Colour (External)'][0].label);

// every returned label is one of that style's choices, for every type and style
Object.keys(cv.byType).forEach(function (type) {
	var n = cv.byType[type];
	Object.keys(n.knockerByStyle).forEach(function (style) {
		var r = D.resolve(n, model, type, style, table);
		var check = function (heading, list) {
			assert.ok(labels(list).indexOf(r[heading].trim()) !== -1, type + '/' + style + ' ' + heading + ' = ' + r[heading]);
		};
		check('Door Colour (External)', n.fields['Door Colour (External)']);
		check('Handle', n.fields['Handle']);
		check('Letterplate', n.fields['Letterplate']);
		check('Hardware Type', n.fields['Hardware Type']);
		// a style that offers no knocker at all still gets the plain 'No Knocker' (brief rule 2)
		if (n.knockerByStyle[style].length) { check('Knocker', n.knockerByStyle[style]); } else { assert.strictEqual(r['Knocker'], 'No Knocker'); }
		if (r['Door Glass']) { check('Door Glass', n.glazingByStyle[style] || n.fields['Door Glass']); }
		if (n.hingeSideField) { check(n.hingeSideField, n.fields[n.hingeSideField]); }
	});
});

// never an absent handle or letterplate, even if the table asks for one
var absentTable = { fallback: table.fallback, 'Single Door': { Etna: { handle: 'No Handle ', letterplate: 'No Letterplate' } } };
Object.keys(cv.byType).forEach(function (type) {
	var n = cv.byType[type];
	Object.keys(n.knockerByStyle).forEach(function (style) {
		var r = D.resolve(n, model, type, style, absentTable);
		assert.ok(!/^no /i.test(r['Handle'].trim()) && !/^no /i.test(r['Letterplate'].trim()), type + '/' + style + ' picked an absent part');
	});
});
assert.strictEqual(D.resolve(node, model, TYPE, 'Etna', absentTable)['Letterplate'], 'Letterplate');

// the real built table resolves too, and its fallback is a complete door
var real = require('../../data/designer3-defaults.json');
assert.deepStrictEqual([real.fallback.handle, real.fallback.hardware, real.fallback.letterplate, real.fallback.knocker], ['Lever/Lever', 'Chrome', 'Letterplate', 'No Knocker']);
assert.ok(real.fallback.colour);
assert.ok(D.resolve(node, model, TYPE, 'Pentland', real)['Handle']);
console.log('d3-defaults: ok');
