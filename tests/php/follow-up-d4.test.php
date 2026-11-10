<?php
/**
 * Designer 4 rows never enter the saver follow-up sequence (the visitor gets the link email only).
 * Run: php tests/php/follow-up-d4.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-plan.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-mailer.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-log.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up.php';

/** Records inserts into the follow-up table; serves the saves query from the enquiry rows. */
class HD_Test_FU_D4_WPDB extends HD_Test_WPDB {
	public $follow = array();
	public function insert( $table, $data, $format = null ) {
		if ( 'wp_hd_dd_followups' === $table ) {
			$this->follow[ $data['enquiry_id'] ] = $data;
			return 1;
		}
		return parent::insert( $table, $data, $format );
	}
	public function get_results( $q ) {
		if ( false !== strpos( $q, "FROM wp_hd_enquiries WHERE kind = 'save'" ) ) {
			return array_values( array_map( function ( $r ) { return (object) $r; }, array_filter( $this->rows, function ( $r ) { return 'save' === $r['kind']; } ) ) );
		}
		return parent::get_results( $q );
	}
	public function get_col( $q ) {
		return array();
	}
}

function d4_fu_save( $email, $flow, $created = '2026-10-20 10:00:00' ) {
	global $wpdb;
	$wpdb->insert( 'wp_hd_enquiries', array(
		'token' => bin2hex( random_bytes( 8 ) ), 'created_at' => $created, 'status' => 'new', 'customer_name' => '', 'customer_email' => $email,
		'design_name' => 'Ascot in Anthracite Grey', 'kind' => 'save', 'flow' => $flow, 'design' => '{}', 'payload' => '{}',
	) );
	return $wpdb->insert_id;
}

hd_test_reset();
$GLOBALS['wpdb'] = new HD_Test_FU_D4_WPDB();

$classic = d4_fu_save( 'sam@example.com', 'designer3' );
$d4      = d4_fu_save( 'nic@example.com', 'designer4' );

HD_DD_Follow_Up::on_saved( array( 'reloadUrl' => 'https://example.test/?design=x' ), $d4 );
check( ! isset( $wpdb->follow[ $d4 ] ), 'a designer4 row never starts the follow-up sequence' );
HD_DD_Follow_Up::on_saved( array( 'reloadUrl' => 'https://example.test/?design=x' ), $classic );
check( isset( $wpdb->follow[ $classic ] ), 'a designer3 save still starts it' );

$ids = array_map( function ( $s ) { return (int) $s->id; }, HD_DD_Follow_Up::backfill_candidates() );
check( ! in_array( $d4, $ids, true ), 'backfill candidates exclude designer4 rows' );

$d4b = d4_fu_save( 'pat@example.com', 'designer4' );
$d3b = d4_fu_save( 'lee@example.com', 'designer3' );
$ids = array_map( function ( $s ) { return (int) $s->id; }, HD_DD_Follow_Up::backfill_candidates() );
sort( $ids );
check( array( $classic, $d3b ) === $ids, 'backfill candidates: only the non-designer4 saves' );
$plan = HD_DD_Follow_Up_Plan::backfill_candidates( array( (object) array( 'id' => 9, 'flow' => 'designer4', 'kind' => 'save', 'status' => 'new', 'customer_email' => 'z@x.com', 'customer_name' => '', 'design_name' => 'Ascot', 'created_at' => '2026-10-01 10:00:00' ) ), array(), array() );
check( array() === $plan, 'the plan itself skips a designer4 row' );
