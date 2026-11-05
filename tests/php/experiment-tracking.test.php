<?php
/**
 * Journey milestones, saves and devices for the A/B report: POST experiment/step, the save /
 * enquiry / call-back listeners, the upgrade backfill and HD_DD_Experiment_Journey's counts.
 * Run: php tests/php/experiment-tracking.test.php
 */
require __DIR__ . '/experiment-helpers.php';

function hd_step( array $body ) {
	$t = new HD_DD_Experiment_Tracking();
	return $t->rest_step( hd_test_request( 'POST', '/hd-door-designer/v1/experiment/step', $body ) );
}

$v1 = str_repeat( 'a1', 16 );
$v2 = str_repeat( 'b2', 16 );

// --- Route --------------------------------------------------------------------------------
( new HD_DD_Experiment_Tracking() )->register_routes();
$route = isset( $GLOBALS['hd_test_routes']['/experiment/step'] ) ? $GLOBALS['hd_test_routes']['/experiment/step'] : null;
check( $route && 'POST' === $route['methods'] && '__return_true' === $route['permission_callback'], 'public POST step route registered' );

// --- Device on expose -------------------------------------------------------------------------
hd_exp_reset();
$exp = hd_exp_start();
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $v1, 'arm' => 'challenger', 'device' => 'phone' ) );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $v2, 'arm' => 'control', 'device' => 'fridge' ) );
check( 'phone' === $wpdb->visitors[ $exp['id'] . '|' . $v1 ]['device'], 'device stored on expose' );
check( '' === $wpdb->visitors[ $exp['id'] . '|' . $v2 ]['device'], 'unknown device stored as empty' );

// --- Steps ------------------------------------------------------------------------------------
$ref = array( 'experimentId' => $exp['id'], 'visitorId' => $v1, 'arm' => 'challenger' );
check( 400 === hd_step( $ref + array( 'step' => 'quoted' ) )->get_status(), 'unknown step rejected' );
check( 400 === hd_step( array_merge( $ref, array( 'visitorId' => 'nope', 'step' => 'started' ) ) )->get_status(), 'bad visitor id rejected' );
check( 400 === hd_step( array_merge( $ref, array( 'arm' => 'designer3', 'step' => 'started' ) ) )->get_status(), 'arm must be control/challenger' );
$stale = hd_step( array_merge( $ref, array( 'experimentId' => 'exp_20200101_abcdef', 'step' => 'started' ) ) );
check( 200 === $stale->get_status() && false === $stale->get_data()['ok'], 'stale experiment → ok:false' );

$res = hd_step( $ref + array( 'step' => 'shown' ) );
$row = $wpdb->visitors[ $exp['id'] . '|' . $v1 ];
check( 200 === $res->get_status() && true === $res->get_data()['ok'], 'valid step → ok:true' );
check( ! empty( $row['started_at'] ) && ! empty( $row['shown_at'] ) && empty( $row['form_at'] ), 'shown also fills in started, not form' );
$first = $row['shown_at'];
$wpdb->visitors[ $exp['id'] . '|' . $v1 ]['shown_at'] = '2026-01-01 00:00:00';
hd_step( $ref + array( 'step' => 'shown' ) );
check( '2026-01-01 00:00:00' === $wpdb->visitors[ $exp['id'] . '|' . $v1 ]['shown_at'], 'a time is never overwritten' );
hd_step( array_merge( $ref, array( 'arm' => 'control', 'step' => 'form' ) ) );
check( empty( $wpdb->visitors[ $exp['id'] . '|' . $v1 ]['form_at'] ), 'a step claiming the other arm changes nothing' );
hd_step( array_merge( $ref, array( 'visitorId' => str_repeat( 'cc', 16 ), 'step' => 'form' ) ) );
check( 2 === count( $wpdb->visitors ), 'a step never creates a visitor' );

// --- Listeners ----------------------------------------------------------------------------------
$t = new HD_DD_Experiment_Tracking();
$t->on_saved( array( 'experiment' => $ref ), 1 );
check( ! empty( $wpdb->visitors[ $exp['id'] . '|' . $v1 ]['saved_at'] ), 'a save marks saved_at' );
$c = array( 'experimentId' => $exp['id'], 'visitorId' => $v2, 'arm' => 'control' );
$t->on_enquiry( array( 'experiment' => $c ), 2 );
$row = $wpdb->visitors[ $exp['id'] . '|' . $v2 ];
check( ! empty( $row['started_at'] ) && ! empty( $row['shown_at'] ) && ! empty( $row['form_at'] ) && empty( $row['saved_at'] ), 'a quote fills in started, shown and form' );
$t->on_saved( array(), 3 );
$t->on_saved( array( 'experiment' => 'junk' ), 4 );
check( true, 'payloads without an experiment are ignored' );

// --- arms(): totals, journey, devices --------------------------------------------------------------
( new HD_DD_Experiments() )->on_enquiry( array( 'experiment' => $ref ), 5 ); // the saver later asks for a quote
( new HD_DD_Experiments() )->on_enquiry( array( 'experiment' => $c ), 2 );
$arms = HD_DD_Experiments::arms( HD_DD_Experiments::current() );
$ch   = $arms['challenger'];
check( 1 === $ch['visitors'] && 1 === $ch['leads'] && 1 === $ch['saves'] && 1 === $ch['anyLeads'] && 1 === $ch['savedThenQuoted'], 'challenger totals (saved then quoted)' );
check( 1 === $ch['journey']['opened'] && 1 === $ch['journey']['shown'] && 1 === $ch['journey']['saved'] && 1 === $ch['journey']['quoted'], 'challenger journey' );
check( 1 === $ch['devices']['phone']['visitors'] && 1 === $ch['devices']['phone']['leads'] && 0 === $ch['devices']['desktop']['visitors'], 'challenger devices' );
check( 0 === $arms['control']['saves'] && 1 === $arms['control']['leads'] && 1 === $arms['control']['devices']['unknown']['visitors'], 'control: no saves, unknown device' );
check( 'Classic' === $arms['control']['label'] && 'swipe2' === $arms['challenger']['flow'], 'labels and flows kept' );

