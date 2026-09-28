<?php
/**
 * POST /experiment/expose: validation, first-exposure-wins, rate limit, and the
 * front-end flow config.  Run: php tests/php/experiment-expose.test.php
 */
require __DIR__ . '/experiment-helpers.php';

$vid = str_repeat( 'ab', 16 );

// --- Route registration -------------------------------------------------------------
( new HD_DD_Experiments() )->register_routes();
$route = isset( $GLOBALS['hd_test_routes']['/experiment/expose'] ) ? $GLOBALS['hd_test_routes']['/experiment/expose'] : null;
check( $route && 'POST' === $route['methods'] && '__return_true' === $route['permission_callback'], 'public POST route registered' );

// --- No experiment: ok:false, nothing stored -------------------------------------------
hd_exp_reset();
$res = hd_exp_expose( array( 'experimentId' => 'exp_20260928_abcdef', 'visitorId' => $vid, 'arm' => 'control' ) );
check( 200 === $res->get_status() && false === $res->get_data()['ok'], 'unknown experiment → 200 ok:false' );
check( 0 === count( $wpdb->visitors ), 'nothing stored without an experiment' );

// --- Running experiment ------------------------------------------------------------------
hd_exp_reset();
$exp = hd_exp_start();
check( is_array( $exp ) && preg_match( '/^exp_\d{8}_[a-f0-9]{6}$/', $exp['id'] ), 'experiment id shape (got ' . ( is_array( $exp ) ? $exp['id'] : 'error' ) . ')' );
check( 'running' === $exp['status'] && 50 === $exp['percent'], 'starts running at 50%' );
check( is_wp_error( HD_DD_Experiments::start( 'classic', 'swipe' ) ), 'only one experiment at a time' );

$res = hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => 'challenger' ) );
check( 200 === $res->get_status() && true === $res->get_data()['ok'], 'valid exposure → ok:true' );
check( 1 === count( $wpdb->visitors ), 'one visitor row' );
$last = end( $wpdb->queries );
check( 0 === strpos( $last, 'INSERT IGNORE INTO wp_hd_dd_experiment_visitors' ), 'uses INSERT IGNORE' );

// Same visitor again, even claiming the other arm: first exposure wins.
$res = hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => 'control' ) );
check( true === $res->get_data()['ok'], 'repeat exposure is still ok' );
check( 1 === count( $wpdb->visitors ), 'still one row' );
check( 'challenger' === $wpdb->visitors[ $exp['id'] . '|' . $vid ]['arm'], 'arm never changes after the first exposure' );

// --- Rejections ---------------------------------------------------------------------------
$bad = array(
	'short visitor id'     => array( 'visitorId' => 'abc123', 'arm' => 'control' ),
	'uppercase visitor id' => array( 'visitorId' => strtoupper( $vid ), 'arm' => 'control' ),
	'foreign arm (flow key)' => array( 'visitorId' => $vid, 'arm' => 'swipe' ),
	'missing arm'          => array( 'visitorId' => $vid ),
);
foreach ( $bad as $why => $body ) {
	$res = hd_exp_expose( array_merge( array( 'experimentId' => $exp['id'] ), $body ) );
	check( 400 === $res->get_status() && false === $res->get_data()['ok'], "$why → 400" );
}
$res = hd_exp_expose( array( 'experimentId' => 'exp_20200101_000000', 'visitorId' => md5( 'x' ), 'arm' => 'control' ) );
check( 200 === $res->get_status() && false === $res->get_data()['ok'], 'another experiment id → ok:false' );
check( 1 === count( $wpdb->visitors ), 'rejections store nothing' );

// Winner found / no difference still count (the test runs until Daniel acts).
$exp['status'] = 'winner_found';
HD_DD_Experiments::save( $exp );
$res = hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => md5( 'later' ), 'arm' => 'control' ) );
check( true === $res->get_data()['ok'] && 2 === count( $wpdb->visitors ), 'winner_found still records exposures' );

// --- Rate limit: 30 per IP per hour --------------------------------------------------------
hd_exp_reset();
$exp = hd_exp_start();
$codes = array();
for ( $i = 0; $i < 32; $i++ ) {
	$codes[] = hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => md5( "v$i" ), 'arm' => 'control' ) )->get_status();
}
check( 30 === count( array_filter( $codes, function ( $c ) { return 200 === $c; } ) ), '30 requests allowed' );
check( 429 === $codes[30] && 429 === $codes[31], 'the 31st is 429' );
check( 30 === count( $wpdb->visitors ), 'rate-limited requests store nothing' );
$_SERVER['REMOTE_ADDR'] = '198.51.100.7';
check( 200 === hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => md5( 'other-ip' ), 'arm' => 'control' ) )->get_status(), 'another IP is unaffected' );
foreach ( $GLOBALS['hd_test_transients'] as $k => $t ) {
	check( false === strpos( $k, '198.51' ) && false === strpos( $k, '203.0' ), 'transient key does not contain the raw IP' );
}

// --- Front-end config ------------------------------------------------------------------------
hd_exp_reset();
check( array( 'default' => 'classic', 'experiment' => null ) === HD_DD_Experiments::front_config(), 'no experiment → default classic' );
$GLOBALS['hd_test_options']['hd_dd_settings'] = array( 'default_flow' => 'swipe' );
check( 'swipe' === HD_DD_Experiments::front_config()['default'], 'default follows the setting' );
$GLOBALS['hd_test_options']['hd_dd_settings'] = array( 'default_flow' => 'bogus' );
check( 'classic' === HD_DD_Experiments::front_config()['default'], 'an unregistered default falls back to classic' );
$exp = hd_exp_start( 0, 'classic', 'swipe', 30 );
check( array( 'id' => $exp['id'], 'control' => 'classic', 'challenger' => 'swipe', 'percent' => 30 ) === HD_DD_Experiments::front_config()['experiment'], 'experiment carried to the browser' );
check( is_wp_error( HD_DD_Experiments::start( 'classic', 'classic' ) ), 'control and challenger must differ' );

// --- Cron scheduling --------------------------------------------------------------------------
HD_DD_Experiments::schedule();
check( false !== wp_next_scheduled( HD_DD_Experiments::CRON ), 'daily evaluation scheduled' );

hd_test_done( 'experiment-expose.test.php' );
