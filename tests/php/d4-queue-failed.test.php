<?php
/**
 * Designer 4: when a manager event cannot be stored on the queue, the lead is never lost
 * silently. The owner's email says to add it by hand, and every failure is logged.
 * Run: php tests/php/d4-queue-failed.test.php
 */
require __DIR__ . '/d4-helpers.php';

/** A $wpdb whose manager queue refuses every insert. */
class HD_Test_No_Queue_WPDB extends HD_Test_D4_WPDB {
	public function insert( $table, $data, $format = null ) {
		return 'wp_hd_dd_manager_queue' === $table ? false : parent::insert( $table, $data, $format );
	}
}
const HD_QF_LINE = 'This lead could not be queued for the manager. Add it by hand.';

function hd_qf_reset( $queue_works ) {
	hd_d4_reset();
	if ( ! $queue_works ) {
		$GLOBALS['wpdb'] = new HD_Test_No_Queue_WPDB();
	}
}
function hd_qf_d4() {
	$repo = new HD_DD_Repository();
	return new HD_DD_D4( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
}
function hd_qf_owner_mail() {
	foreach ( $GLOBALS['hd_test_mail'] as $m ) {
		if ( false !== strpos( $m['subject'], 'Designer 4' ) ) { return $m; }
	}
	return null;
}

// 1) A lead whose event is queued: no hand-entry line, nothing logged.
hd_qf_reset( true );
hd_d4_lead();
$mail = hd_qf_owner_mail();
check( $mail && false === strpos( $mail['message'], HD_QF_LINE ), 'a queued lead has no hand-entry line' );
check( false === strpos( hd_test_error_log(), 'could not be queued' ), 'and nothing is logged' );

// 2) A lead whose event could not be queued: the owner email says so, and it is logged.
hd_qf_reset( false );
$res = hd_d4_lead();
check( 200 === $res->get_status(), 'the lead itself is still stored and answered (got ' . $res->get_status() . ')' );
$mail = hd_qf_owner_mail();
check( $mail && 0 === strpos( $mail['subject'], 'New Designer 4 lead' ), 'the owner lead email still goes' );
check( $mail && false !== strpos( $mail['message'], HD_QF_LINE ), 'the owner lead email carries the hand-entry line' );
check( false !== strpos( hd_test_error_log(), 'door_added' ) && false !== strpos( hd_test_error_log(), $res->get_data()['reference'] ), 'the failure is logged with the event type and reference (log: ' . hd_test_error_log() . ')' );

// 3) Another door added by a known visitor: the same line in the "another door" email.
hd_qf_reset( true );
$first = hd_d4_lead()->get_data();
$GLOBALS['wpdb']   = ( function ( $old ) { $n = new HD_Test_No_Queue_WPDB(); foreach ( get_object_vars( $old ) as $k => $v ) { $n->$k = $v; } return $n; } )( $GLOBALS['wpdb'] );
$GLOBALS['hd_test_mail'] = array();
$req = hd_test_request( 'POST', '/hd-door-designer/v1/d4/door', array( 'auth' => array( 'tokens' => array( $first['token'] ) ), 'design' => hd_d4_design( 'Pull Handle', 'Black' ), 'image' => hd_d4_png() ) );
$res = hd_qf_d4()->doors->rest_add( $req );
$mail = hd_qf_owner_mail();
check( 200 === $res->get_status() && $mail && 0 === strpos( $mail['subject'], 'Designer 4: another door' ), 'the another-door email still goes' );
check( $mail && false !== strpos( $mail['message'], HD_QF_LINE ), 'the another-door email carries the hand-entry line' );

// 4) Events with no owner email (here a change) are logged.
hd_qf_reset( true );
$first = hd_d4_lead()->get_data();
$GLOBALS['wpdb'] = ( function ( $old ) { $n = new HD_Test_No_Queue_WPDB(); foreach ( get_object_vars( $old ) as $k => $v ) { $n->$k = $v; } return $n; } )( $GLOBALS['wpdb'] );
$req = hd_test_request( 'POST', '/hd-door-designer/v1/d4/door/x', array( 'auth' => array( 'tokens' => array( $first['token'] ) ), 'design' => hd_d4_design( 'Pull Handle', 'Black' ) ) );
$req->set_url_params( array( 'token' => $first['token'] ) );
$res = hd_qf_d4()->doors->rest_change( $req );
check( 200 === $res->get_status() && false !== strpos( hd_test_error_log(), 'door_changed' ), 'a change whose event cannot be queued is logged (log: ' . hd_test_error_log() . ')' );

hd_test_done( 'd4-queue-failed' );
