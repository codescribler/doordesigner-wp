<?php
/**
 * The manager-app snapshot contract and the full raw export.  Run: php tests/php/experiment-snapshot.test.php
 */
require __DIR__ . '/experiment-helpers.php';

// An ended run first (so history has one), then a running one.
hd_exp_reset();
$old = hd_exp_start( 10, 'classic', 'swipe2', 50 );
$wpdb->seed( $old['id'], 'control', 4, 1 );
$wpdb->seed( $old['id'], 'challenger', 3, 0 );
HD_DD_Experiments::end( 'stopped' );

$exp = hd_exp_start( 4, 'classic', 'designer3', 50 );
HD_DD_Experiments::set_percent( 40 );
$cv = md5( 'c' );
$hv = md5( 'h' );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $cv, 'arm' => 'control' ) );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $hv, 'arm' => 'challenger' ) );
$l = new HD_DD_Experiments();
$l->on_enquiry( array( 'experiment' => array( 'experimentId' => $exp['id'], 'visitorId' => $cv, 'arm' => 'control' ) ), 1 );
$l->on_callback( array( 'experiment' => array( 'experimentId' => $exp['id'], 'visitorId' => $hv, 'arm' => 'challenger' ) ), 2 );

$s = HD_DD_Experiments::snapshot();
check( array( 'generatedAt', 'current', 'history' ) === array_keys( $s ), 'top-level keys' );
check( (bool) preg_match( '/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $s['generatedAt'] ), 'generatedAt is ISO 8601' );
$run_keys = array( 'id', 'control', 'challenger', 'percent', 'startedAt', 'endedAt', 'outcome', 'splitChanges', 'decision' );
$c = $s['current'];
check( $run_keys === array_keys( $c ), 'current run keys' );
check( $exp['id'] === $c['id'] && 40 === $c['percent'], 'id and percent' );
check( array( 'flow', 'label', 'visitors', 'leads', 'callbacks' ) === array_keys( $c['control'] ), 'arm keys' );
check( 'classic' === $c['control']['flow'] && 'Classic' === $c['control']['label'] && 'designer3' === $c['challenger']['flow'] && 'Designer 3' === $c['challenger']['label'], 'arm flows and labels' );
check( 1 === $c['control']['visitors'] && 1 === $c['control']['leads'] && 0 === $c['control']['callbacks'], 'control numbers' );
check( 1 === $c['challenger']['visitors'] && 0 === $c['challenger']['leads'] && 1 === $c['challenger']['callbacks'], 'challenger numbers (callback is not a lead)' );
check( null === $c['endedAt'] && null === $c['outcome'], 'running run has no end or outcome' );
check( 1 === count( $c['splitChanges'] ) && array( 'at', 'from', 'to' ) === array_keys( $c['splitChanges'][0] ) && 50 === $c['splitChanges'][0]['from'] && 40 === $c['splitChanges'][0]['to'], 'split change shape' );
$d = $c['decision'];
check( array( 'status', 'winner', 'probChallengerBetter', 'lossControl', 'lossChallenger', 'guards' ) === array_keys( $d ), 'decision keys' );
check( 'running' === $d['status'] && null === $d['winner'], 'running, no winner' );
check( is_float( $d['probChallengerBetter'] ) && is_float( $d['lossControl'] ) && is_float( $d['lossChallenger'] ), 'decision floats' );
$strings = is_array( $d['guards'] ) && $d['guards'] === array_values( $d['guards'] );
foreach ( $d['guards'] as $g ) {
	$strings = $strings && is_string( $g );
}
check( $strings && count( $d['guards'] ) > 0, 'guards is a list of strings' );
check( (bool) preg_grep( '/^\d+ more days?$/', $d['guards'] ), 'a days guard reads like the admin page' );
check( (bool) preg_grep( '/more leads? in Classic$/', $d['guards'] ), 'a leads guard names the arm' );

check( 1 === count( $s['history'] ), 'one finished run' );
$h = $s['history'][0];
check( $run_keys === array_keys( $h ) && 'stopped' === $h['outcome'] && is_string( $h['endedAt'] ), 'history run: outcome and endedAt' );
check( 4 === $h['control']['visitors'] && 1 === $h['control']['leads'] && 3 === $h['challenger']['visitors'], 'history numbers from stored stats' );
check( 'swipe2' === $h['challenger']['flow'] && 'Swipe 2' === $h['challenger']['label'], 'history flows' );
check( is_array( $h['decision']['guards'] ), 'history decision guards' );

// A history entry stored before callbacks existed reads callbacks as 0.
$hist = HD_DD_Experiments::history();
unset( $hist[0]['stats']['control']['callbacks'] );
update_option( HD_DD_Experiments::HISTORY, $hist );
check( 0 === HD_DD_Experiments::snapshot()['history'][0]['control']['callbacks'], 'old history reads callbacks as 0' );
check( is_string( json_encode( $s ) ), 'snapshot encodes to JSON' );

// No experiment at all.
hd_exp_reset();
$e = HD_DD_Experiments::snapshot();
check( null === $e['current'] && array() === $e['history'], 'empty snapshot' );

// --- export_data ---------------------------------------------------------------------------------
hd_exp_reset();
$exp = hd_exp_start( 1 );
$wpdb->seed( $exp['id'], 'control', 3, 1 );
$wpdb->seed( $exp['id'], 'challenger', 2, 0 );
$ref = array( 'experimentId' => $exp['id'], 'visitorId' => md5( 'x' ), 'arm' => 'control', 'flow' => 'classic' );
$wpdb->insert( 'wp_hd_enquiries', array( 'reference' => 'HD-1', 'kind' => 'enquiry', 'flow' => 'classic', 'created_at' => '2026-10-01 10:00:00', 'customer_name' => 'Jane Doe', 'customer_email' => 'jane@example.com', 'customer_phone' => '0123', 'payload' => json_encode( array( 'experiment' => $ref ) ) ) );
$wpdb->insert( 'wp_hd_enquiries', array( 'reference' => 'HD-2', 'kind' => 'save', 'flow' => 'classic', 'created_at' => '2026-10-01 11:00:00', 'payload' => json_encode( array( 'x' => 1 ) ) ) );
$x = HD_DD_Experiments::export_data();
check( array( 'exportedAt', 'current', 'history', 'visitors', 'enquiries' ) === array_keys( $x ), 'export keys' );
check( 5 === count( $x['visitors'] ) && isset( $x['visitors'][0]['experiment_id'], $x['visitors'][0]['exposed_at'] ), 'every visitor row, raw columns' );
check( $exp['id'] === $x['current']['id'] && array() === $x['history'], 'raw current and history' );
check( 1 === count( $x['enquiries'] ) && 'HD-1' === $x['enquiries'][0]['reference'], 'only experiment-tagged enquiries' );
check( array( 'reference', 'kind', 'flow', 'created_at', 'experimentId', 'arm' ) === array_keys( $x['enquiries'][0] ) && $exp['id'] === $x['enquiries'][0]['experimentId'] && 'control' === $x['enquiries'][0]['arm'], 'enquiry entry shape' );
$json = json_encode( $x );
check( false === strpos( $json, 'jane@example.com' ) && false === strpos( $json, 'Jane' ) && false === strpos( $json, 'customer_email' ) && false === strpos( $json, '0123' ), 'no customer details in the export' );

hd_test_done( 'experiment-snapshot.test.php' );
