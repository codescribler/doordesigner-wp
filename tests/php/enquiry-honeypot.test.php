<?php
/**
 * A filled honeypot must NEVER lose a customer. Browser/password-manager autofill
 * fills the off-screen field for real people, so a hit is stored + emailed like any
 * other enquiry, just flagged for a second look.  Run: php tests/php/enquiry-honeypot.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_test_submit( array $overrides = array() ) {
	global $wpdb;
	$repo = new HD_DD_Repository();
	$enq  = new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() );
	$body = array_merge(
		array(
			'hd_hp'     => '',
			'consent'   => true,
			'name'      => 'Real Customer',
			'email'     => 'real@example.com',
			'telephone' => '01234 567890',
			'postcode'  => 'AL1 1AA',
			'design'    => array(
				'Door Type'   => array( 'label' => 'Single Door', 'id' => null ),
				'Door Design' => array( 'label' => 'Ketu', 'id' => 12 ),
			),
			'pageUrl'   => 'https://example.test/door-designer/',
		),
		$overrides
	);
	return $enq->rest_submit( hd_test_request( 'POST', '/hd-door-designer/v1/enquiry', $body ) );
}

// --- 1) Honeypot filled (as autofill does): accepted, STORED, flagged, emailed ------
hd_test_reset();
$res = hd_test_submit( array( 'hd_hp' => 'autofilled value' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'honeypot submission is accepted with 201' );
$data = is_wp_error( $res ) ? array() : $res->get_data();
check( ! empty( $data['ok'] ), 'response ok' );
check( isset( $data['reference'] ) && preg_match( '/^HD-\d{4}-\d{6}$/', $data['reference'] ), 'gets a real reference, not HD-IGNORED (got ' . ( isset( $data['reference'] ) ? $data['reference'] : 'none' ) . ')' );
check( ! empty( $data['token'] ), 'gets a reload token like any enquiry' );

check( 1 === count( $wpdb->rows ), 'exactly one row stored (got ' . count( $wpdb->rows ) . ')' );
$row = $wpdb->rows ? $wpdb->rows[0] : array();
check( isset( $row['status'] ) && 'flagged' === $row['status'], 'row status is flagged' );
check( isset( $row['customer_name'] ) && 'Real Customer' === $row['customer_name'], 'customer details stored' );
$payload = isset( $row['payload'] ) ? json_decode( $row['payload'], true ) : null;
check( is_array( $payload ) && isset( $payload['flags'] ) && in_array( 'honeypot', $payload['flags'], true ), 'payload carries the honeypot flag' );
check( is_array( $payload ) && isset( $payload['design']['Door Design']['label'] ) && 'Ketu' === $payload['design']['Door Design']['label'], 'payload carries the design' );

$mail = $GLOBALS['hd_test_mail'];
check( count( $mail ) >= 1, 'notification email sent' );
check( $mail && 0 === strpos( $mail[0]['subject'], '[Possible bot] New door enquiry HD-' ), 'notification subject is marked as a possible bot (got "' . ( $mail ? $mail[0]['subject'] : '' ) . '")' );
check( $mail && false !== strpos( $mail[0]['message'], 'FLAGGED' ), 'notification body explains the flag' );
check( $mail && false !== strpos( $mail[0]['message'], 'autofill' ), 'notification body says autofill is the usual cause' );
check( 2 === count( $mail ) && 'real@example.com' === $mail[1]['to'], 'customer acknowledgement still sent' );

// --- 2) Clean submission: unchanged behaviour (status new, plain subject) -----------
hd_test_reset();
$res = hd_test_submit();
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'clean submission accepted' );
$row = $wpdb->rows ? $wpdb->rows[0] : array();
check( isset( $row['status'] ) && 'new' === $row['status'], 'clean row status is new' );
$payload = isset( $row['payload'] ) ? json_decode( $row['payload'], true ) : null;
check( is_array( $payload ) && ! isset( $payload['flags'] ), 'clean payload has no flags key' );
$mail = $GLOBALS['hd_test_mail'];
check( $mail && 0 === strpos( $mail[0]['subject'], 'New door enquiry HD-' ), 'clean subject has no marker' );
check( $mail && false === strpos( $mail[0]['message'], 'FLAGGED' ), 'clean body has no flag text' );

// --- 3) Honeypot filled but details invalid: still a normal validation error --------
hd_test_reset();
$res = hd_test_submit( array( 'hd_hp' => 'x', 'postcode' => 'nope' ) );
check( is_wp_error( $res ) && 'hd_dd_validation' === $res->get_error_code(), 'invalid details are rejected the normal way even when flagged' );
check( 0 === count( $wpdb->rows ), 'nothing stored for an invalid submission' );

hd_test_done( 'enquiry-honeypot.test.php' );
