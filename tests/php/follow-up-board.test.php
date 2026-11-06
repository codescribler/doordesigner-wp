<?php
/**
 * The Follow-up emails page's grouping: in the sequence (by next email), finished, dropped out,
 * and recent saves with no follow-up and why.  Run: php tests/php/follow-up-board.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-plan.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-board.php';

$f = function ( $id, $sent, $stopped = null, $reason = '' ) {
	return (object) array( 'enquiry_id' => $id, 'sent_steps' => $sent, 'stopped_at' => $stopped, 'stop_reason' => $reason, 'started_at' => '2026-11-01 10:00:00', 'last_sent_at' => null, 'clicks' => 0 );
};
$s = function ( $id, $email, $created, $over = array() ) {
	return (object) array_merge( array( 'id' => $id, 'customer_email' => $email, 'customer_name' => '', 'design_name' => 'Ascot', 'reference' => 'HD-' . $id, 'status' => 'new', 'kind' => 'save', 'created_at' => $created ), $over );
};

$follows = array(
	$f( 1, 0 ), $f( 2, 1 ), $f( 3, 2 ), $f( 4, 0 ),
	$f( 5, 3, '2026-11-05 10:00:00', 'finished' ),
	$f( 6, 1, '2026-11-03 10:00:00', 'converted' ),
	$f( 7, 0, '2026-11-02 10:00:00', 'superseded' ),
	$f( 8, 2, '2026-11-04 10:00:00', 'converted' ),
);
$saves = array(
	$s( 1, 'a@x.com', '2026-11-01 10:00:00' ),
	$s( 20, 'daniel@dreamfree.co.uk', '2026-11-05 09:00:00' ),
	$s( 21, 'bot@x.com', '2026-11-05 09:00:00', array( 'status' => 'flagged' ) ),
	$s( 22, 'lead@x.com', '2026-11-05 09:00:00' ),
	$s( 23, 'twice@x.com', '2026-11-04 09:00:00' ),
	$s( 24, 'twice@x.com', '2026-11-05 09:00:00' ),
	$s( 25, 'new@x.com', '2026-11-06 09:00:00' ),
	$s( 26, 'old@x.com', '2026-09-01 09:00:00' ),
	$s( 27, 'not-an-email', '2026-11-05 09:00:00' ),
);
$b = HD_DD_Follow_Up_Board::build( $follows, $saves, array( 'Lead@x.com' ), '2026-10-07 00:00:00' );
$ids = function ( $rows, $key = 'enquiry_id' ) {
	return array_map( function ( $r ) use ( $key ) { return (int) $r->$key; }, $rows );
};

check( array( 1, 4 ) === $ids( $b['running'][1] ) && array( 2 ) === $ids( $b['running'][2] ) && array( 3 ) === $ids( $b['running'][3] ), 'running, grouped by the email they wait for' );
check( array( 5 ) === $ids( $b['finished'] ), 'finished all three' );
check( array( 6, 7, 8 ) === $ids( $b['stopped'] ), 'everyone else who stopped dropped out' );

$why = array();
foreach ( $b['not_started'] as $r ) { $why[ (int) $r->id ] = $r->why; }
check( ! isset( $why[1] ), 'a followed-up save is not listed as not started' );
check( ! isset( $why[26] ), 'saves older than the window are left out' );
check( 'test' === $why[20] && 'flagged' === $why[21] && 'lead' === $why[22] && 'no_email' === $why[27], 'test, bot, lead and bad-email reasons' );
check( 'newer' === $why[23] && 'pending' === $why[24] && 'pending' === $why[25], 'an older save of someone who saved again; plain saves need starting' );
check( array( 25, 20, 21, 22, 24, 27, 23 ) === $ids( $b['not_started'], 'id' ), 'not started: newest first' );

$c = HD_DD_Follow_Up_Board::counts( $b );
check( 4 === $c['running'] && array( 1 => 2, 2 => 1, 3 => 1 ) === $c['waiting'], 'counts: running and per email' );
check( 1 === $c['finished'] && 3 === $c['stopped'] && array( 'converted' => 2, 'superseded' => 1 ) === $c['reasons'] && 7 === $c['not_started'], 'counts: finished, dropped out by reason, not started' );

hd_test_done( 'follow-up-board.test.php' );
