// assets/js/designer3/d3-type-art.js
// Designer 3's door-type outlines: single, double (two leaves, two handles), stable (split across
// the middle) and aluminium. The same drawings as Classic's first step (TYPE_SIL in
// hd-door-designer.js, which stays untouched as the A/B control); they are styled by the
// hd-dd__sil* rules in hd-door-designer.css, which Designer 3 already loads.
//
//   HD_DD_D3TypeArt.svg('Double Door') -> '<svg ...>' string, or '' for an unknown type
(function (W) {
	'use strict';

	var ART = {
		'Single Door':
			'<svg viewBox="0 0 110 210" class="hd-dd__sil" aria-hidden="true">' +
				'<rect class="hd-dd__sil-frame" x="22" y="10" width="66" height="190" rx="3"/>' +
				'<rect class="hd-dd__sil-panel" x="30" y="20" width="50" height="170" rx="2"/>' +
				'<line class="hd-dd__sil-line" x1="36" y1="64" x2="74" y2="64"/>' +
				'<line class="hd-dd__sil-line" x1="36" y1="108" x2="74" y2="108"/>' +
				'<line class="hd-dd__sil-line" x1="36" y1="152" x2="74" y2="152"/>' +
				'<rect class="hd-dd__sil-handle" x="72" y="104" width="5" height="20" rx="2.5"/>' +
			'</svg>',
		'Double Door':
			'<svg viewBox="0 0 110 210" class="hd-dd__sil" aria-hidden="true">' +
				'<rect class="hd-dd__sil-frame" x="10" y="10" width="90" height="190" rx="3"/>' +
				'<line class="hd-dd__sil-frame" x1="55" y1="12" x2="55" y2="198"/>' +
				'<rect class="hd-dd__sil-panel" x="17" y="20" width="32" height="170" rx="2"/>' +
				'<rect class="hd-dd__sil-panel" x="61" y="20" width="32" height="170" rx="2"/>' +
				'<rect class="hd-dd__sil-handle" x="48" y="100" width="5" height="24" rx="2.5"/>' +
				'<rect class="hd-dd__sil-handle" x="57" y="100" width="5" height="24" rx="2.5"/>' +
			'</svg>',
		'Stable Door':
			'<svg viewBox="0 0 110 210" class="hd-dd__sil" aria-hidden="true">' +
				'<rect class="hd-dd__sil-frame" x="22" y="10" width="66" height="190" rx="3"/>' +
				'<rect class="hd-dd__sil-panel" x="30" y="20" width="50" height="78" rx="2"/>' +
				'<rect class="hd-dd__sil-panel" x="30" y="112" width="50" height="78" rx="2"/>' +
				'<rect class="hd-dd__sil-split" x="26" y="99" width="58" height="12" rx="2"/>' +
				'<rect class="hd-dd__sil-handle" x="72" y="70" width="5" height="18" rx="2.5"/>' +
				'<rect class="hd-dd__sil-handle" x="72" y="124" width="5" height="18" rx="2.5"/>' +
			'</svg>',
		'Avantal':
			'<svg viewBox="0 0 110 210" class="hd-dd__sil" aria-hidden="true">' +
				'<rect class="hd-dd__sil-frame hd-dd__sil-frame--slim" x="24" y="10" width="62" height="190" rx="2"/>' +
				'<rect class="hd-dd__sil-glass" x="31" y="17" width="48" height="158" rx="1.5"/>' +
				'<line class="hd-dd__sil-mullion" x1="55" y1="17" x2="55" y2="175"/>' +
				'<rect class="hd-dd__sil-kick" x="31" y="180" width="48" height="14" rx="1.5"/>' +
				'<rect class="hd-dd__sil-handle" x="74" y="70" width="4.5" height="70" rx="2.2"/>' +
			'</svg>'
		};

	function svg(type) { return Object.prototype.hasOwnProperty.call(ART, type) ? ART[type] : ''; }

	var api = { svg: svg, TYPES: Object.keys(ART) };
	if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
	W.HD_DD_D3TypeArt = api;
})(typeof window !== 'undefined' ? window : this);
