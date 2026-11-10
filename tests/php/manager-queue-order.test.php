<?php
/**
 * The manager queue keeps one customer's events in order: while an earlier event for the same
 * email or door is stuck or failing, that customer's later events are held back untouched; other
 * customers' events keep flowing.
 * Run: php tests/php/manager-queue-order.test.php
 */
require __DIR__ . '/queue-helpers.php';

function hd_qo_sent() {
	return array_map( function ( $c ) { $e = json_decode( $c['args']['body'], true ); return $e['door']['reference'] . '/' . $e['type']; }, $GLOBALS['hd_test_http'] );
}
/** Row i (0-based) has failed $attempts times and is next due at $next_at. */
function hd_qo_fail( $i, $attempts, $next_at ) {
	$GLOBALS['wpdb']->rows[ $i ]['attempts'] = $attempts;
	$GLOBALS['wpdb']->rows[ $i ]['next_at']  = gmdate( 'Y-m-d H:i:s', $next_at );
}
function hd_qo_untouched( $i, $msg ) {
	$r = $GLOBALS['wpdb']->rows[ $i ];
	check( empty( $r['done_at'] ) && 0 === (int) $r['attempts'] && strtotime( $r['next_at'] . ' UTC' ) <= time(), $msg . ' (held untouched: not sent, no attempt, next_at unchanged)' );
}
$A = 'nicola@example.com';
$B = 'sam@example.com';
$now = time();

// 1) A stuck row for A (not due), then a fresh row for A and a fresh row for B: only B's is sent.
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A, 'doorway_set' ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-B1', $B ) );
hd_qo_fail( 0, 8, $now + 1800 );
$before = $GLOBALS['wpdb']->rows[1]['next_at'];
HD_DD_Manager_Queue::run( $now );
check( array( 'HD-B1/door_added' ) === hd_qo_sent(), 'only the other customer\'s row is sent (got ' . implode( ',', hd_qo_sent() ) . ')' );
hd_qo_untouched( 1, 'A\'s later row' );
check( $before === $GLOBALS['wpdb']->rows[1]['next_at'], 'A\'s later row keeps its next_at' );
check( 1 === $GLOBALS['wpdb']->hold_queries, 'one extra query finds the earlier stuck rows' );

// 2) A stuck row for A that is due and fails again in this run holds A's later row in the same run.
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A, 'door_changed' ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-B1', $B ) );
hd_qo_fail( 0, 8, $now - 1 );
$GLOBALS['hd_test_http_replies'] = array( hd_test_reply( 500 ), hd_test_reply( 200 ) );
HD_DD_Manager_Queue::run( $now );
check( array( 'HD-A1/door_added', 'HD-B1/door_added' ) === hd_qo_sent(), 'A\'s stuck row is tried, fails, and A\'s later row is held; B\'s goes (got ' . implode( ',', hd_qo_sent() ) . ')' );
check( 9 === (int) $GLOBALS['wpdb']->rows[0]['attempts'], 'the failure is counted on A\'s stuck row' );
hd_qo_untouched( 1, 'A\'s later row in the same run' );
// A row that is not stuck and fails still stops the run, as before.
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A, 'door_changed' ) );
$GLOBALS['hd_test_http_replies'] = array( hd_test_reply( 500 ) );
HD_DD_Manager_Queue::run( $now );
check( array( 'HD-A1/door_added' ) === hd_qo_sent(), 'a failed row that is not stuck holds A\'s later row' );
hd_qo_untouched( 1, 'A\'s later row after a fresh failure' );

// 3) On the next run, a failed row for A that is not due yet still holds A's due later row.
$GLOBALS['hd_test_http'] = array();
HD_DD_Manager_Queue::run( $now + 30 );
check( array() === hd_qo_sent(), 'a not-yet-due failed row for A holds A\'s due later row' );
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A, 'door_removed' ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-B1', $B ) );
hd_qo_fail( 0, 12, $now + 3000 );   // stuck, waiting: left out of the batch by the batch query
HD_DD_Manager_Queue::run( $now );
check( array( 'HD-B1/door_added' ) === hd_qo_sent(), 'a stuck row that is not due holds A\'s later row across runs' );
hd_qo_untouched( 1, 'A\'s removal' );

// 4) The same door under another email casing (or another email) is held too.
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', '  Nicola@Example.COM ', 'details' ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A2', ' NICOLA@example.com', 'door_added' ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', 'someone-else@example.com', 'door_changed' ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-B1', $B ) );
hd_qo_fail( 0, 8, $now + 1800 );
HD_DD_Manager_Queue::run( $now );
check( array( 'HD-B1/door_added' ) === hd_qo_sent(), 'the same email in another casing, and the same door reference, are held (got ' . implode( ',', hd_qo_sent() ) . ')' );
hd_qo_untouched( 1, 'the same email, other casing' );
hd_qo_untouched( 2, 'another door, same email' );
hd_qo_untouched( 3, 'the same door, another email' );

// 5) Once A's first row is delivered, A's held rows go out in id order on the next run.
$GLOBALS['hd_test_http'] = array();
hd_qo_fail( 0, 8, $now - 1 );
HD_DD_Manager_Queue::run( $now + 10 );
check( array( 'HD-A1/door_added', 'HD-A1/details', 'HD-A2/door_added', 'HD-A1/door_changed' ) === hd_qo_sent(), 'A\'s rows go in id order once the first is delivered (got ' . implode( ',', hd_qo_sent() ) . ')' );
check( 0 === HD_DD_Manager_Queue::pending(), 'nothing is left waiting' );

// 6) A final refusal does not hold later rows back.
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A, 'door_changed' ) );
hd_qo_fail( 0, 8, $now - 1 );
$GLOBALS['hd_test_http_replies'] = array( hd_test_error_reply( 409, 'deal_closed' ) );
HD_DD_Manager_Queue::run( $now );
check( array( 'HD-A1/door_added', 'HD-A1/door_changed' ) === hd_qo_sent(), 'after a final refusal A\'s later row is sent' );
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A, 'door_changed' ) );
$GLOBALS['hd_test_http_replies'] = array( hd_test_error_reply( 422, 'invalid_request' ) );
HD_DD_Manager_Queue::run( $now );
check( array( 'HD-A1/door_added', 'HD-A1/door_changed' ) === hd_qo_sent(), 'a 422 invalid_request does not hold A\'s later row either' );

// The other guarantees: a blank key sends nothing and burns no attempts; a claimed row is not sent.
hd_test_q_reset( '' );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-A1', $A ) );
HD_DD_Manager_Queue::run( $now );
check( array() === hd_qo_sent() && 0 === (int) $GLOBALS['wpdb']->rows[0]['attempts'], 'a blank key sends nothing and counts nothing' );

hd_test_done( 'manager-queue-order' );
