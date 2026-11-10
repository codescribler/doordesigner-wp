<?php
/**
 * The manager queue: lead events are stored first, then pushed to the manager from a cron, so a
 * manager that is down or a blank key never loses a lead and each event lands exactly once.
 * Run: php tests/php/manager-queue.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-manager-client.php';
require_once HD_DD_DIR . 'includes/class-hd-manager-queue.php';

/** Holds the queue table's rows and answers the handful of queries the queue runs. */
class HD_Test_Queue_WPDB extends HD_Test_WPDB {
	public function get_results( $q ) {
		if ( false === strpos( $q, 'FROM wp_hd_dd_manager_queue' ) ) { return parent::get_results( $q ); }
		$rows = array_filter( $this->rows, function ( $r ) { return empty( $r['done_at'] ); } );
		usort( $rows, function ( $a, $b ) { return $a['id'] - $b['id']; } );
		return array_map( function ( $r ) { return (object) $r; }, array_slice( $rows, 0, 25 ) );
	}
	public function get_var( $q ) {
		if ( false === strpos( $q, 'COUNT(*) FROM wp_hd_dd_manager_queue' ) ) { return parent::get_var( $q ); }
		return count( array_filter( $this->rows, function ( $r ) { return empty( $r['done_at'] ); } ) );
	}
	/** The claim: UPDATE … SET next_at = '<later>' WHERE id = N AND done_at IS NULL AND next_at <= '<now>'. */
	public function query( $q ) {
		if ( preg_match( "/^UPDATE wp_hd_dd_manager_queue SET next_at = '([^']*)' WHERE id = (\d+) AND done_at IS NULL AND next_at <= '([^']*)'$/", $q, $m ) ) {
			foreach ( $this->rows as &$r ) {
				if ( (int) $r['id'] === (int) $m[2] && empty( $r['done_at'] ) && $r['next_at'] <= $m[3] ) { $r['next_at'] = $m[1]; return 1; }
			}
			return 0;
		}
		return parent::query( $q );
	}
}

function hd_test_q_reset( $key = 'secret-key', $url = 'https://manager.test/api/' ) {
	hd_test_reset();
	$GLOBALS['wpdb'] = new HD_Test_Queue_WPDB();
	update_option( 'hd_dd_settings', array( 'manager_url' => $url, 'manager_key' => $key ) );
}
function hd_test_reply( $code, $body = array() ) {
	return array( 'response' => array( 'code' => $code ), 'body' => json_encode( $body ) );
}
function hd_test_event( $ref = 'HD-2026-000090' ) {
	return array( 'type' => 'door_added', 'email' => 'nicola@example.com', 'door' => array( 'reference' => $ref ) );
}

// 1) enqueue stores the event with eventId hd-{id} and schedules a push.
hd_test_q_reset();
$id   = HD_DD_Manager_Queue::enqueue( hd_test_event() );
$row  = $GLOBALS['wpdb']->rows[0];
$body = json_decode( $row['body'], true );
check( 1 === $id && 'hd-1' === $body['eventId'], 'enqueue returns the id and stores eventId hd-{id}' );
check( 'nicola@example.com' === $body['email'] && 'HD-2026-000090' === $body['door']['reference'], 'the event is stored whole' );
check( is_int( $body['at'] ) && abs( $body['at'] - microtime( true ) * 1000 ) < 5000, 'at is the current time in milliseconds' );
check( 0 === (int) $row['attempts'] && empty( $row['done_at'] ), 'a new row is pending with no attempts' );
check( 1 === count( $GLOBALS['hd_test_cron_single'] ) && 'hd_dd_manager_push' === $GLOBALS['hd_test_cron_single'][0]['hook'], 'a one-off push is scheduled' );
check( 1 === HD_DD_Manager_Queue::pending(), 'pending counts the row' );

