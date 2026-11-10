<?php
/**
 * Shared set-up for the Designer 4 endpoint tests (not a test itself: run.php only picks up
 * *.test.php). A $wpdb that keeps the manager queue's rows apart from the enquiry rows (their
 * ids would otherwise collide) and records other tables' inserts.
 */
require __DIR__ . '/experiment-helpers.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-plan.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-mailer.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-log.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up.php';

class HD_Test_D4_WPDB extends HD_Test_Exp_WPDB {
	/** @var array table => rows, for every table except the enquiries one. */
	public $tables = array();
	public function insert( $table, $data, $format = null ) {
		if ( 'wp_hd_enquiries' === $table ) { return parent::insert( $table, $data, $format ); }
		$data['id'] = $this->insert_id = count( isset( $this->tables[ $table ] ) ? $this->tables[ $table ] : array() ) + 1;
		$this->tables[ $table ][] = $data;
		return 1;
	}
	public function update( $table, $data, $where, $f = null, $wf = null ) {
		if ( 'wp_hd_enquiries' === $table ) { return parent::update( $table, $data, $where, $f, $wf ); }
		foreach ( isset( $this->tables[ $table ] ) ? array_keys( $this->tables[ $table ] ) : array() as $i ) {
			if ( (int) $this->tables[ $table ][ $i ]['id'] === (int) $where['id'] ) { $this->tables[ $table ][ $i ] = array_merge( $this->tables[ $table ][ $i ], $data ); return 1; }
		}
		return 0;
	}
	/** The events queued for the manager, decoded, oldest first. */
	public function events() {
		return array_map( function ( $r ) { return json_decode( $r['body'], true ); }, isset( $this->tables['wp_hd_dd_manager_queue'] ) ? $this->tables['wp_hd_dd_manager_queue'] : array() );
	}
}

/** Fresh state, the listeners a live site has on hd_dd_enquiry_submitted, and a PHP error recorder. */
function hd_d4_reset() {
	hd_test_reset();
	$GLOBALS['wpdb']             = new HD_Test_D4_WPDB();
	$GLOBALS['hd_d4_php_errors'] = array();
	set_error_handler( function ( $no, $str, $file, $line ) { $GLOBALS['hd_d4_php_errors'][] = "$str ($file:$line)"; return true; } );
	( new HD_DD_Experiments() )->register();
	( new HD_DD_Experiment_Tracking() )->register();
	( new HD_DD_Follow_Up() )->register();
}

function hd_d4_png() {
	return 'data:image/png;base64,' . base64_encode( "\x89PNG\r\n\x1a\n" . str_repeat( "\0", 16 ) );
}

function hd_d4_design( $handle = 'Pull Handle', $colour = 'French Navy' ) {
	$d = array(
		'Door Type'              => array( 'label' => 'Single Door', 'id' => null ),
		'Door Design'            => array( 'label' => 'Etna', 'id' => 12 ),
		'Door Colour (External)' => array( 'label' => $colour, 'id' => 3 ),
	);
	if ( null !== $handle ) { $d['Handle'] = array( 'label' => $handle, 'id' => 7 ); }
	return $d;
}

function hd_d4_lead( array $over = array() ) {
	$body = array_merge( array( 'email' => 'jo@example.com', 'hd_hp' => '', 'design' => hd_d4_design(), 'image' => hd_d4_png(), 'pageUrl' => 'https://example.test/door-designer/' ), $over );
	$repo = new HD_DD_Repository();
	$d4   = new HD_DD_D4( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
	return $d4->rest_lead( hd_test_request( 'POST', '/hd-door-designer/v1/d4/lead', $body ) );
}
