<?php
/**
 * Every enquiry POST that does NOT end in a stored enquiry is recorded as a
 * status=failed row (with whatever the customer typed, so they can be called back)
 * and emailed to the enquiry recipients — throttled per IP so a fumbling customer or
 * a bot can't flood the inbox.  Run: php tests/php/failure-log.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-failure-log.php';

const ENQUIRY_ROUTE = '/hd-door-designer/v1/enquiry';

function hd_test_body( array $overrides = array() ) {
	return array_merge(
		array(
			'consent'   => true,
			'name'      => 'Jo Bloggs',
			'email'     => 'jo@example.com',
			'telephone' => '07700 900000',
			'postcode'  => 'AL1',
			'design'    => array( 'Door Type' => array( 'label' => 'Single Door', 'id' => null ), 'Door Design' => array( 'label' => 'Ketu', 'id' => 12 ) ),
		),
		$overrides
	);
}
function hd_test_validation_error() {
	return hd_test_error_to_response( new WP_Error( 'hd_dd_validation', 'Please check the highlighted fields.', array( 'status' => 422, 'fields' => array( 'postcode' => 'Please enter a valid UK postcode.' ) ) ) );
}
function hd_test_nonce_error() {
	return hd_test_error_to_response( new WP_Error( 'rest_cookie_invalid_nonce', 'Cookie check failed', array( 'status' => 403 ) ) );
}
function hd_test_boot() {
	hd_test_reset();
	update_option( 'hd_dd_settings', array( 'recipient_email' => 'owner@example.test' ) );
	$log = new HD_DD_Failure_Log( new HD_DD_Repository() );
	$log->register();
	return $log;
}
/** Push a response through the hook exactly as WP_REST_Server does after dispatch. */
function hd_test_dispatch( $response, $request ) {
	return apply_filters( 'rest_post_dispatch', $response, null, $request );
}

// --- 1) A validation failure is stored with the customer's details and emailed ------
hd_test_boot();
$req = hd_test_request( 'POST', ENQUIRY_ROUTE, hd_test_body(), array( 'X-HD-DD-Attempt' => '1', 'User-Agent' => 'TestBrowser/1.0' ) );
$resp = hd_test_validation_error();
$out  = hd_test_dispatch( $resp, $req );
check( $out === $resp, 'response object passes through untouched' );
check( 1 === count( $wpdb->rows ), 'one failure row stored (got ' . count( $wpdb->rows ) . ')' );
$row = $wpdb->rows ? $wpdb->rows[0] : array();
check( isset( $row['status'] ) && 'failed' === $row['status'], 'row status is failed' );
check( isset( $row['reference'] ) && 0 === strpos( $row['reference'], 'HD-F-' ) && strlen( $row['reference'] ) <= 32, 'failure reference is HD-F-… and fits the column' );
check( array_key_exists( 'token', $row ) && null === $row['token'], 'no reload token for a failure' );
check( isset( $row['customer_name'] ) && 'Jo Bloggs' === $row['customer_name'], 'name kept so the customer can be called back' );
check( isset( $row['customer_email'] ) && 'jo@example.com' === $row['customer_email'], 'email kept' );
check( isset( $row['customer_phone'] ) && '07700 900000' === $row['customer_phone'], 'phone kept' );
check( isset( $row['customer_postcode'] ) && 'AL1' === $row['customer_postcode'], 'postcode kept even though invalid' );
check( isset( $row['source_ip'] ) && '203.0.113.5' === $row['source_ip'], 'source ip kept' );
$design = isset( $row['design'] ) ? json_decode( $row['design'], true ) : null;
check( is_array( $design ) && isset( $design['Door Design']['label'] ) && 'Ketu' === $design['Door Design']['label'], 'design kept as submitted' );
$payload = isset( $row['payload'] ) ? json_decode( $row['payload'], true ) : null;
check( is_array( $payload ) && isset( $payload['failure']['code'] ) && 'hd_dd_validation' === $payload['failure']['code'], 'payload records the error code' );
check( is_array( $payload ) && isset( $payload['failure']['status'] ) && 422 === $payload['failure']['status'], 'payload records the HTTP status' );
check( is_array( $payload ) && isset( $payload['failure']['message'] ) && 'Please check the highlighted fields.' === $payload['failure']['message'], 'payload records the message' );
check( is_array( $payload ) && isset( $payload['failure']['fields']['postcode'] ), 'payload records the per-field errors' );
check( is_array( $payload ) && isset( $payload['request']['userAgent'] ) && 'TestBrowser/1.0' === $payload['request']['userAgent'], 'payload records the user agent' );
check( is_array( $payload ) && isset( $payload['request']['attempt'] ) && '1' === $payload['request']['attempt'], 'payload records the attempt number' );

