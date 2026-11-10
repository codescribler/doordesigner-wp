<?php
/**
 * Designer 4's read and door routes have a generous per-IP limit (240 an hour); a lead does not
 * count towards it and is not stopped by it.
 * Run: php tests/php/d4-rate-limit.test.php
 */
require __DIR__ . '/d4-helpers.php';

function hd_rl_d4() {
	$repo = new HD_DD_Repository();
	return new HD_DD_D4( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
}
function hd_rl_req( $token, array $body = array() ) {
	$r = hd_test_request( 'POST', '/hd-door-designer/v1/d4/x', $body + array( 'auth' => array( 'tokens' => array( $token ) ) ) );
	$r->set_url_params( array( 'token' => $token ) );
	return $r;
}
function hd_rl_status( $res ) {
	return is_wp_error( $res ) ? ( isset( $res->get_error_data()['status'] ) ? $res->get_error_data()['status'] : 0 ) : $res->get_status();
}

// 1) The 241st call in the hour is 429, whichever of the four routes it is.
hd_d4_reset();
$door = hd_d4_lead()->get_data();
$d4   = hd_rl_d4();
$calls = array(
	function () use ( $d4, $door ) { return $d4->doors->rest_designs( hd_rl_req( $door['token'] ) ); },
	function () use ( $d4, $door ) { return $d4->doors->rest_change( hd_rl_req( $door['token'] ) ); },
	function () use ( $d4, $door ) { return $d4->details->rest_details( hd_rl_req( $door['token'] ) ); },
);
$codes = array();
for ( $i = 1; $i <= 240; $i++ ) {
	$codes[] = hd_rl_status( $calls[ $i % 3 ]() );
}
check( array( 200 ) === array_values( array_unique( $codes ) ), 'the first 240 calls are answered (got ' . implode( ',', array_unique( $codes ) ) . ')' );
$res = $d4->doors->rest_designs( hd_rl_req( $door['token'] ) );
check( 429 === hd_rl_status( $res ), 'the 241st call is 429 (got ' . hd_rl_status( $res ) . ')' );
check( is_wp_error( $res ) && '' !== $res->get_error_message(), 'with a plain message' );
check( 429 === hd_rl_status( $d4->doors->rest_remove( hd_rl_req( $door['token'] ) ) ), 'remove is limited too' );
check( empty( $GLOBALS['wpdb']->rows[0]['removed_at'] ), 'and the limited remove did nothing' );

// 2) A lead is unaffected by this limit (it has its own, shared with the save endpoints).
$lead = hd_d4_lead( array( 'email' => 'other@example.com' ) );
check( 200 === hd_rl_status( $lead ), 'a lead still goes through once the read limit is reached' );

// 3) A lead does not use up the read limit.
hd_d4_reset();
$door = hd_d4_lead()->get_data();
for ( $i = 0; $i < 3; $i++ ) { hd_d4_lead( array( 'email' => "p$i@example.com" ) ); }
$d4 = hd_rl_d4();
for ( $i = 1; $i <= 240; $i++ ) { $last = hd_rl_status( $d4->doors->rest_designs( hd_rl_req( $door['token'] ) ) ); }
check( 200 === $last, 'leads do not count towards the 240' );

// 4) The window ends after an hour.
$key = 'hd_dd_d4_read_' . md5( '203.0.113.5' );
check( isset( $GLOBALS['hd_test_transients'][ $key ] ), 'the count is a transient keyed by IP like the save limit' );
$GLOBALS['hd_test_transients'][ $key ]['value']['until'] = time() - 1;
check( 200 === hd_rl_status( $d4->doors->rest_designs( hd_rl_req( $door['token'] ) ) ), 'a new hour starts a new count' );

hd_test_done( 'd4-rate-limit' );
