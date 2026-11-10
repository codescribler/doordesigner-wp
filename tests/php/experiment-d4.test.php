<?php
/**
 * Designer 4 on the server: the flow is registered, its three extra journey steps are accepted
 * and counted, and the other flows' numbers are unchanged. Run: php tests/php/experiment-d4.test.php
 */
require __DIR__ . '/experiment-helpers.php';

function d4_step( array $body ) {
	return ( new HD_DD_Experiment_Tracking() )->rest_step( hd_test_request( 'POST', '/hd-door-designer/v1/experiment/step', $body ) );
}

check( 'Designer 4' === HD_DD_Experiments::flows()['designer4'], 'designer4 is a registered flow labelled Designer 4' );
check( 'designer4' === HD_DD_Experiments::canonical_flow( 'designer4' ), 'canonical_flow keeps designer4' );
check( 'designer3' === HD_DD_Experiments::canonical_flow( 'designer3' ) && 'Designer 3' === HD_DD_Experiments::flow_label( 'designer3' ), 'designer3 is unchanged' );
check( '5' === HD_DD_Experiments::DB_VERSION, 'visitors table schema is version 5' );

hd_exp_reset();
$exp = hd_exp_start( 0, 'designer3', 'designer4' );
$v   = str_repeat( 'd4', 16 );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $v, 'arm' => 'challenger', 'device' => 'phone' ) );
$ref = array( 'experimentId' => $exp['id'], 'visitorId' => $v, 'arm' => 'challenger' );
$key = $exp['id'] . '|' . $v;

foreach ( array( 'doorway', 'doorwaypicked', 'details' ) as $step ) {
	$res = d4_step( $ref + array( 'step' => $step ) );
	check( 200 === $res->get_status() && true === $res->get_data()['ok'], "step {$step} accepted" );
}
check( 400 === d4_step( $ref + array( 'step' => 'nonsense' ) )->get_status(), 'a bad step is still 400' );
$row = $wpdb->visitors[ $key ];
check( ! empty( $row['started_at'] ) && ! empty( $row['shown_at'] ) && ! empty( $row['doorway_at'] ) && ! empty( $row['frame_at'] ) && ! empty( $row['details_at'] ), 'the steps fill in the earlier columns and their own' );
check( empty( $row['form_at'] ) && empty( $row['saved_at'] ), 'D4 steps do not touch form_at or saved_at' );

// A second visitor who only reached the doorway question.
$v2 = str_repeat( 'e5', 16 );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $v2, 'arm' => 'challenger', 'device' => 'desktop' ) );
d4_step( array( 'experimentId' => $exp['id'], 'visitorId' => $v2, 'arm' => 'challenger', 'step' => 'doorway' ) );
// And one on the control arm (designer3) who never reached them.
$v3 = str_repeat( 'f6', 16 );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $v3, 'arm' => 'control', 'device' => 'phone' ) );
d4_step( array( 'experimentId' => $exp['id'], 'visitorId' => $v3, 'arm' => 'control', 'step' => 'shown' ) );

$arms = HD_DD_Experiments::arms( HD_DD_Experiments::current() );
$j    = $arms['challenger']['journey'];
check( 2 === $j['opened'] && 2 === $j['doorway'] && 1 === $j['doorwayPicked'] && 1 === $j['details'], 'the snapshot journey counts doorway, doorwayPicked and details' );
$cj = $arms['control']['journey'];
check( 1 === $cj['opened'] && 1 === $cj['started'] && 1 === $cj['shown'] && 0 === $cj['doorway'] && 0 === $cj['doorwayPicked'] && 0 === $cj['details'], 'an arm that never reaches them counts 0' );

$snap = HD_DD_Experiments::snapshot();
$sj   = $snap['current']['challenger']['journey'];
check( 2 === $sj['doorway'] && 1 === $sj['doorwayPicked'] && 1 === $sj['details'], 'the exported snapshot carries the new journey keys' );

// Existing journey keys and values are unchanged for a classic/designer3 style run.
$base = array( 'since', 'opened', 'started', 'shown', 'saved', 'form', 'quoted', 'callbacks', 'anyLeads' );
check( array_slice( array_keys( $cj ), 0, count( $base ) ) === $base, 'existing journey keys keep their order, new ones follow' );
$sum = HD_DD_Experiment_Journey::summarise( array( array( 'arm' => 'control', 'exposed_at' => '2026-09-02 00:00:00', 'started_at' => '2026-09-02 00:01:00', 'shown_at' => '2026-09-02 00:02:00', 'form_at' => '2026-09-02 00:03:00', 'converted_at' => '2026-09-02 00:04:00' ) ), '2026-09-01 00:00:00' );
$sc  = $sum['control']['journey'];
check( 1 === $sc['opened'] && 1 === $sc['started'] && 1 === $sc['shown'] && 1 === $sc['form'] && 1 === $sc['quoted'] && 0 === $sc['saved'] && 0 === $sc['doorway'], 'a classic-style row counts as before' );