$mail = $GLOBALS['hd_test_mail'];
check( 1 === count( $mail ), 'one failure email sent (got ' . count( $mail ) . ')' );
check( $mail && 'owner@example.test' === $mail[0]['to'], 'sent to the enquiry recipients' );
check( $mail && false !== strpos( $mail[0]['subject'], 'FAILED' ) && false !== strpos( $mail[0]['subject'], 'Jo Bloggs' ), 'subject says FAILED and names the customer (got "' . ( $mail ? $mail[0]['subject'] : '' ) . '")' );
check( $mail && false !== strpos( $mail[0]['message'], '07700 900000' ) && false !== strpos( $mail[0]['message'], 'jo@example.com' ), 'body carries the contact details' );
check( $mail && false !== strpos( $mail[0]['message'], 'Please enter a valid UK postcode.' ), 'body carries the reason' );
check( $mail && false !== strpos( $mail[0]['message'], 'Ketu' ), 'body carries the design' );
check( false !== strpos( hd_test_error_log(), 'hd_dd_validation' ), 'a line went to the PHP error log' );

// --- 2) Same IP again within the window: stored, but NOT emailed again ----------------
$req2 = hd_test_request( 'POST', ENQUIRY_ROUTE, hd_test_body( array( 'postcode' => 'AL' ) ), array( 'X-HD-DD-Attempt' => '1' ) );
hd_test_dispatch( hd_test_validation_error(), $req2 );
check( 2 === count( $wpdb->rows ), 'second failure stored' );
check( 1 === count( $GLOBALS['hd_test_mail'] ), 'second failure from the same IP within 10 minutes is not emailed' );

// --- 3) Different IP: emailed ---------------------------------------------------------
$_SERVER['REMOTE_ADDR'] = '198.51.100.9';
hd_test_dispatch( hd_test_validation_error(), hd_test_request( 'POST', ENQUIRY_ROUTE, hd_test_body(), array( 'X-HD-DD-Attempt' => '1' ) ) );
check( 3 === count( $wpdb->rows ), 'third failure stored' );
check( 2 === count( $GLOBALS['hd_test_mail'] ), 'a different IP is emailed' );

// --- 4) Same IP after the throttle window has passed: emailed again ---------------------
$GLOBALS['hd_test_transients'] = array();
hd_test_dispatch( hd_test_validation_error(), hd_test_request( 'POST', ENQUIRY_ROUTE, hd_test_body(), array( 'X-HD-DD-Attempt' => '1' ) ) );
check( 3 === count( $GLOBALS['hd_test_mail'] ), 'emailed again once the throttle window has passed' );

