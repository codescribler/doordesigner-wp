<?php
/**
 * Review-step social proof settings: loose input must never put something wrong on the
 * page. A bad rating or count hides the rating line; quotes are plain text only.
 * Run: php tests/php/trust-settings.test.php
 */
require __DIR__ . '/wp-stubs.php';

// --- 1) Defaults reach HD_DD_Plugin::settings() --------------------------------------
hd_test_reset();
$s = HD_DD_Plugin::settings();
check( '10' === $s['proof_rating'], 'default rating is 10' );
check( '79' === $s['proof_count'], 'default review count is 79' );
check( '' === $s['proof_url'] && '' === $s['proof_quotes'], 'no link and no quotes by default' );

// --- 2) sanitize(): rating ------------------------------------------------------------
$cur = HD_DD_Trust_Settings::defaults();
$in  = function ( array $over ) use ( $cur ) {
	return HD_DD_Trust_Settings::sanitize( array_merge( $cur, $over ), $cur );
};
$rating_cases = array(
	'9.8'   => '9.8',
	'9,8'   => '9.8',
	'10'    => '10',
	'5'     => '5',
	'9.67'  => '9.67',
	'9.999' => '9.99',
	'9.80'  => '9.8',
	'11'    => '',
	'0.004' => '',
	'-3'    => '',
	'great' => '',
	''      => '',
);
foreach ( $rating_cases as $raw => $want ) {
	$got = $in( array( 'proof_rating' => (string) $raw ) )['proof_rating'];
	check( $want === $got, "rating '$raw' becomes '$want' (got '$got')" );
}

// --- 3) sanitize(): count, link ---------------------------------------------------------
check( '1204' === $in( array( 'proof_count' => '1,204 reviews' ) )['proof_count'], 'count keeps digits only' );
check( '' === $in( array( 'proof_count' => '0' ) )['proof_count'], 'zero count is dropped' );
check( 'https://www.checkatrade.com/trades/x' === $in( array( 'proof_url' => ' https://www.checkatrade.com/trades/x ' ) )['proof_url'], 'link trimmed and kept' );
check( '' === $in( array( 'proof_url' => 'javascript:alert(1)' ) )['proof_url'], 'non-http link is dropped' );

// --- 4) sanitize(): a key missing from the form keeps the current value -------------------
$kept = HD_DD_Trust_Settings::sanitize( array(), array_merge( $cur, array( 'proof_quotes' => 'Lovely | Ann, Ware' ) ) );
check( 'Lovely | Ann, Ware' === $kept['proof_quotes'], 'missing key keeps the current value' );

// --- 5) sanitize() + parse_quotes(): plain text only -------------------------------------
$q = $in( array( 'proof_quotes' => "<b>Brilliant</b> fitters | Sam, St Albans\r\n\r\n  \"Tidy job\" | Jo, Hitchin\nNo attribution here" ) )['proof_quotes'];
check( false === strpos( $q, '<b>' ), 'markup stripped from quotes' );
$parsed = HD_DD_Trust_Settings::parse_quotes( $q );
check( 3 === count( $parsed ), 'three quotes parsed, blank line skipped (got ' . count( $parsed ) . ')' );
check( 'Brilliant fitters' === $parsed[0]['text'] && 'Sam, St Albans' === $parsed[0]['by'], 'text and attribution split on the bar' );
check( 'Tidy job' === $parsed[1]['text'], 'surrounding quote marks removed' );
check( 'No attribution here' === $parsed[2]['text'] && '' === $parsed[2]['by'], 'a line with no bar has no attribution' );
check( 'A | B' === HD_DD_Trust_Settings::parse_quotes( 'A | B | Dee, Tring' )[0]['text'], 'only the LAST bar separates the attribution' );
check( 6 === count( HD_DD_Trust_Settings::parse_quotes( implode( "\n", array_fill( 0, 9, 'Good | A, B' ) ) ) ), 'at most six quotes' );
check( array() === HD_DD_Trust_Settings::parse_quotes( '' ), 'no quotes from an empty setting' );

// --- 6) front_config(): the rating line needs BOTH rating and count ------------------------
hd_test_reset();
$cfg = HD_DD_Trust_Settings::front_config();
check( '10' === $cfg['rating'] && '79' === $cfg['count'] && array() === $cfg['quotes'], 'defaults reach the browser config' );
update_option( 'hd_dd_settings', array( 'proof_rating' => '10', 'proof_count' => '' ) );
$cfg = HD_DD_Trust_Settings::front_config();
check( '' === $cfg['rating'] && '' === $cfg['count'], 'no count → no rating line at all' );
update_option( 'hd_dd_settings', array( 'proof_rating' => '10', 'proof_count' => '1204', 'proof_quotes' => 'Great | Al, Ware' ) );
$cfg = HD_DD_Trust_Settings::front_config();
check( '1,204' === $cfg['count'], 'count is formatted with a thousands separator' );
check( 'Great' === $cfg['quotes'][0]['text'], 'quotes reach the browser config parsed' );

hd_test_done( 'trust-settings.test.php' );