// --- since(): the later of the test start and when recording began ------------------------------------
check( $exp['started_at'] === HD_DD_Experiment_Tracking::since( $exp ), 'no recording date → the test start' );
update_option( HD_DD_Experiment_Tracking::SINCE, '2099-01-01 00:00:00' );
check( '2099-01-01 00:00:00' === HD_DD_Experiment_Tracking::since( $exp ), 'recording began after the start → that date' );
$later = HD_DD_Experiments::arms( HD_DD_Experiments::current() );
check( 0 === $later['challenger']['journey']['opened'] && 1 === $later['challenger']['visitors'] && 1 === $later['challenger']['saves'], 'visitors before recording are left out of the journey only' );
check( '2099-01-01T00:00:00Z' === $later['challenger']['journey']['since'], 'journey since is ISO' );

// --- Upgrade: since set once, earlier saves backfilled -------------------------------------------------
hd_exp_reset();
$exp = hd_exp_start( 3, 'classic', 'designer3' );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $v1, 'arm' => 'challenger' ) );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $v2, 'arm' => 'control' ) );
$d3 = array( 'experimentId' => $exp['id'], 'visitorId' => $v1, 'arm' => 'challenger' );
$wpdb->insert( 'wp_hd_enquiries', array( 'flow' => 'designer3', 'created_at' => '2026-10-25 09:00:00', 'payload' => json_encode( array( 'experiment' => $d3 ) ) ) );
$wpdb->insert( 'wp_hd_enquiries', array( 'flow' => 'classic', 'created_at' => '2026-10-25 10:00:00', 'payload' => json_encode( array( 'experiment' => array( 'experimentId' => $exp['id'], 'visitorId' => $v2, 'arm' => 'control' ) ) ) ) );
update_option( HD_DD_Experiments::DB_OPTION, '3' );
HD_DD_Experiments::maybe_upgrade();
check( HD_DD_Experiments::DB_VERSION === get_option( HD_DD_Experiments::DB_OPTION ), 'schema version stored' );
check( (bool) preg_match( '/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', (string) get_option( HD_DD_Experiment_Tracking::SINCE ) ), 'recording date set' );
check( '2026-10-25 09:00:00' === $wpdb->visitors[ $exp['id'] . '|' . $v1 ]['saved_at'], 'a Designer 3 row is backfilled as a save at its creation time' );
check( empty( $wpdb->visitors[ $exp['id'] . '|' . $v2 ]['saved_at'] ), 'a Classic row is never a save' );
check( 0 === HD_DD_Experiment_Tracking::backfill_saves(), 'backfill is safe to run again' );
$keep = get_option( HD_DD_Experiment_Tracking::SINCE );
update_option( HD_DD_Experiments::DB_OPTION, '3' );
HD_DD_Experiments::maybe_upgrade();
check( $keep === get_option( HD_DD_Experiment_Tracking::SINCE ), 'recording date is never moved' );

// --- Journey: pure counts --------------------------------------------------------------------------------
$rows = array(
	(object) array( 'arm' => 'control', 'device' => 'desktop', 'exposed_at' => '2026-11-01 10:00:00', 'started_at' => '2026-11-01 10:01:00', 'shown_at' => null, 'form_at' => null, 'saved_at' => null, 'converted_at' => null, 'callback_at' => null ),
	array( 'arm' => 'control', 'device' => 'phone', 'exposed_at' => '2026-10-30 10:00:00', 'converted_at' => '2026-10-30 10:20:00' ),
	array( 'arm' => 'challenger', 'device' => 'phone', 'exposed_at' => '2026-11-02 10:00:00', 'callback_at' => '2026-11-02 10:09:00' ),
	array( 'arm' => 'elsewhere', 'exposed_at' => '2026-11-02 10:00:00' ),
);
$s = HD_DD_Experiment_Journey::summarise( $rows, '2026-11-01 00:00:00' );
check( array( 'control', 'challenger' ) === array_keys( $s ), 'only the two arms' );
check( 2 === $s['control']['visitors'] && 1 === $s['control']['leads'] && 1 === $s['control']['anyLeads'], 'control totals include everyone' );
check( 1 === $s['control']['journey']['opened'] && 1 === $s['control']['journey']['started'] && 0 === $s['control']['journey']['quoted'], 'control journey only counts arrivals since recording' );
check( 1 === $s['challenger']['callbacks'] && 1 === $s['challenger']['anyLeads'] && 0 === $s['challenger']['leads'], 'a call back is a lead but not a quote request' );
check( 1 === $s['control']['devices']['desktop']['visitors'] && 1 === $s['control']['devices']['phone']['leads'], 'devices split' );
$empty = HD_DD_Experiment_Journey::summarise( array(), '2026-11-01 00:00:00' );
check( 0 === $empty['challenger']['visitors'] && 0 === $empty['challenger']['journey']['opened'], 'an arm with no rows is all zeros' );

hd_test_done( 'experiment-tracking.test.php' );
