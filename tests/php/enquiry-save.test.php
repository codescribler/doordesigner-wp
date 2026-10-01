<?php
/**
 * "Save my design & get my price": name, email and postcode are required; phone and the
 * old consent tick are not; every save carries a design name (the customer's, or a
 * default built from the door).  Run: php tests/php/enquiry-save.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_test_save( array $overrides = array(), array $remove = array() ) {
	$enq  = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
	$body = array_merge(
		array(
			'hd_hp'      => '',
			'designName' => 'Front door option 1',
			'name'       => 'Real Customer',
			'email'      => 'real@example.com',
			'postcode'   => 'AL1 1AA',
			'design'     => array(
				'Door Type'              => array( 'label' => 'Single Door', 'id' => null ),
				'Door Design'            => array( 'label' => 'Ketu', 'id' => 12 ),
				'Door Colour (External)' => array( 'label' => 'Anthracite Grey ', 'id' => 3 ),
			),
			'pageUrl'    => 'https://example.test/door-designer/',
		),
		$overrides
	);
	foreach ( $remove as $k ) {
		unset( $body[ $k ] );
	}
	return $enq->rest_submit( hd_test_request( 'POST', '/hd-door-designer/v1/enquiry', $body ) );
}
function hd_test_last_row() {
	global $wpdb;
	return $wpdb->rows ? $wpdb->rows[ count( $wpdb->rows ) - 1 ] : array();
}

// --- 1) No phone, no consent: saved ---------------------------------------------------
hd_test_reset();
$res = hd_test_save();
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'a save with no phone and no consent tick is accepted' );
$row = hd_test_last_row();
check( isset( $row['customer_phone'] ) && '' === $row['customer_phone'], 'phone stored empty' );
check( isset( $row['design_name'] ) && 'Front door option 1' === $row['design_name'], 'design name stored on the row' );
$payload = isset( $row['payload'] ) ? json_decode( $row['payload'], true ) : array();
check( isset( $payload['designName'] ) && 'Front door option 1' === $payload['designName'], 'payload carries designName' );
check( isset( $payload['customer'] ) && array_key_exists( 'telephone', $payload['customer'] ) && '' === $payload['customer']['telephone'], 'payload keeps customer.telephone as an empty string' );
check( isset( $payload['design']['Door Design']['label'] ) && 'Ketu' === $payload['design']['Door Design']['label'], 'design headings unchanged' );
check( ! empty( $res->get_data()['token'] ), 'response still carries the reload token' );

// --- 2) Name, email and postcode are still required -------------------------------------
foreach ( array( 'name' => '', 'email' => 'not-an-email', 'postcode' => 'nope' ) as $field => $bad ) {
	hd_test_reset();
	$res = hd_test_save( array( $field => $bad ) );
	check( is_wp_error( $res ) && 'hd_dd_validation' === $res->get_error_code(), "a bad $field is rejected" );
	$fields = is_wp_error( $res ) ? $res->get_error_data()['fields'] : array();
	check( isset( $fields[ $field ] ) && ! isset( $fields['telephone'] ), "the error names $field and never the phone" );
	check( array() === hd_test_last_row(), "nothing stored for a bad $field" );
}

// --- 3) Design name: blank, whitespace, too long, markup ------------------------------
hd_test_reset();
hd_test_save( array( 'designName' => '' ) );
check( 'Ketu in Anthracite Grey' === hd_test_last_row()['design_name'], 'blank name → default from the door (got "' . hd_test_last_row()['design_name'] . '")' );

hd_test_reset();
hd_test_save( array( 'designName' => "   \t " ) );
check( 'Ketu in Anthracite Grey' === hd_test_last_row()['design_name'], 'whitespace-only name → default' );

hd_test_reset();
$res = hd_test_save( array( 'designName' => str_repeat( 'é', 200 ) ) );
check( ! is_wp_error( $res ), 'an over-long name is accepted, not rejected' );
check( 80 === mb_strlen( hd_test_last_row()['design_name'] ), 'over-long name cut to 80 characters (got ' . mb_strlen( hd_test_last_row()['design_name'] ) . ')' );

hd_test_reset();
hd_test_save( array( 'designName' => '<b>Garage</b> door' ) );
check( 'Garage door' === hd_test_last_row()['design_name'], 'markup stripped from the name' );

check( 'Ketu' === HD_DD_Enquiry::default_design_name( array( 'Door Design' => array( 'label' => 'Ketu' ) ) ), 'default with no colour is just the design' );
check( 'Avantal 1 in Black' === HD_DD_Enquiry::default_design_name( array( 'Door Style' => array( 'label' => 'Avantal 1' ), 'Door Colour' => array( 'label' => 'Black' ) ) ), 'default uses Door Style / Door Colour when those are the headings' );
check( 'My door' === HD_DD_Enquiry::default_design_name( array() ), 'default with no design at all' );

// --- 4) Phone that is not a number: saved, phone empty ----------------------------------
hd_test_reset();
$res = hd_test_save( array( 'telephone' => 'call me after six' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'junk in the phone box does not block the save' );
check( '' === hd_test_last_row()['customer_phone'], 'junk phone stored empty' );

hd_test_reset();
hd_test_save( array( 'telephone' => '01234 567890' ) );
check( '01234 567890' === hd_test_last_row()['customer_phone'], 'a real phone number is still stored' );

// --- 5) A cached copy of the OLD script: consent + phone, no designName -----------------
hd_test_reset();
$res = hd_test_save( array( 'consent' => true, 'telephone' => '01234 567890' ), array( 'designName' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'old-script submission still saves' );
check( 'Ketu in Anthracite Grey' === hd_test_last_row()['design_name'], 'old-script submission gets the default name' );

// --- 6) Still an enquiry: both emails, the hook, the schema version ------------------------
hd_test_reset();
$fired = 0;
add_action( 'hd_dd_enquiry_submitted', function () use ( &$fired ) { $fired++; }, 10, 2 );
hd_test_save();
check( 1 === $fired, 'hd_dd_enquiry_submitted fires once (A/B conversions keep counting)' );
check( 2 === count( $GLOBALS['hd_test_mail'] ), 'owner notification and customer email both sent' );
check( '3' === HD_DD_Repository::DB_VERSION, 'schema version bumped so the design_name column is added on update' );

hd_test_done( 'enquiry-save.test.php' );
