<?php
/**
 * POST /save/{token}/callback: a call-back request is a lead for the business, not an A/B conversion.
 * Run: php tests/php/save-callback.test.php
 */
require __DIR__ . '/experiment-helpers.php';
require_once HD_DD_DIR . 'includes/class-hd-failure-log.php';

function hd_api() {
	$repo = new HD_DD_Repository();
	return new HD_DD_Save( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
}
function hd_design() {
	return array(
		'Door Type'              => array( 'label' => 'Single Door', 'id' => null ),
		'Door Design'            => array( 'label' => 'Ketu', 'id' => 12 ),
		'Door Colour (External)' => array( 'label' => 'Sage', 'id' => 3 ),
	);
}
function hd_save() {
	$res = hd_api()->rest_save( hd_test_request( 'POST', '/hd-door-designer/v1/save', array(
		'email' => 'jo@example.com', 'hd_hp' => '', 'design' => hd_design(), 'flow' => 'designer3',
		'pageUrl' => 'https://example.test/door-designer/',
	) ) );
	return $res->get_data()['token'];
}
function hd_callback( $token, array $over = array() ) {
	$r = hd_test_request( 'POST', '/hd-door-designer/v1/save/' . $token . '/callback', array_merge( array( 'name' => 'Jo Bloggs', 'telephone' => '01234 567890', 'pageUrl' => 'https://example.test/door-designer/' ), $over ) );
	$r->set_param( 'token', $token );
	return hd_api()->rest_callback( $r );
}
function hd_row() { global $wpdb; return $wpdb->rows[0]; }

hd_test_reset();
$enq = 0; $cb = 0;
add_action( 'hd_dd_enquiry_submitted', function () use ( &$enq ) { $enq++; }, 10, 2 );
add_action( 'hd_dd_callback_requested', function () use ( &$cb ) { $cb++; }, 10, 2 );
$token = hd_save();
$GLOBALS['hd_test_mail'] = array();
$res = hd_callback( $token );
check( ! is_wp_error( $res ) && 201 === $res->get_status() && true === $res->get_data()['ok'] && ! empty( $res->get_data()['reference'] ), 'a valid request returns 201 with a reference' );
check( 'callback' === hd_row()['kind'] && '01234 567890' === hd_row()['customer_phone'] && 'Jo Bloggs' === hd_row()['customer_name'], 'row is a callback with the phone stored' );
$payload = json_decode( hd_row()['payload'], true );
check( 'callback' === $payload['kind'] && '01234 567890' === $payload['customer']['telephone'], 'payload carries kind and customer' );
check( isset( $payload['flow'] ) && 'designer3' === $payload['flow'], 'a Designer 3 row marks its payload flow designer3 (for the frame ids in the email)' );
$mail = $GLOBALS['hd_test_mail'];
check( 2 === count( $mail ), 'exactly two mails (got ' . count( $mail ) . ')' );
check( 0 === strpos( $mail[0]['subject'], 'New door enquiry ' ) && false !== strpos( $mail[0]['subject'], '— Jo Bloggs' ), 'owner subject keeps the enquiry format' );
check( 0 === strpos( $mail[0]['message'], 'Call back requested — 01234 567890' ), 'owner body leads with the call-back line' );
check( 0 === strpos( $mail[1]['subject'], 'Your Hertfordshire Doors design (' ) && 'jo@example.com' === $mail[1]['to'], 'customer subject and address' );
check( false === strpos( $mail[1]['message'], 'price is on its way' ) && false !== strpos( $mail[1]['message'], 'call back about your Ketu door' ) && false !== strpos( $mail[1]['message'], 'Thanks Jo.' ), 'customer ack copy' );
check( 0 === $enq && 1 === $cb, 'enquiry hook not fired, callback hook fired once' );

$enq_api = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
$dr = hd_test_request( 'GET', '/x', array() );
$dr->set_param( 'token', $token );
check( 'callback' === $enq_api->rest_get_design( $dr )->get_data()['kind'], 'the design endpoint reports kind callback' );

$res = hd_callback( $token );
check( is_wp_error( $res ) && 'hd_dd_already_enquiry' === $res->get_error_code() && 409 === $res->get_error_data()['status'], 'a second request is a 409' );
check( 1 === $cb && 2 === count( $GLOBALS['hd_test_mail'] ), 'and sends nothing more' );

hd_test_reset();
$token = hd_save();
$res = hd_callback( $token, array( 'telephone' => '' ) );
check( is_wp_error( $res ) && 'hd_dd_validation' === $res->get_error_code() && isset( $res->get_error_data()['fields']['telephone'] ), 'missing phone: 422 with fields.telephone' );
$res = hd_callback( $token, array( 'name' => '', 'telephone' => 'abc' ) );
check( is_wp_error( $res ) && isset( $res->get_error_data()['fields']['name'], $res->get_error_data()['fields']['telephone'] ), 'missing name and letters-only phone both flagged' );
check( 'save' === hd_row()['kind'], 'row stays a save after bad input' );

hd_test_reset();
$token = hd_save();
hd_api()->rest_quote( ( function () use ( $token ) { $r = hd_test_request( 'POST', '/x', array( 'name' => 'Jo', 'postcode' => 'AL1 1AA', 'telephone' => '' ) ); $r->set_param( 'token', $token ); return $r; } )() );
$res = hd_callback( $token );
check( is_wp_error( $res ) && 409 === $res->get_error_data()['status'], 'an enquiry row refuses a call back with 409' );

// A Swipe 2 row's quote payload is left without a flow key (its email is unchanged).
hd_test_reset();
$sw = hd_api()->rest_save( hd_test_request( 'POST', '/x', array( 'email' => 'jo@example.com', 'hd_hp' => '', 'design' => hd_design(), 'flow' => 'swipe2', 'pageUrl' => 'https://example.test/door-designer/' ) ) )->get_data()['token'];
hd_api()->rest_quote( ( function () use ( $sw ) { $r = hd_test_request( 'POST', '/x', array( 'name' => 'Jo', 'postcode' => 'AL1 1AA', 'telephone' => '' ) ); $r->set_param( 'token', $sw ); return $r; } )() );
check( ! array_key_exists( 'flow', json_decode( hd_row()['payload'], true ) ), 'a Swipe 2 quote payload has no flow key' );

// A price request on a call-back row is refused (409), never "your price is on its way".
hd_test_reset();
$token = hd_save();
hd_callback( $token );
$mails = count( $GLOBALS['hd_test_mail'] );
$res   = hd_api()->rest_quote( ( function () use ( $token ) { $r = hd_test_request( 'POST', '/x', array( 'name' => 'Jo', 'postcode' => 'AL1 1AA', 'telephone' => '' ) ); $r->set_param( 'token', $token ); return $r; } )() );
check( is_wp_error( $res ) && 'hd_dd_already_enquiry' === $res->get_error_code() && 409 === $res->get_error_data()['status'], 'a quote on a call-back row is a 409 (got ' . ( is_wp_error( $res ) ? $res->get_error_code() : $res->get_status() ) . ')' );
check( 'callback' === hd_row()['kind'] && $mails === count( $GLOBALS['hd_test_mail'] ), 'the row stays a call back and nothing more is sent' );

$res = hd_callback( 'doesnotexist12345' );
check( is_wp_error( $res ) && 404 === $res->get_error_data()['status'], 'unknown token: 404' );

hd_test_done( 'save-callback.test.php' );