// --- 5) Nonce failures: only the UI's retry (attempt 2) counts ---------------------------
hd_test_boot();
hd_test_dispatch( hd_test_nonce_error(), hd_test_request( 'POST', ENQUIRY_ROUTE, hd_test_body(), array( 'X-HD-DD-Attempt' => '1' ) ) );
check( 0 === count( $wpdb->rows ), 'a first-attempt nonce failure is not recorded (the client refreshes + retries)' );
hd_test_dispatch( hd_test_nonce_error(), hd_test_request( 'POST', ENQUIRY_ROUTE, hd_test_body() ) );
check( 0 === count( $wpdb->rows ), 'a nonce failure without the attempt header (not our UI) is not recorded' );
hd_test_dispatch( hd_test_nonce_error(), hd_test_request( 'POST', ENQUIRY_ROUTE, hd_test_body(), array( 'X-HD-DD-Attempt' => '2' ) ) );
check( 1 === count( $wpdb->rows ), 'a nonce failure on the retry IS recorded' );
$payload = $wpdb->rows ? json_decode( $wpdb->rows[0]['payload'], true ) : null;
check( is_array( $payload ) && 'rest_cookie_invalid_nonce' === $payload['failure']['code'], 'nonce failure code recorded' );
check( 1 === count( $GLOBALS['hd_test_mail'] ), 'nonce failure on retry is emailed' );

// --- 6) Not a failure / not our endpoint: nothing recorded ------------------------------
hd_test_boot();
hd_test_dispatch( new WP_REST_Response( array( 'ok' => true, 'reference' => 'HD-2026-000040' ), 201 ), hd_test_request( 'POST', ENQUIRY_ROUTE, hd_test_body(), array( 'X-HD-DD-Attempt' => '1' ) ) );
check( 0 === count( $wpdb->rows ), 'a successful enquiry is not recorded as a failure' );
hd_test_dispatch( hd_test_error_to_response( new WP_Error( 'rest_no_route', 'No route', array( 'status' => 404 ) ) ), hd_test_request( 'GET', '/hd-door-designer/v1/catalogue' ) );
check( 0 === count( $wpdb->rows ), 'errors on other routes are ignored' );
hd_test_dispatch( hd_test_validation_error(), hd_test_request( 'GET', ENQUIRY_ROUTE ) );
check( 0 === count( $wpdb->rows ), 'non-POST on the enquiry route is ignored' );
check( 0 === count( $GLOBALS['hd_test_mail'] ), 'no emails for non-failures' );

// --- 7) Robustness: unreadable body, missing fields, oversized image ---------------------
hd_test_boot();
$broken = hd_test_request( 'POST', ENQUIRY_ROUTE, '{not json', array( 'X-HD-DD-Attempt' => '1' ) );
$out    = hd_test_dispatch( hd_test_error_to_response( new WP_Error( 'hd_dd_no_consent', 'Please agree to be contacted about your enquiry.', array( 'status' => 422 ) ) ), $broken );
check( 422 === $out->get_status(), 'response still returned for an unreadable body' );
check( 1 === count( $wpdb->rows ) && '' === $wpdb->rows[0]['customer_name'], 'failure recorded with empty customer fields' );

hd_test_boot();
$with_image = hd_test_body( array( 'image' => 'data:image/png;base64,' . str_repeat( 'A', 200000 ) ) );
hd_test_dispatch( hd_test_error_to_response( new WP_Error( 'hd_dd_save_failed', 'Sorry, we could not save your enquiry. Please try again.', array( 'status' => 500 ) ) ), hd_test_request( 'POST', ENQUIRY_ROUTE, $with_image, array( 'X-HD-DD-Attempt' => '1' ) ) );
$row = $wpdb->rows ? $wpdb->rows[0] : array();
check( isset( $row['payload'] ) && strlen( $row['payload'] ) < 20000, 'the image data-URL is not stored in the failure row' );
$payload = isset( $row['payload'] ) ? json_decode( $row['payload'], true ) : null;
check( is_array( $payload ) && ! empty( $payload['request']['hadImage'] ), 'but the row notes an image was attached' );
check( is_array( $payload ) && 'hd_dd_save_failed' === $payload['failure']['code'], 'a database save failure is recorded too' );

hd_test_done( 'failure-log.test.php' );