// 2) A 200 reply marks the row done; the request is the contract's.
HD_DD_Manager_Queue::run();
$call = $GLOBALS['hd_test_http'][0];
check( 'https://manager.test/api/website-leads/events' === $call['url'], 'posts to {manager_url}/website-leads/events' );
check( 'Bearer secret-key' === $call['args']['headers']['Authorization'], 'sends the key as a Bearer token' );
check( 8 === (int) $call['args']['timeout'], 'timeout is 8 seconds' );
check( 'hd-1' === json_decode( $call['args']['body'], true )['eventId'], 'the body is the stored event' );
check( ! empty( $GLOBALS['wpdb']->rows[0]['done_at'] ) && empty( $GLOBALS['wpdb']->rows[0]['failed'] ), 'a 200 reply marks the row done' );
check( 0 === HD_DD_Manager_Queue::pending(), 'nothing is pending after delivery' );
HD_DD_Manager_Queue::run();
check( 1 === count( $GLOBALS['hd_test_http'] ), 'a delivered row is never sent twice' );

// 3) 409 deal_closed (and 422) are final: done, failed set, not retried.
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event() );
$GLOBALS['hd_test_http_replies'][] = hd_test_reply( 409, array( 'code' => 'deal_closed' ) );
HD_DD_Manager_Queue::run();
$r = $GLOBALS['wpdb']->rows[0];
check( 'deal_closed' === $r['failed'] && ! empty( $r['done_at'] ), 'a 409 deal_closed reply is final: done, failed = deal_closed' );
HD_DD_Manager_Queue::run();
check( 1 === count( $GLOBALS['hd_test_http'] ), 'a final refusal is not retried' );
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event() );
$GLOBALS['hd_test_http_replies'][] = hd_test_reply( 422, array( 'code' => 'bad_email' ) );
HD_DD_Manager_Queue::run();
check( 'bad_email' === $GLOBALS['wpdb']->rows[0]['failed'], 'a 422 reply is final with its code' );
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event() );
$GLOBALS['hd_test_http_replies'][] = hd_test_reply( 409, array( 'code' => 'something_else' ) );
HD_DD_Manager_Queue::run();
check( empty( $GLOBALS['wpdb']->rows[0]['done_at'] ), 'a 409 with another code is retried, not final' );

// 4) A 500 or a WP_Error leaves the row pending with a later next_at; the delay doubles.
foreach ( array( hd_test_reply( 500 ), new WP_Error( 'http_request_failed', 'timeout' ) ) as $reply ) {
	hd_test_q_reset();
	HD_DD_Manager_Queue::enqueue( hd_test_event() );
	$GLOBALS['hd_test_http_replies'][] = $reply;
	$now = time();
	HD_DD_Manager_Queue::run( $now );
	$r = $GLOBALS['wpdb']->rows[0];
	check( empty( $r['done_at'] ) && 1 === (int) $r['attempts'], 'a failed push leaves the row pending and counts the attempt' );
	check( strtotime( $r['next_at'] . ' UTC' ) === $now + 60, 'the first retry is a minute later' );
	HD_DD_Manager_Queue::run( $now + 30 );
	check( 1 === count( $GLOBALS['hd_test_http'] ), 'a row is not retried before next_at' );
	$GLOBALS['hd_test_http_replies'][] = hd_test_reply( 502 );
	HD_DD_Manager_Queue::run( $now + 61 );
	check( 120 === strtotime( $GLOBALS['wpdb']->rows[0]['next_at'] . ' UTC' ) - ( $now + 61 ), 'the second retry is two minutes later' );
}
check( 60 === HD_DD_Manager_Queue::delay( 1 ) && 120 === HD_DD_Manager_Queue::delay( 2 ) && 3600 === HD_DD_Manager_Queue::delay( 12 ) && 3600 === HD_DD_Manager_Queue::delay( 99 ), 'delay is min( 3600, 60 * 2^(n-1) )' );

// 5) A blank key (or URL) sends nothing and keeps the row pending.
foreach ( array( array( '', 'https://manager.test/api' ), array( 'k', '' ) ) as $cfg ) {
	hd_test_q_reset( $cfg[0], $cfg[1] );
	HD_DD_Manager_Queue::enqueue( hd_test_event() );
	HD_DD_Manager_Queue::run();
	check( 0 === count( $GLOBALS['hd_test_http'] ), 'a blank key or URL sends nothing' );
	check( empty( $GLOBALS['wpdb']->rows[0]['done_at'] ) && 1 === HD_DD_Manager_Queue::pending(), 'the row stays pending' );
	$client = HD_DD_Manager_Client::post_event( hd_test_event() );
	check( false === $client['ok'] && false === $client['final'], 'the client reports not ok, not final' );
	check( array() === HD_DD_Manager_Client::status( array( 'HD-1' ) ) && 0 === count( $GLOBALS['hd_test_http'] ), 'status is empty and sends nothing when unconfigured' );
}

