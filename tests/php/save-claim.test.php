<?php
/**
 * The quote request claims a save atomically, writes are checked, and token-route failures
 * are logged only when a customer could be lost.  Run: php tests/php/save-claim.test.php
 */
require __DIR__ . '/experiment-helpers.php';
require_once HD_DD_DIR . 'includes/class-hd-failure-log.php';

/** Repository whose reads and writes can be rigged. */
class HD_Rigged_Repo extends HD_DD_Repository {
	public $claim_result    = null; // null = real; otherwise returned as is.
	public $update_result   = null;
	public $flip_after_read = false;
	public function get_by_token( $token ) {
		$row = parent::get_by_token( $token );
		if ( $row && $this->flip_after_read ) {
			global $wpdb;
			$wpdb->rows[0]['kind'] = 'enquiry'; // someone else got there between read and write.
		}
		return $row;
	}
	public function claim_as_enquiry( $id, array $fields ) {
		return null === $this->claim_result ? parent::claim_as_enquiry( $id, $fields ) : $this->claim_result;
	}
	public function update_row( $id, array $fields, $only_kind = null ) {
		return null === $this->update_result ? parent::update_row( $id, $fields, $only_kind ) : $this->update_result;
	}
}

function hd_design( $colour = 'Sage' ) {
	return array(
		'Door Type'              => array( 'label' => 'Single Door', 'id' => null ),
		'Door Design'            => array( 'label' => 'Ketu', 'id' => 12 ),
		'Door Colour (External)' => array( 'label' => $colour, 'id' => 3 ),
	);
}
function hd_api( $repo = null ) {
	$repo = $repo ? $repo : new HD_DD_Repository();
	return new HD_DD_Save( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
}
function hd_req( $token, $suffix, array $body ) {
	$r = hd_test_request( 'POST', '/hd-door-designer/v1/save/' . $token . $suffix, $body );
	$r->set_param( 'token', $token );
	return $r;
}
function hd_new_save() {
	$res = hd_api()->rest_save( hd_test_request( 'POST', '/hd-door-designer/v1/save', array( 'email' => 'jo@example.com', 'design' => hd_design(), 'flow' => 'swipe2' ) ) );
	return $res->get_data();
}
function hd_q( $api, $token, array $over = array() ) {
	return $api->rest_quote( hd_req( $token, '/quote', array_merge( array( 'name' => 'Jo Bloggs', 'postcode' => 'AL1 1AA', 'telephone' => '' ), $over ) ) );
}
function hd_rows() { global $wpdb; return $wpdb->rows; }

// (c) Repository claim
hd_test_reset();
$save = hd_new_save();
$repo = new HD_DD_Repository();
$id   = hd_rows()[0]['id'];
check( 1 === $repo->claim_as_enquiry( $id, array( 'customer_name' => 'Jo', 'customer_postcode' => 'AL1 1AA' ) ), 'claiming a save affects one row' );
check( 'enquiry' === hd_rows()[0]['kind'] && 'Jo' === hd_rows()[0]['customer_name'], 'kind is set and the fields are written' );
check( 0 === $repo->claim_as_enquiry( $id, array( 'customer_name' => 'Other' ) ) && 'Jo' === hd_rows()[0]['customer_name'], 'claiming an enquiry affects nothing and writes nothing' );
check( 0 === $repo->update_row( $id, array( 'design_name' => 'x' ), 'save' ) && 'x' !== hd_rows()[0]['design_name'], 'a guarded update does not touch an enquiry' );

// (a) Lost race: no emails, no hook, still ok
hd_test_reset();
$conv = 0;
add_action( 'hd_dd_enquiry_submitted', function () use ( &$conv ) { $conv++; }, 10, 2 );
$save = hd_new_save();
$mails = count( $GLOBALS['hd_test_mail'] );
$repo  = new HD_Rigged_Repo();
$repo->flip_after_read = true;
$res = hd_q( hd_api( $repo ), $save['token'] );
check( ! is_wp_error( $res ) && ! empty( $res->get_data()['ok'] ), 'a lost race still answers ok' );
check( 0 === $conv && $mails === count( $GLOBALS['hd_test_mail'] ), 'and sends no emails and fires no hook' );

// (b) Failed claim: 500, nothing sent
hd_test_reset();
$conv = 0;
add_action( 'hd_dd_enquiry_submitted', function () use ( &$conv ) { $conv++; }, 10, 2 );
$save = hd_new_save();
$mails = count( $GLOBALS['hd_test_mail'] );
$repo  = new HD_Rigged_Repo();
$repo->claim_result = false;
$res = hd_q( hd_api( $repo ), $save['token'] );
check( is_wp_error( $res ) && 500 === $res->get_error_data()['status'], 'a failed claim is a 500' );
check( 0 === $conv && $mails === count( $GLOBALS['hd_test_mail'] ) && 'save' === hd_rows()[0]['kind'], 'nothing sent, row still a save' );

// (d) Caps
hd_test_reset();
$save = hd_new_save();
hd_q( hd_api(), $save['token'], array( 'name' => str_repeat( 'n', 250 ), 'postcode' => 'AL1   1AA' ) );
check( 190 === strlen( hd_rows()[0]['customer_name'] ) && 'AL1 1AA' === hd_rows()[0]['customer_postcode'], 'name is cut to 190, postcode whitespace collapsed' );

// (e) rest_update write checks, and the 409 branch
hd_test_reset();
$save = hd_new_save();
$repo = new HD_Rigged_Repo();
$repo->update_result = false;
$res = hd_api( $repo )->rest_update( hd_req( $save['token'], '', array( 'design' => hd_design( 'Rich Red' ) ) ) );
check( is_wp_error( $res ) && 500 === $res->get_error_data()['status'], 'a failed update write is a 500' );
$repo->update_result = 0;
$res = hd_api( $repo )->rest_update( hd_req( $save['token'], '', array( 'design' => hd_design( 'Rich Red' ) ) ) );
check( ! is_wp_error( $res ) && 200 === $res->get_status(), 'an unchanged row (0) is not a failure' );
hd_q( hd_api(), $save['token'] );
$before = hd_rows()[0]['design'];
$res = hd_api()->rest_update( hd_req( $save['token'], '', array( 'design' => hd_design( 'Rich Red' ) ) ) );
check( is_wp_error( $res ) && 409 === $res->get_error_data()['status'] && 'hd_dd_already_enquiry' === $res->get_error_code(), 'update after quote is a 409' );
check( $before === hd_rows()[0]['design'], 'and writes nothing' );
// The row becomes an enquiry between read and write: the guarded write does nothing.
hd_test_reset();
$save = hd_new_save();
$repo = new HD_Rigged_Repo();
$repo->flip_after_read = true;
$res = hd_api( $repo )->rest_update( hd_req( $save['token'], '', array( 'design' => hd_design( 'Rich Red' ) ) ) );
check( false === strpos( hd_rows()[0]['design'], 'Rich Red' ), 'update never writes to a row that became an enquiry' );
check( is_wp_error( $res ) && 409 === $res->get_error_data()['status'] && 'hd_dd_already_enquiry' === $res->get_error_code(), 'and says so (409), not ok' );

// (e2) The picture: stored only after the row is known to still be a save (B6)
function hd_png( $tag ) { return 'data:image/png;base64,' . base64_encode( "\x89PNG\r\n\x1a\n" . $tag ); }
function hd_png_file( $reference ) { return wp_upload_dir()['basedir'] . '/hd-door-designer/enquiries/' . $reference . '.png'; }
function hd_save_with_picture() {
	$res = hd_api()->rest_save( hd_test_request( 'POST', '/hd-door-designer/v1/save', array( 'email' => 'jo@example.com', 'design' => hd_design(), 'flow' => 'swipe2', 'image' => hd_png( 'first' ) ) ) );
	return $res->get_data();
}
hd_test_reset();
$save = hd_save_with_picture();
$file = hd_png_file( $save['reference'] );
check( is_file( $file ) && false !== strpos( file_get_contents( $file ), 'first' ), 'the save stores its picture' );
// A normal update replaces the picture and keeps its address in the payload.
$res = hd_api()->rest_update( hd_req( $save['token'], '', array( 'design' => hd_design( 'Rich Red' ), 'image' => hd_png( 'second' ) ) ) );
check( ! is_wp_error( $res ) && 200 === $res->get_status(), 'an update with a picture is accepted' );
check( false !== strpos( file_get_contents( $file ), 'second' ), 'the picture follows the door' );
$payload = json_decode( hd_rows()[0]['payload'], true );
check( ! empty( $payload['image'] ) && false !== strpos( $payload['image'], $save['reference'] . '.png' ) && 'Rich Red' === $payload['design']['Door Colour (External)']['label'], 'payload has the picture address and the new design' );
// The row became an enquiry between read and write: its picture is not replaced.
$repo = new HD_Rigged_Repo();
$repo->flip_after_read = true;
$res  = hd_api( $repo )->rest_update( hd_req( $save['token'], '', array( 'design' => hd_design( 'Sage' ), 'image' => hd_png( 'third' ) ) ) );
check( is_wp_error( $res ) && 409 === $res->get_error_data()['status'], 'a losing update is a 409' );
check( false !== strpos( file_get_contents( $file ), 'second' ), 'and never replaces the picture of an enquiry' );
check( false !== strpos( hd_rows()[0]['design'], 'Rich Red' ), 'or its design' );
// A failed write: 500, and the picture is not replaced either.
hd_test_reset();
$save = hd_save_with_picture();
$file = hd_png_file( $save['reference'] );
$repo = new HD_Rigged_Repo();
$repo->update_result = false;
$res  = hd_api( $repo )->rest_update( hd_req( $save['token'], '', array( 'design' => hd_design( 'Rich Red' ), 'image' => hd_png( 'second' ) ) ) );
check( is_wp_error( $res ) && 500 === $res->get_error_data()['status'], 'a database error is a 500' );
check( false !== strpos( file_get_contents( $file ), 'first' ), 'and the picture is left alone' );

// (f) Failure log on token routes
function hd_fail( $route, $response, array $body ) {
	$log = new HD_DD_Failure_Log( new HD_DD_Repository() );
	$log->maybe_record( $response, null, hd_test_request( 'POST', '/hd-door-designer/v1' . $route, $body ) );
}
hd_test_reset();
$save = hd_new_save();
$tok  = $save['token'];
$base = count( hd_rows() );
hd_fail( '/save/unknowntoken12/quote', hd_test_error_to_response( hd_q( hd_api(), 'unknowntoken12' ) ), array( 'name' => 'x' ) );
check( count( hd_rows() ) === $base, 'a 404 on a token route records nothing' );
hd_q( hd_api(), $tok );
$r409 = hd_test_error_to_response( hd_api()->rest_update( hd_req( $tok, '', array( 'design' => hd_design() ) ) ) );
hd_fail( '/save/' . $tok, $r409, array( 'design' => hd_design() ) );
check( count( hd_rows() ) === $base, 'a 409 on a token route records nothing' );

hd_test_reset();
$save = hd_new_save();
$tok  = $save['token'];
$r422 = hd_test_error_to_response( hd_q( hd_api(), $tok, array( 'postcode' => 'nope' ) ) );
hd_fail( '/save/' . $tok . '/quote', $r422, array( 'name' => 'Jo', 'postcode' => 'nope' ) );
$rows = hd_rows();
check( 2 === count( $rows ) && 'failed' === $rows[1]['status'], 'a quote 422 records a failed row' );
check( 'jo@example.com' === $rows[1]['customer_email'] && false !== strpos( $rows[1]['payload'], $save['reference'] ), 'carrying the saver email and reference' );
check( false !== strpos( end( $GLOBALS['hd_test_mail'] )['message'], 'jo@example.com' ), 'and the owner email shows who it was' );

// A failed background design update is not a lost customer: nothing is recorded or emailed (B5).
hd_test_reset();
$save  = hd_new_save();
$tok   = $save['token'];
$base  = count( hd_rows() );
$mails = count( $GLOBALS['hd_test_mail'] );
$r422  = hd_test_error_to_response( hd_api()->rest_update( hd_req( $tok, '', array( 'design' => array() ) ) ) );
check( 422 === $r422->get_status(), 'an update without a design is a 422' );
hd_fail( '/save/' . $tok, $r422, array( 'design' => array() ) );
check( count( hd_rows() ) === $base, 'an update 422 records nothing' );
$repo = new HD_Rigged_Repo();
$repo->update_result = false;
$r500 = hd_test_error_to_response( hd_api( $repo )->rest_update( hd_req( $tok, '', array( 'design' => hd_design( 'Rich Red' ) ) ) ) );
check( 500 === $r500->get_status(), 'a failed update write is a 500' );
hd_fail( '/save/' . $tok, $r500, array( 'design' => hd_design( 'Rich Red' ) ) );
check( count( hd_rows() ) === $base && $mails === count( $GLOBALS['hd_test_mail'] ), 'an update 500 records nothing and emails nobody' );
check( '' === hd_test_error_log(), 'and writes no FAILED line to the log' );

hd_test_reset();
$r = hd_test_error_to_response( hd_api()->rest_save( hd_test_request( 'POST', '/hd-door-designer/v1/save', array( 'email' => 'bad', 'design' => hd_design() ) ) ) );
hd_fail( '/save', $r, array( 'email' => 'bad', 'design' => hd_design() ) );
check( 1 === count( hd_rows() ) && 'failed' === hd_rows()[0]['status'], 'a /save 422 still records' );

hd_test_done( 'save-claim.test.php' );
