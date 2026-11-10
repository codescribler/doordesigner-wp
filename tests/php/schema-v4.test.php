<?php
/**
 * A site whose database upgrade stopped half way (the v4 kind/flow columns exist, the v5 Designer 4
 * columns do not): Designer 3 saves and Classic enquiries work exactly as before this branch, the
 * Designer 4 routes answer 503, and the A/B scoreboard still reads the visitor table.
 * Run: php tests/php/schema-v4.test.php
 */
require __DIR__ . '/d4-helpers.php';
require_once HD_DD_DIR . 'includes/class-hd-failure-log.php';

const HD_V4_COLUMNS = array( 'id', 'reference', 'token', 'kind', 'flow' );

function hd_v4_reset( $version = '4' ) {
	hd_d4_reset();
	update_option( 'hd_dd_db_version', $version );
	$GLOBALS['wpdb']->columns = HD_V4_COLUMNS;
}
function hd_v4_d4() {
	$repo = new HD_DD_Repository();
	return new HD_DD_D4( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
}
function hd_v4_status( $res ) {
	return is_wp_error( $res ) ? ( isset( $res->get_error_data()['status'] ) ? $res->get_error_data()['status'] : 0 ) : $res->get_status();
}

// 1) The upgrade: v4 columns there, v5 not. The version records v4 (never v5) and tries again.
hd_v4_reset( '3' );
HD_DD_Repository::maybe_upgrade();
check( '4' === get_option( 'hd_dd_db_version' ), 'kind and flow added but not the v5 columns: the version records 4 (got ' . get_option( 'hd_dd_db_version' ) . ')' );
check( HD_DD_Repository::kind_columns_ready() && ! HD_DD_Repository::schema_current(), 'kind columns ready, Designer 4 columns not' );
HD_DD_Repository::maybe_upgrade();
check( 2 === count( $GLOBALS['hd_test_dbdelta'] ), 'the next load tries the upgrade again' );
hd_v4_reset( '3' );
$GLOBALS['wpdb']->columns = array( 'id', 'reference', 'token' );
HD_DD_Repository::maybe_upgrade();
check( '3' === get_option( 'hd_dd_db_version' ) && ! HD_DD_Repository::kind_columns_ready(), 'no kind column: nothing is recorded' );

// 2) A Designer 3 save works as before: stored as a save with its flow.
hd_v4_reset();
$GLOBALS['hd_test_hooks'] = array(); // the save itself, not the follow-up listeners (tested elsewhere).
$repo = new HD_DD_Repository();
$save = new HD_DD_Save( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
$res  = $save->rest_save( hd_test_request( 'POST', '/hd-door-designer/v1/save', array( 'email' => 'jo@example.com', 'hd_hp' => '', 'design' => hd_d4_design(), 'flow' => 'designer3', 'pageUrl' => 'https://example.test/door-designer/' ) ) );
check( 201 === hd_v4_status( $res ), 'a Designer 3 save is accepted (got ' . hd_v4_status( $res ) . ')' );
$row = $GLOBALS['wpdb']->rows[0];
check( 'save' === $row['kind'] && 'designer3' === $row['flow'], 'stored as a designer3 save' );
check( ! array_key_exists( 'removed_at', $row ), 'no Designer 4 column is written' );

// 3) A Classic enquiry works as before: stored as an enquiry.
hd_v4_reset();
$GLOBALS['hd_test_hooks'] = array();
$enq = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
$res = $enq->rest_submit( hd_test_request( 'POST', '/hd-door-designer/v1/enquiry', array( 'name' => 'Jo Bloggs', 'email' => 'jo@example.com', 'telephone' => '01234 567890', 'postcode' => 'AL1 1AA', 'hd_hp' => '', 'design' => hd_d4_design(), 'pageUrl' => 'https://example.test/door-designer/' ) ) );
check( 201 === hd_v4_status( $res ) || 200 === hd_v4_status( $res ), 'a Classic enquiry is accepted (got ' . hd_v4_status( $res ) . ')' );
check( 1 === count( $GLOBALS['wpdb']->rows ) && 'enquiry' === $GLOBALS['wpdb']->rows[0]['kind'], 'stored as an enquiry' );

// 4) Designer 4 is refused cleanly: 503 with a plain message, nothing stored or sent.
hd_v4_reset();
$res = hd_d4_lead();
check( 503 === hd_v4_status( $res ), 'a Designer 4 lead answers 503 (got ' . hd_v4_status( $res ) . ')' );
check( is_wp_error( $res ) && '' !== $res->get_error_message(), 'with a plain message' );
check( 0 === count( $GLOBALS['wpdb']->rows ) && array() === $GLOBALS['wpdb']->events() && array() === $GLOBALS['hd_test_mail'], 'nothing stored, queued or emailed' );
$d4  = hd_v4_d4();
$req = function () { $r = hd_test_request( 'POST', '/hd-door-designer/v1/d4/x', array( 'auth' => array( 'tokens' => array( 'abc' ) ), 'design' => hd_d4_design() ) ); $r->set_url_params( array( 'token' => 'abc' ) ); return $r; };
foreach ( array( 'rest_designs', 'rest_add', 'rest_change', 'rest_remove' ) as $m ) {
	check( 503 === hd_v4_status( $d4->doors->$m( $req() ) ), "$m answers 503" );
}
check( 503 === hd_v4_status( $d4->details->rest_details( $req() ) ), 'rest_details answers 503' );

// 5) The scoreboard reads the visitor table without the three new journey columns.
class HD_Test_Old_Visitors_WPDB extends HD_Test_D4_WPDB {
	public $queries = array();
	public function get_results( $q ) { $this->queries[] = $q; return parent::get_results( $q ); }
}
hd_test_reset();
$GLOBALS['wpdb']          = new HD_Test_Old_Visitors_WPDB();
$GLOBALS['wpdb']->columns = array( 'arm', 'device', 'exposed_at', 'started_at', 'shown_at', 'form_at', 'saved_at', 'converted_at', 'callback_at' );
$exp  = hd_exp_start();
$arms = HD_DD_Experiments::arms( $exp );
$sel  = array_values( array_filter( $GLOBALS['wpdb']->queries, function ( $q ) { return 0 === strpos( $q, 'SELECT arm, device' ); } ) );
check( 1 === count( $sel ) && false === strpos( $sel[0], 'doorway_at' ) && false === strpos( $sel[0], 'frame_at' ) && false === strpos( $sel[0], 'details_at' ), 'arms() leaves out the columns that are not there (' . ( $sel ? $sel[0] : 'no query' ) . ')' );
check( isset( $arms['control'], $arms['challenger'] ), 'and still reports both arms' );
$GLOBALS['wpdb']->columns   = null;
$GLOBALS['wpdb']->queries   = array();
HD_DD_Experiments::arms( $exp );
$sel = array_values( array_filter( $GLOBALS['wpdb']->queries, function ( $q ) { return 0 === strpos( $q, 'SELECT arm, device' ); } ) );
check( $sel && false !== strpos( $sel[0], 'doorway_at, frame_at, details_at' ), 'with the columns present they are read' );

hd_test_done( 'schema-v4' );