// 6) Rows go oldest first and a failure stops the batch.
hd_test_q_reset();
foreach ( array( 'HD-1', 'HD-2', 'HD-3' ) as $ref ) { HD_DD_Manager_Queue::enqueue( hd_test_event( $ref ) ); }
$GLOBALS['hd_test_http_replies'] = array( hd_test_reply( 200 ), hd_test_reply( 500 ) );
HD_DD_Manager_Queue::run();
$sent = array_map( function ( $c ) { return json_decode( $c['args']['body'], true )['door']['reference']; }, $GLOBALS['hd_test_http'] );
check( array( 'HD-1', 'HD-2' ) === $sent, 'rows are sent oldest first and the batch stops at the first failure' );
check( 1 === count( array_filter( $GLOBALS['wpdb']->rows, function ( $r ) { return ! empty( $r['done_at'] ); } ) ) && 2 === HD_DD_Manager_Queue::pending(), 'the failed row and the one after it stay pending' );
hd_test_q_reset();
foreach ( range( 1, 30 ) as $i ) { HD_DD_Manager_Queue::enqueue( hd_test_event( "HD-$i" ) ); }
HD_DD_Manager_Queue::run();
check( 25 === count( $GLOBALS['hd_test_http'] ) && 5 === HD_DD_Manager_Queue::pending(), 'a run sends at most 25 rows' );

// 7) A claimed row (another run is sending it) is skipped, so it is sent once.
hd_test_q_reset();
HD_DD_Manager_Queue::enqueue( hd_test_event() );
$GLOBALS['wpdb']->rows[0]['next_at'] = gmdate( 'Y-m-d H:i:s', time() + 300 );
HD_DD_Manager_Queue::run();
check( 0 === count( $GLOBALS['hd_test_http'] ), 'a row claimed by another run is not sent again' );

// 8) Status read-back: cached for 300 seconds, empty on any failure.
hd_test_q_reset();
$GLOBALS['hd_test_http_replies'][] = hd_test_reply( 200, array( 'doors' => array( array( 'reference' => 'HD-1', 'status' => 'estimate_sent' ), array( 'reference' => 'HD-2', 'status' => 'pending' ) ) ) );
$map = HD_DD_Manager_Client::status( array( 'HD-1', 'HD-2' ) );
check( array( 'HD-1' => 'estimate_sent', 'HD-2' => 'pending' ) === $map, 'status maps reference to status' );
check( 'https://manager.test/api/website-leads/status' === $GLOBALS['hd_test_http'][0]['url'] && array( 'references' => array( 'HD-1', 'HD-2' ) ) === json_decode( $GLOBALS['hd_test_http'][0]['args']['body'], true ), 'status posts the references' );
$again = HD_DD_Manager_Client::status( array( 'HD-2', 'HD-1' ) );
check( 1 === count( $GLOBALS['hd_test_http'] ) && $again === $map, 'the answer is cached' );
check( 300 === $GLOBALS['hd_test_transients'][ 'hd_dd_d4_status_' . md5( 'HD-1,HD-2' ) ]['expires'] - time(), 'cached for 300 seconds under hd_dd_d4_status_{md5}' );
foreach ( array( hd_test_reply( 500 ), new WP_Error( 'x', 'y' ), array( 'response' => array( 'code' => 200 ), 'body' => 'not json' ) ) as $bad ) {
	hd_test_q_reset();
	$GLOBALS['hd_test_http_replies'][] = $bad;
	check( array() === HD_DD_Manager_Client::status( array( 'HD-9' ) ), 'status is empty on any failure' );
}

