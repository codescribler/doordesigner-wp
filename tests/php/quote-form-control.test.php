<?php
/**
 * The classic flow is the A/B control: it posts the ORIGINAL quote form (form=quote) and
 * keeps the original rules and wording — telephone and a consent tick required, the
 * original customer email. The swipe flow's save form is unaffected.
 * Run: php tests/php/quote-form-control.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_test_quote( array $overrides = array(), array $remove = array() ) {
	$enq  = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
	$body = array_merge(
		array(
			'form'      => 'quote',
			'hd_hp'     => '',
			'consent'   => true,
			'name'      => 'Real Customer',
			'email'     => 'real@example.com',
			'telephone' => '01234 567890',
			'postcode'  => 'AL1 1AA',
			'design'    => array(
				'Door Type'              => array( 'label' => 'Single Door', 'id' => null ),
				'Door Design'            => array( 'label' => 'Ketu', 'id' => 12 ),
				'Door Colour (External)' => array( 'label' => 'Anthracite Grey', 'id' => 3 ),
			),
			'pageUrl'   => 'https://example.test/door-designer/',
		),
		$overrides
	);
	foreach ( $remove as $k ) {
		unset( $body[ $k ] );
	}
	return $enq->rest_submit( hd_test_request( 'POST', '/hd-door-designer/v1/enquiry', $body ) );
}

// --- 1) A complete quote request saves, exactly as it always did ------------------------
hd_test_reset();
$res = hd_test_quote();
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'a complete quote request is accepted' );
check( 'Thank you — your design has been sent. We will be in touch shortly.' === $res->get_data()['message'], 'original success message' );
check( 1 === count( $wpdb->rows ) && '01234 567890' === $wpdb->rows[0]['customer_phone'], 'row stored with the phone' );
check( 'Ketu in Anthracite Grey' === $wpdb->rows[0]['design_name'], 'the row still gets a default design name' );
$mail = $GLOBALS['hd_test_mail'];
check( 2 === count( $mail ), 'owner notification and customer email both sent' );
check( 0 === strpos( $mail[0]['subject'], 'New door enquiry HD-' ), 'owner subject unchanged' );
check( 1 === preg_match( '/^Your Hertfordshire Doors design \(HD-\d{4}-\d{6}\)$/', $mail[1]['subject'] ), 'customer subject is the original (got "' . $mail[1]['subject'] . '")' );
check( false !== strpos( $mail[1]['message'], 'Revisit or tweak this design' ), 'customer button is the original' );
check( false !== strpos( $mail[1]['message'], 'free, no-obligation quote' ), 'customer intro is the original' );
check( false === strpos( $mail[1]['message'], 'is saved' ) && false === strpos( $mail[1]['message'], 'Open my design' ), 'none of the save-form wording in the control email' );

// --- 2) The original rules: consent and a telephone number are required -----------------
hd_test_reset();
$res = hd_test_quote( array(), array( 'consent' ) );
check( is_wp_error( $res ) && 'hd_dd_no_consent' === $res->get_error_code(), 'no consent tick → rejected as before' );
check( 0 === count( $wpdb->rows ), 'nothing stored without consent' );

hd_test_reset();
$res = hd_test_quote( array( 'telephone' => '' ) );
check( is_wp_error( $res ) && 'hd_dd_validation' === $res->get_error_code(), 'no telephone → validation error as before' );
$fields = is_wp_error( $res ) ? $res->get_error_data()['fields'] : array();
check( isset( $fields['telephone'] ) && 'Please enter a contact number.' === $fields['telephone'], 'the error names the telephone field with the original wording' );

// --- 3) The swipe save form (no form=quote) is unaffected -------------------------------
hd_test_reset();
$res = hd_test_quote( array( 'designName' => 'Front door option 1' ), array( 'form', 'consent', 'telephone' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'a save with no phone and no consent still works' );
$mail = $GLOBALS['hd_test_mail'];
check( 0 === strpos( $mail[1]['subject'], 'Your saved door design: Front door option 1 (HD-' ), 'save-form customer email keeps its own subject' );
check( false !== strpos( $mail[1]['message'], 'Open my design' ), 'save-form customer email keeps its own button' );

// --- 4) A pre-0.3 cached script (consent + phone, no "form") still saves ------------------
hd_test_reset();
$res = hd_test_quote( array(), array( 'form' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'old cached script still saves' );

hd_test_done( 'quote-form-control.test.php' );
