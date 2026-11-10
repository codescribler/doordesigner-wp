<?php
/**
 * The manager queue's retry rules: only the manager's deliberate refusals are final, a row that
 * keeps failing stops blocking newer events, and wp-admin shows what is waiting, stuck or refused.
 * Run: php tests/php/manager-queue-retry.test.php
 */
require __DIR__ . '/queue-helpers.php';
require_once HD_DD_DIR . 'includes/class-hd-d4-admin.php';

function hd_rq_sent_refs() {
	return array_map( function ( $c ) { return json_decode( $c['args']['body'], true )['door']['reference']; }, $GLOBALS['hd_test_http'] );
}

// 1) Classification: final only for 422 invalid_request and 409 deal_closed.
$cases = array(
	array( hd_test_error_reply( 422, 'invalid_request' ), true, 'invalid_request', '422 invalid_request' ),
	array( hd_test_error_reply( 409, 'deal_closed' ), true, 'deal_closed', '409 deal_closed' ),
	array( hd_test_error_reply( 422, 'request_failed' ), false, 'http_422:request_failed', '422 request_failed' ),
	array( hd_test_reply( 422, array() ), false, 'http_422', '422 with no code' ),
	array( array( 'response' => array( 'code' => 422 ), 'body' => 'not json' ), false, 'http_422', '422 with a body that is not JSON' ),
	array( hd_test_reply( 422, array( 'code' => 'invalid_request' ) ), false, 'http_422', '422 with the code outside error{}' ),
	array( hd_test_error_reply( 409, 'deal_lost' ), false, 'http_409:deal_lost', '409 with another code' ),
	array( hd_test_error_reply( 401, 'unauthorized' ), false, 'http_401:unauthorized', '401' ),
	array( hd_test_error_reply( 403, 'forbidden' ), false, 'http_403:forbidden', '403' ),
	array( hd_test_error_reply( 404, 'not_found' ), false, 'http_404:not_found', '404' ),
	array( hd_test_reply( 500 ), false, 'http_500', '500' ),
	array( hd_test_reply( 503 ), false, 'http_503', '503' ),
	array( new WP_Error( 'http_request_failed', 'cURL error 28: timed out' ), false, 'http_request_failed', 'a timeout (WP_Error)' ),
);
foreach ( $cases as $c ) {
	hd_test_q_reset();
	$GLOBALS['hd_test_http_replies'][] = $c[0];
	$r = HD_DD_Manager_Client::post_event( hd_test_event() );
	check( false === $r['ok'] && $c[1] === $r['final'], $c[3] . ( $c[1] ? ' is final' : ' is retried' ) );
	check( $c[2] === $r['code'], $c[3] . ' reports ' . $c[2] . ' (got ' . $r['code'] . ')' );
}

// 2) A retried failure stores its last error on the row; a final one stores it in failed too.
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event() );
$GLOBALS['hd_test_http_replies'][] = hd_test_error_reply( 422, 'request_failed' );
HD_DD_Manager_Queue::run();
$r = $GLOBALS['wpdb']->rows[0];
check( empty( $r['done_at'] ) && 1 === (int) $r['attempts'] && 'http_422:request_failed' === $r['last_error'], 'a 422 request_failed is retried and its error is kept on the row' );
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event() );
$GLOBALS['hd_test_http_replies'][] = hd_test_error_reply( 422, 'invalid_request' );
HD_DD_Manager_Queue::run();
$r = $GLOBALS['wpdb']->rows[0];
check( ! empty( $r['done_at'] ) && 'invalid_request' === $r['failed'] && 'invalid_request' === $r['last_error'], 'a final refusal is done with failed and last_error set' );

// 3) A table that has not upgraded yet (no last_error column) never gets last_error written.
hd_test_q_reset();
delete_option( HD_DD_Manager_Queue::DB_OPTION );
HD_DD_Manager_Queue::enqueue( hd_test_event() );
$GLOBALS['hd_test_http_replies'][] = hd_test_reply( 500 );
HD_DD_Manager_Queue::run();
$r = $GLOBALS['wpdb']->rows[0];
check( 1 === (int) $r['attempts'] && ! array_key_exists( 'last_error', $r ), 'on an un-upgraded table the attempt is counted without writing last_error' );

// 4) A row that has failed 8 times no longer blocks other customers' newer rows; it is still retried
// when due. (Its own customer's later rows wait for it: manager-queue-order.test.php.)
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-STUCK' ) );
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-FRESH', 'sam@example.com' ) );
$now = time();
for ( $i = 0; $i < 7; $i++ ) {
	$GLOBALS['hd_test_http_replies'][] = hd_test_reply( 500 );
	$GLOBALS['wpdb']->rows[0]['next_at'] = gmdate( 'Y-m-d H:i:s', $now - 1 );
	HD_DD_Manager_Queue::run( $now );
}
check( 7 === (int) $GLOBALS['wpdb']->rows[0]['attempts'] && array( 'HD-STUCK' ) === array_unique( hd_rq_sent_refs() ), 'seven failures still hold the newer row back (order kept)' );
$GLOBALS['hd_test_http'] = array();
$GLOBALS['hd_test_http_replies'][] = hd_test_reply( 500 );
$GLOBALS['wpdb']->rows[0]['next_at'] = gmdate( 'Y-m-d H:i:s', $now - 1 );
HD_DD_Manager_Queue::run( $now );
check( array( 'HD-STUCK' ) === hd_rq_sent_refs() && 8 === (int) $GLOBALS['wpdb']->rows[0]['attempts'], 'the eighth failure is counted and the run stops there' );
check( strtotime( $GLOBALS['wpdb']->rows[0]['next_at'] . ' UTC' ) === $now + 3600, 'a stuck row waits the maximum backoff' );
$GLOBALS['hd_test_http'] = array();
HD_DD_Manager_Queue::run( $now + 10 );
check( array( 'HD-FRESH' ) === hd_rq_sent_refs(), 'the next run skips the stuck row and sends the fresh row' );
check( ! empty( $GLOBALS['wpdb']->rows[1]['done_at'] ) && empty( $GLOBALS['wpdb']->rows[0]['done_at'] ), 'the fresh row is delivered; the stuck row still waits' );
// When due again the stuck row is retried, and a failure there does not stop the rows after it.
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-NEWER', 'jo@example.com' ) );
$GLOBALS['hd_test_http'] = array();
$GLOBALS['hd_test_http_replies'] = array( hd_test_reply( 500 ), hd_test_reply( 200 ) );
HD_DD_Manager_Queue::run( $now + 3601 );
check( array( 'HD-STUCK', 'HD-NEWER' ) === hd_rq_sent_refs(), 'a due stuck row is retried, and its failure does not stop the newer row' );
check( 9 === (int) $GLOBALS['wpdb']->rows[0]['attempts'] && ! empty( $GLOBALS['wpdb']->rows[2]['done_at'] ), 'the stuck row counts the attempt; the newer row is delivered' );

