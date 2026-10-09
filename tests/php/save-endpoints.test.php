<?php
/**
 * Email-only save, then the quote request that turns it into an enquiry.
 * Run: php tests/php/save-endpoints.test.php
 */
require __DIR__ . '/experiment-helpers.php';
require_once HD_DD_DIR . 'includes/class-hd-failure-log.php';

function hd_api() {
	$repo = new HD_DD_Repository();
	return new HD_DD_Save( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
}
function hd_design( $colour = 'Sage' ) {
	return array(
		'Door Type'              => array( 'label' => 'Single Door', 'id' => null ),
		'Door Design'            => array( 'label' => 'Ketu', 'id' => 12 ),
		'Door Colour (External)' => array( 'label' => $colour, 'id' => 3 ),
	);
}
function hd_save( array $over = array() ) {
	$body = array_merge( array(
		'email' => 'jo@example.com', 'hd_hp' => '', 'design' => hd_design(), 'flow' => 'swipe2',
		'pageUrl' => 'https://example.test/door-designer/',
		'experiment' => array( 'experimentId' => 'exp_20261020_aaaaaa', 'visitorId' => str_repeat( 'a', 32 ), 'arm' => 'challenger' ),
	), $over );
	return hd_api()->rest_save( hd_test_request( 'POST', '/hd-door-designer/v1/save', $body ) );
}
function hd_with_token( $token, $suffix, array $body ) {
	$r = hd_test_request( 'POST', '/hd-door-designer/v1/save/' . $token . $suffix, $body );
	$r->set_param( 'token', $token );
	return $r;
}
function hd_quote( $token, array $over = array() ) {
	return hd_api()->rest_quote( hd_with_token( $token, '/quote', array_merge( array( 'name' => 'Jo Bloggs', 'postcode' => 'al1 1aa', 'telephone' => '', 'pageUrl' => 'https://example.test/door-designer/' ), $over ) ) );
}
function hd_rows() { global $wpdb; return $wpdb->rows; }

// --- 1) Save: one row, kind save, two emails, not a conversion ------------------------------
hd_test_reset();
$conversions = 0; $saves = 0;
add_action( 'hd_dd_enquiry_submitted', function () use ( &$conversions ) { $conversions++; }, 10, 2 );
add_action( 'hd_dd_design_saved', function () use ( &$saves ) { $saves++; }, 10, 2 );
$res = hd_save( array( 'email' => '  Jo@Example.com ' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'a save with only an email is accepted' );
$row = hd_rows()[0];
check( 'save' === $row['kind'] && 'swipe2' === $row['flow'], 'stored as a save, with its flow' );
check( 'Jo@Example.com' === $row['customer_email'], 'email stored trimmed' );
check( '' === $row['customer_name'] && '' === $row['customer_postcode'] && '' === $row['customer_phone'], 'no other details yet' );
check( 'Ketu in Sage' === $row['design_name'], 'named automatically (got "' . $row['design_name'] . '")' );
$payload = json_decode( $row['payload'], true );
check( 'save' === $payload['kind'] && 'challenger' === $payload['experiment']['arm'], 'payload carries kind and the A/B arm' );
check( 0 === $conversions && 1 === $saves, 'fires hd_dd_design_saved, not the enquiry hook' );
check( 2 === count( $GLOBALS['hd_test_mail'] ), 'saver email and owner note are sent' );
$token = $res->get_data()['token'];
check( is_string( $token ) && strlen( $token ) >= 10, 'response carries the token' );

// --- 2) Bad input stores nothing -----------------------------------------------------------
hd_test_reset();
$res = hd_save( array( 'email' => 'not-an-email' ) );
check( is_wp_error( $res ) && 'hd_dd_validation' === $res->get_error_code() && isset( $res->get_error_data()['fields']['email'] ), 'a bad email is rejected by name' );
check( array() === hd_rows() && array() === $GLOBALS['hd_test_mail'], 'nothing stored or sent' );
hd_test_reset();
$res = hd_save( array( 'design' => array() ) );
check( is_wp_error( $res ) && 'hd_dd_no_design' === $res->get_error_code(), 'no design is rejected' );
hd_test_reset();
$res = hd_save( array( 'email' => array( 'x' ) ) );
check( is_wp_error( $res ), 'an array email is rejected, not a crash' );

// --- 3) Honeypot: stored and flagged, never dropped ----------------------------------------
hd_test_reset();
$res = hd_save( array( 'hd_hp' => 'autofill' ) );
check( ! is_wp_error( $res ) && 'flagged' === hd_rows()[0]['status'], 'a honeypot hit is kept and flagged' );

// --- 4) Flow: alias mapped, junk dropped ---------------------------------------------------
hd_test_reset();
hd_save( array( 'flow' => 'swipe' ) );
check( 'swipe2' === hd_rows()[0]['flow'], 'the old swipe key is stored as swipe2' );
hd_test_reset();
hd_save( array( 'flow' => '<script>' ) );
check( '' === hd_rows()[0]['flow'], 'an unknown flow is stored empty' );

// --- 5) Design changed after saving: same row, no new emails -------------------------------
hd_test_reset();
$token = hd_save()->get_data()['token'];
$mails = count( $GLOBALS['hd_test_mail'] );
$res   = hd_api()->rest_update( hd_with_token( $token, '', array( 'design' => hd_design( 'Rich Red' ) ) ) );
check( ! is_wp_error( $res ) && 200 === $res->get_status(), 'an update is accepted' );
check( 1 === count( hd_rows() ), 'still one row' );
check( 'Ketu in Rich Red' === hd_rows()[0]['design_name'], 'design name follows the door' );
check( false !== strpos( hd_rows()[0]['design'], 'Rich Red' ) && false !== strpos( hd_rows()[0]['payload'], 'Rich Red' ), 'design and payload are updated' );
check( $mails === count( $GLOBALS['hd_test_mail'] ), 'no email for an update' );
$res = hd_api()->rest_update( hd_with_token( 'unknowntoken12', '', array( 'design' => hd_design() ) ) );
check( is_wp_error( $res ) && 404 === $res->get_error_data()['status'], 'an unknown token is a 404' );
$res = hd_api()->rest_update( hd_with_token( $token, '', array( 'design' => array() ) ) );
check( is_wp_error( $res ) && 'hd_dd_no_design' === $res->get_error_code(), 'an empty design does not wipe the saved one' );

// --- 6) Quote: the same row becomes an enquiry and converts for the stored arm -------------
hd_test_reset();
$conversions = 0; $seen = null;
add_action( 'hd_dd_enquiry_submitted', function ( $p ) use ( &$conversions, &$seen ) { $conversions++; $seen = $p; }, 10, 2 );
$save  = hd_save()->get_data();
$mails = count( $GLOBALS['hd_test_mail'] );
$res   = hd_quote( $save['token'], array( 'telephone' => '01234 567890' ) );
check( ! is_wp_error( $res ) && 200 === $res->get_status(), 'a quote request is accepted' );
check( 1 === count( hd_rows() ), 'no second row' );
$row = hd_rows()[0];
check( 'enquiry' === $row['kind'] && 'Jo Bloggs' === $row['customer_name'] && 'AL1 1AA' === $row['customer_postcode'] && '01234 567890' === $row['customer_phone'], 'row carries the details and is now an enquiry' );
check( $save['reference'] === $res->get_data()['reference'] && $save['token'] === $res->get_data()['token'], 'same reference and token' );
check( 1 === $conversions && 'challenger' === $seen['experiment']['arm'] && 'enquiry' === $seen['kind'], 'converts once, for the arm stored at save time' );
check( 'Jo Bloggs' === $seen['customer']['name'] && 'jo@example.com' === $seen['customer']['email'], 'the payload has the full customer' );
$new = array_slice( $GLOBALS['hd_test_mail'], $mails );
check( 2 === count( $new ) && 0 === strpos( $new[0]['subject'], 'New door enquiry ' . $save['reference'] ), 'the usual enquiry email and the customer acknowledgement are sent' );

// A second tap changes nothing.
$mails = count( $GLOBALS['hd_test_mail'] );
$res   = hd_quote( $save['token'], array( 'name' => 'Someone Else' ) );
check( ! is_wp_error( $res ) && 200 === $res->get_status() && ! empty( $res->get_data()['ok'] ), 'a repeat quote call still answers ok' );
check( 1 === $conversions && 'Jo Bloggs' === hd_rows()[0]['customer_name'] && $mails === count( $GLOBALS['hd_test_mail'] ), 'and does nothing more' );

// --- 7) Quote validation -------------------------------------------------------------------
hd_test_reset();
$token = hd_save()->get_data()['token'];
foreach ( array( 'name' => '', 'postcode' => 'nope' ) as $field => $bad ) {
	$res = hd_quote( $token, array( $field => $bad ) );
	check( is_wp_error( $res ) && isset( $res->get_error_data()['fields'][ $field ] ), "a bad $field is rejected by name" );
	check( ! isset( $res->get_error_data()['fields']['telephone'] ), 'the phone is never required' );
	check( 'save' === hd_rows()[0]['kind'], "the row stays a save after a bad $field" );
}
$res = hd_quote( $token, array( 'telephone' => 'ring me after six' ) );
check( ! is_wp_error( $res ) && '' === hd_rows()[0]['customer_phone'], 'junk in the phone box does not block the quote' );
$res = hd_quote( 'unknowntoken12' );
check( is_wp_error( $res ) && 404 === $res->get_error_data()['status'], 'an unknown token is a 404' );

// --- 8) /design tells the browser the flow and kind, and nothing personal -------------------
hd_test_reset();
$token = hd_save()->get_data()['token'];
$enq   = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
$r     = hd_test_request( 'GET', '/hd-door-designer/v1/design/' . $token );
$r->set_param( 'token', $token );
$data = $enq->rest_get_design( $r )->get_data();
check( 'swipe2' === $data['flow'] && 'save' === $data['kind'], 'design endpoint returns flow and kind' );
check( array( 'design', 'flow', 'kind' ) === array_keys( $data ) && false === strpos( json_encode( $data ), 'example.com' ), 'and no personal data' );

// --- 9) Routes and failure logging ---------------------------------------------------------
hd_test_reset();
hd_api()->register_routes();
$routes = array_keys( $GLOBALS['hd_test_routes'] );
check( in_array( '/save', $routes, true ) && 3 === count( $routes ), 'three routes are registered' );
foreach ( $GLOBALS['hd_test_routes'] as $args ) {
	check( is_array( $args['permission_callback'] ) && 'check_nonce' === $args['permission_callback'][1], 'every save route checks the nonce' );
}
hd_test_reset();
$log  = new HD_DD_Failure_Log( new HD_DD_Repository() );
$fail = hd_test_error_to_response( hd_save( array( 'email' => 'bad' ) ) );
$log->maybe_record( $fail, null, hd_test_request( 'POST', '/hd-door-designer/v1/save', array( 'email' => 'bad', 'design' => hd_design() ) ) );
check( 1 === count( hd_rows() ) && 'failed' === hd_rows()[0]['status'], 'a failed save is logged like a failed enquiry' );

// --- 10) Throttle: 20 saves an hour per connection ------------------------------------------
hd_test_reset();
for ( $i = 0; $i < 25; $i++ ) {
	hd_save( array( 'email' => 'not-an-email' ) );
}
check( ! is_wp_error( hd_save() ), 'rejected attempts do not use up the allowance' );
hd_test_reset();
for ( $i = 1; $i <= 20; $i++ ) {
	$res = hd_save( array( 'email' => "jo$i@example.com" ) );
	check( ! is_wp_error( $res ) && 201 === $res->get_status(), "save $i of 20 is accepted" );
}
$rows  = count( hd_rows() );
$mails = count( $GLOBALS['hd_test_mail'] );
$saves = 0;
add_action( 'hd_dd_design_saved', function () use ( &$saves ) { $saves++; }, 10, 2 );
$res = hd_save( array( 'email' => 'jo21@example.com' ) );
check( is_wp_error( $res ) && 'hd_dd_rate_limited' === $res->get_error_code() && 429 === $res->get_error_data()['status'], 'the 21st save in the hour is a 429' );
check( is_wp_error( $res ) && 'Too many saves from this connection. Please try again later.' === $res->get_error_message(), 'with a plain message' );
check( $rows === count( hd_rows() ) && $mails === count( $GLOBALS['hd_test_mail'] ) && 0 === $saves, 'and nothing is stored or sent' );
if ( is_wp_error( $res ) ) {
	$log = new HD_DD_Failure_Log( new HD_DD_Repository() );
	$log->maybe_record( hd_test_error_to_response( $res ), null, hd_test_request( 'POST', '/hd-door-designer/v1/save', array( 'email' => 'jo21@example.com', 'design' => hd_design() ) ) );
	check( $rows === count( hd_rows() ) && $mails === count( $GLOBALS['hd_test_mail'] ), 'a throttled save is not logged as a failed submission' );
}
$_SERVER['REMOTE_ADDR'] = '203.0.113.6';
check( ! is_wp_error( hd_save() ), 'another connection is not affected' );
$_SERVER['REMOTE_ADDR'] = '203.0.113.5';
$key = 'hd_dd_save_' . md5( '203.0.113.5' );
check( isset( $GLOBALS['hd_test_transients'][ $key ] ), 'the count is kept in a transient for that connection' );
if ( isset( $GLOBALS['hd_test_transients'][ $key ] ) ) {
	$GLOBALS['hd_test_transients'][ $key ]['value']['until'] = time() - 1; // the hour has passed.
	check( ! is_wp_error( hd_save() ), 'a new hour starts a new allowance' );
}

// --- 10) Database not upgraded yet: a save fails loudly instead of being stored as an enquiry ---
hd_test_reset();
update_option( 'hd_dd_db_version', '3' ); // the kind / flow columns are not there yet.
$res = hd_save();
check( is_wp_error( $res ) && 500 === $res->get_error_data()['status'], 'a save is refused while the database upgrade is pending' );
check( array() === hd_rows() && array() === $GLOBALS['hd_test_mail'], 'nothing is stored or sent to the saver' );
$log = new HD_DD_Failure_Log( new HD_DD_Repository() );
$log->maybe_record( hd_test_error_to_response( $res ), null, hd_test_request( 'POST', '/hd-door-designer/v1/save', array( 'email' => 'jo@example.com', 'design' => hd_design() ) ) );
check( 1 === count( hd_rows() ) && 'failed' === hd_rows()[0]['status'] && 'jo@example.com' === hd_rows()[0]['customer_email'], 'and it is logged as a failed submission with their email, so the owner hears about it' );

// Activation stamps the schema version only through the same column check.
hd_test_reset();
update_option( 'hd_dd_db_version', '3' );
$GLOBALS['wpdb']->columns = array( 'id', 'reference', 'token' );
require_once HD_DD_DIR . 'includes/class-hd-activator.php';
if ( ! function_exists( 'flush_rewrite_rules' ) ) {
	function flush_rewrite_rules() {}
}
HD_DD_Activator::activate();
check( '3' === get_option( 'hd_dd_db_version' ), 'activation does not claim the new schema when the columns are missing' );

hd_test_done( 'save-endpoints.test.php' );
