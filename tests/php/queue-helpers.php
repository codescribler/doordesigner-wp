<?php
/**
 * Shared set-up for the manager queue tests (not a test itself: run.php only picks up *.test.php).
 * A $wpdb that holds the queue table's rows and answers the handful of queries the queue runs.
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-manager-client.php';
require_once HD_DD_DIR . 'includes/class-hd-manager-queue.php';

class HD_Test_Queue_WPDB extends HD_Test_WPDB {
	/** False = the queue table is missing (SHOW TABLES finds nothing). */
	public $has_table = true;
	private function pending_rows() {
		return array_filter( $this->rows, function ( $r ) { return empty( $r['done_at'] ); } );
	}
	private function grouped( array $rows, $col ) {
		$out = array();
		foreach ( $rows as $r ) {
			$code = isset( $r[ $col ] ) ? (string) $r[ $col ] : '';
			$out[ $code ] = ( isset( $out[ $code ] ) ? $out[ $code ] : 0 ) + 1;
		}
		$list = array();
		foreach ( $out as $code => $n ) { $list[] = (object) array( 'code' => '' === $code ? null : $code, 'n' => $n ); }
		return $list;
	}
	public function get_results( $q ) {
		if ( false === strpos( $q, 'FROM wp_hd_dd_manager_queue' ) ) { return parent::get_results( $q ); }
		// The stuck rows: done_at IS NULL AND attempts >= N GROUP BY last_error.
		if ( preg_match( '/attempts >= (\d+) GROUP BY last_error/', $q, $m ) ) {
			return $this->grouped( array_filter( $this->pending_rows(), function ( $r ) use ( $m ) { return (int) $r['attempts'] >= (int) $m[1]; } ), 'last_error' );
		}
		// Refused for good: failed IS NOT NULL AND done_at >= 'cut' GROUP BY failed.
		if ( preg_match( "/failed IS NOT NULL AND done_at >= '([^']*)' GROUP BY failed/", $q, $m ) ) {
			return $this->grouped( array_filter( $this->rows, function ( $r ) use ( $m ) { return ! empty( $r['failed'] ) && ! empty( $r['done_at'] ) && $r['done_at'] >= $m[1]; } ), 'failed' );
		}
		$rows = $this->pending_rows();
		// The batch: AND ( attempts < N OR next_at <= 'now' ) leaves out stuck rows that are not due.
		if ( preg_match( "/attempts < (\d+) OR next_at <= '([^']*)'/", $q, $m ) ) {
			$rows = array_filter( $rows, function ( $r ) use ( $m ) { return (int) $r['attempts'] < (int) $m[1] || $r['next_at'] <= $m[2]; } );
		}
		usort( $rows, function ( $a, $b ) { return $a['id'] - $b['id']; } );
		return array_map( function ( $r ) { return (object) $r; }, array_slice( $rows, 0, 25 ) );
	}
	public function get_var( $q ) {
		if ( preg_match( "/^SHOW TABLES LIKE '([^']*)'$/", $q, $m ) ) { return $this->has_table ? $m[1] : null; }
		if ( false === strpos( $q, 'COUNT(*) FROM wp_hd_dd_manager_queue' ) ) { return parent::get_var( $q ); }
		return count( $this->pending_rows() );
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

/** Fresh state on a queue table that has finished upgrading. */
function hd_test_q_reset( $key = 'secret-key', $url = 'https://manager.test/api/' ) {
	hd_test_reset();
	$GLOBALS['wpdb'] = new HD_Test_Queue_WPDB();
	update_option( 'hd_dd_settings', array( 'manager_url' => $url, 'manager_key' => $key ) );
	update_option( HD_DD_Manager_Queue::DB_OPTION, HD_DD_Manager_Queue::DB_VERSION );
}
function hd_test_reply( $code, $body = array() ) {
	return array( 'response' => array( 'code' => $code ), 'body' => json_encode( $body ) );
}
/** The manager's error body: { "error": { "code": "...", "message": "..." } }. */
function hd_test_error_reply( $code, $error_code ) {
	return hd_test_reply( $code, array( 'error' => array( 'code' => $error_code, 'message' => 'x' ) ) );
}
function hd_test_event( $ref = 'HD-2026-000090' ) {
	return array( 'type' => 'door_added', 'email' => 'nicola@example.com', 'door' => array( 'reference' => $ref ) );
}