// 5) Stuck rows that are not due do not take the batch's places.
hd_test_q_reset();
foreach ( range( 1, 26 ) as $i ) { HD_DD_Manager_Queue::enqueue( hd_test_event( "HD-S$i" ) ); }
HD_DD_Manager_Queue::enqueue( hd_test_event( 'HD-LAST', 'sam@example.com' ) );
foreach ( range( 0, 25 ) as $i ) {
	$GLOBALS['wpdb']->rows[ $i ]['attempts'] = 8;
	$GLOBALS['wpdb']->rows[ $i ]['next_at']  = gmdate( 'Y-m-d H:i:s', time() + 1800 );
}
HD_DD_Manager_Queue::run();
check( array( 'HD-LAST' ) === hd_rq_sent_refs(), 'more than a batch of stuck rows still lets a newer row through' );

// 6) wp-admin: waiting, keeps refusing (8+ failures, with the last error) and refused for good (30 days).
hd_test_q_reset();
foreach ( range( 1, 6 ) as $i ) { HD_DD_Manager_Queue::enqueue( hd_test_event( "HD-$i" ) ); }
$rows = &$GLOBALS['wpdb']->rows;
$rows[0] = array_merge( $rows[0], array( 'attempts' => 9, 'last_error' => 'http_401:unauthorized' ) );
$rows[1] = array_merge( $rows[1], array( 'attempts' => 8, 'last_error' => 'http_401:unauthorized' ) );
$rows[2] = array_merge( $rows[2], array( 'attempts' => 1, 'last_error' => 'http_500' ) );
$rows[3] = array_merge( $rows[3], array( 'attempts' => 1, 'done_at' => gmdate( 'Y-m-d H:i:s', time() - 86400 ), 'failed' => 'invalid_request' ) );
$rows[4] = array_merge( $rows[4], array( 'attempts' => 1, 'done_at' => gmdate( 'Y-m-d H:i:s', time() - 40 * 86400 ), 'failed' => 'deal_closed' ) );
$rows[5] = array_merge( $rows[5], array( 'attempts' => 1, 'done_at' => gmdate( 'Y-m-d H:i:s' ), 'failed' => null ) );
unset( $rows );
$report = HD_DD_D4_Admin::queue_report();
check( 3 === $report['waiting'], 'waiting counts every row not yet delivered or refused (got ' . $report['waiting'] . ')' );
check( 2 === $report['stuck'] && array( 'http_401:unauthorized' => 2 ) === $report['stuck_codes'], 'keeps refusing counts rows with 8+ failures, by last error' );
check( 1 === $report['refused'] && array( 'invalid_request' => 1 ) === $report['refused_codes'], 'refused for good counts final rows from the last 30 days, by code' );
$note = HD_DD_D4_Admin::waiting_note();
check( false !== strpos( $note, 'Manager events waiting to be delivered: 3' ), 'the note shows the waiting count (got ' . $note . ')' );
check( false !== strpos( $note, 'The manager keeps refusing: 2' ) && false !== strpos( $note, 'http_401:unauthorized' ), 'the note shows the keeps-refusing count and its last error' );
check( false !== strpos( $note, 'Refused for good in the last 30 days: 1' ) && false !== strpos( $note, 'invalid_request' ), 'the note shows the refused-for-good count and its code' );
check( false === strpos( $note, 'deal_closed' ), 'a refusal older than 30 days is not shown' );

// 7) maybe_upgrade stores its version only once the table is really there.
hd_test_q_reset();
delete_option( HD_DD_Manager_Queue::DB_OPTION );
$GLOBALS['wpdb']->has_table = false;
HD_DD_Manager_Queue::maybe_upgrade();
check( false === get_option( HD_DD_Manager_Queue::DB_OPTION ) && 1 === count( $GLOBALS['hd_test_dbdelta'] ), 'a table that is still missing after dbDelta leaves the version unset' );
HD_DD_Manager_Queue::maybe_upgrade();
check( 2 === count( $GLOBALS['hd_test_dbdelta'] ), 'so the next load tries again' );
$GLOBALS['wpdb']->has_table = true;
HD_DD_Manager_Queue::maybe_upgrade();
check( HD_DD_Manager_Queue::DB_VERSION === get_option( HD_DD_Manager_Queue::DB_OPTION ), 'once the table exists the version is stored' );
check( false !== strpos( $GLOBALS['hd_test_dbdelta'][0], 'last_error VARCHAR(190)' ), 'the table has a last_error column' );

hd_test_done( 'manager-queue-retry' );
