// Console snippet for wp-admin > Door Enquiries. Paste into the browser console on that page.
// Reads each row's design JSON (the same data the "Copy JSON" button uses) and copies
// {_capturedAt,_source,designs:[{type,style,colour,handle,hardware,letterplate,letterplatePosition,knocker}]}
// to the clipboard. Design labels only - no customer fields. Save the result as
// tools/data/enquiry-designs.json, then run `node tools/build-designer3-defaults.js`.
// Skips failed rows (payload.failure) and rows whose customer email contains "dreamfree".
(function () {
	var rows = document.querySelectorAll('table.wp-list-table tbody tr');
	var designs = [];
	var read = function (row) {
		var t = row.querySelector('details textarea');
		try { return t ? JSON.parse(t.value) : null; } catch (e) { return null; }
	};
	var lab = function (d, h) { return d && d[h] && d[h].label != null ? d[h].label : null; };
	rows.forEach(function (row) {
		var p = read(row);
		if (!p || p.failure) { return; }
		var mail = row.querySelector('a[href^="mailto:"]');
		var email = mail ? mail.textContent : '';
		if (/dreamfree/i.test(email)) { return; }
		var d = p.design || p; // the payload carries the design under .design; a bare design row is the design itself
		designs.push({
			type: lab(d, 'Door Type'), style: lab(d, 'Door Design'), colour: lab(d, 'Door Colour (External)'),
			handle: lab(d, 'Handle'), hardware: lab(d, 'Hardware Type'), letterplate: lab(d, 'Letterplate'),
			letterplatePosition: lab(d, 'Letterplate Position'), knocker: lab(d, 'Knocker')
		});
	});
	var out = {
		_capturedAt: new Date().toISOString().slice(0, 10),
		_source: 'wp-admin Door Enquiries, every stored enquiry/save design (failed rows and the owner test row excluded). Design labels only, no customer fields.',
		designs: designs.filter(function (x) { return x.type && x.style; })
	};
	var text = JSON.stringify(out, null, 1);
	if (typeof copy === 'function') { copy(text); } else if (navigator.clipboard) { navigator.clipboard.writeText(text); }
	console.log('Captured ' + out.designs.length + ' designs');
})();
