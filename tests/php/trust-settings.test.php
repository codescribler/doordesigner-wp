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
check( '4.9' === $s['proof_rating'], 'default rating is 4.9' );
check( '321' === $s['proof_count'], 'default review count is 321' );
check( '' === $s['proof_url'] && '' === $s['proof_quotes'], 'no link and no quotes by default' );

// --- 2) sanitize(): rating ------------------------------------------------------------
$cur = HD_DD_Trust_Settings::defaults();
$in  = function ( array $over ) use ( $cur ) {
	return HD_DD_Trust_Settings::sanitize( array_merge( $cur, $over ), $cur );
};
check( '4.8' === $in( array( 'proof_rating' => '4.8' ) )['proof_rating'], 'rating kept' );
check( '4.9' === $in( array( 'proof_rating' => '4,9' ) )['proof_rating'], 'comma decimal accepted' );
check( '5.0' === $in( array( 'proof_rating' => '5' ) )['proof_rating'], 'whole number formatted to one decimal' );
check( '' === $in( array( 'proof_rating' => '11' ) )['proof_rating'], 'rating above 5 is dropped' );
check( '' === $in( array( 'proof_rating' => 'great' ) )['proof_rating'], 'non-numeric rating is dropped' );
check( '' === $in( array( 'proof_rating' => '' ) )['proof_rating'], 'rating can be cleared' );

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
check( '4.9' === $cfg['rating'] && '321' === $cfg['count'] && array() === $cfg['quotes'], 'defaults reach the browser config' );
update_option( 'hd_dd_settings', array( 'proof_rating' => '4.9', 'proof_count' => '' ) );
$cfg = HD_DD_Trust_Settings::front_config();
check( '' === $cfg['rating'] && '' === $cfg['count'], 'no count → no rating line at all' );
update_option( 'hd_dd_settings', array( 'proof_rating' => '4.9', 'proof_count' => '1204', 'proof_quotes' => 'Great | Al, Ware' ) );
$cfg = HD_DD_Trust_Settings::front_config();
check( '1,204' === $cfg['count'], 'count is formatted with a thousands separator' );
check( 'Great' === $cfg['quotes'][0]['text'], 'quotes reach the browser config parsed' );

hd_test_done( 'trust-settings.test.php' );