// 9) The key and URL are never part of the browser config, and the table is created once.
require_once HD_DD_DIR . 'includes/class-hd-experiment-stats.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-notifier.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-export.php';
require_once HD_DD_DIR . 'includes/class-hd-experiments.php';
require_once HD_DD_DIR . 'includes/class-hd-assets.php';
function rest_url( $path = '' ) { return 'https://example.test/wp-json/' . ltrim( (string) $path, '/' ); }
hd_test_q_reset( 'secret-key-123', 'https://manager.test/api' );
$m = new ReflectionMethod( 'HD_DD_Assets', 'front_config' );
$m->setAccessible( true );
$json = json_encode( $m->invoke( new HD_DD_Assets( new HD_DD_Catalogue() ) ) );
check( strlen( $json ) > 50, 'the front config was built' );
check( false === strpos( $json, 'secret-key-123' ) && false === strpos( $json, 'manager.test' ) && false === strpos( $json, 'manager_key' ), 'the key is never part of HD_DD_Assets front config' );
hd_test_q_reset();
HD_DD_Manager_Queue::maybe_upgrade();
check( '1' === get_option( 'hd_dd_manager_db_version' ), 'maybe_upgrade stores the version option' );
check( 1 === count( $GLOBALS['hd_test_dbdelta'] ) && false !== strpos( $GLOBALS['hd_test_dbdelta'][0], 'wp_hd_dd_manager_queue' ), 'maybe_upgrade creates the table' );
HD_DD_Manager_Queue::maybe_upgrade();
check( 1 === count( $GLOBALS['hd_test_dbdelta'] ), 'maybe_upgrade is a no-op once current' );

// 10) Settings: a blank key keeps the stored one, a new one replaces it.
require_once HD_DD_DIR . 'includes/class-hd-admin.php';
hd_test_q_reset( 'old-key', 'https://manager.test/api' );
$admin = new HD_DD_Admin( new HD_DD_Repository() );
$out   = $admin->sanitize_settings( array( 'manager_url' => ' https://new.test/api ', 'manager_key' => '' ) );
check( 'old-key' === $out['manager_key'] && 'https://new.test/api' === $out['manager_url'], 'a blank key keeps the stored value; the URL is saved' );
$out = $admin->sanitize_settings( array( 'manager_key' => ' new-key ' ) );
check( 'new-key' === $out['manager_key'], 'a new key replaces the stored one' );
$out = $admin->sanitize_settings( array() );
check( 'old-key' === $out['manager_key'] && 'https://manager.test/api' === $out['manager_url'], 'a save without the fields keeps both' );

// 11) enqueue never leaves a due row without its eventId: a cron run between the insert and
// the update finds nothing to send, and a failed update is a failed enqueue.
class HD_Test_Racing_WPDB extends HD_Test_Queue_WPDB {
	public $fail_update = false;
	public $during_update = null;
	public function update( $table, $data, $where, $f = null, $wf = null ) {
		if ( $this->during_update ) { call_user_func( $this->during_update ); }
		return $this->fail_update ? false : parent::update( $table, $data, $where, $f, $wf );
	}
	public function delete( $table, $where, $f = null ) {
		$this->rows = array_values( array_filter( $this->rows, function ( $r ) use ( $where ) { return (int) $r['id'] !== (int) $where['id']; } ) );
		return 1;
	}
}
hd_test_q_reset();
$GLOBALS['wpdb'] = new HD_Test_Racing_WPDB();
$GLOBALS['wpdb']->during_update = function () { HD_DD_Manager_Queue::run(); };
HD_DD_Manager_Queue::enqueue( hd_test_event() );
check( 0 === count( $GLOBALS['hd_test_http'] ), 'a cron run between the insert and the update sends nothing' );
$body = json_decode( $GLOBALS['wpdb']->rows[0]['body'], true );
check( 'hd-1' === $body['eventId'] && strtotime( $GLOBALS['wpdb']->rows[0]['next_at'] . ' UTC' ) <= time(), 'the finished row has its eventId and is due now' );
HD_DD_Manager_Queue::run();
check( 1 === count( $GLOBALS['hd_test_http'] ) && 'hd-1' === json_decode( $GLOBALS['hd_test_http'][0]['args']['body'], true )['eventId'], 'it is then sent with its eventId' );
hd_test_q_reset();
$GLOBALS['wpdb'] = new HD_Test_Racing_WPDB();
$GLOBALS['wpdb']->fail_update = true;
check( 0 === HD_DD_Manager_Queue::enqueue( hd_test_event() ), 'a failed update is a failed enqueue (returns 0)' );
check( 0 === HD_DD_Manager_Queue::pending() && 0 === count( $GLOBALS['hd_test_cron_single'] ), 'the half-written row is removed and no push is scheduled' );

hd_test_done( 'manager-queue' );
