<?php
/**
 * Swipe 2 replaces the first swipe flow: the flow list, the alias, and the upgrade that
 * files a running Classic vs Swipe test under Finished.  Run: php tests/php/experiment-flows.test.php
 */
require __DIR__ . '/experiment-helpers.php';

hd_exp_reset();
check( array( 'classic', 'swipe2' ) === array_keys( HD_DD_Experiments::flows() ), 'live flows are classic and swipe2' );
check( 'Swipe 2' === HD_DD_Experiments::flow_label( 'swipe2' ), 'swipe2 is labelled Swipe 2' );
check( 'Swipe' === HD_DD_Experiments::flow_label( 'swipe' ), 'the retired flow still has a label for history' );
check( 'swipe2' === HD_DD_Experiments::canonical_flow( 'swipe' ), 'swipe is an alias of swipe2' );
check( 'swipe2' === HD_DD_Experiments::canonical_flow( ' SWIPE2 ' ), 'case and spaces are forgiven' );
check( 'classic' === HD_DD_Experiments::canonical_flow( 'classic' ), 'classic passes through' );
check( '' === HD_DD_Experiments::canonical_flow( 'made-up' ), 'unknown flows become empty' );
check( '' === HD_DD_Experiments::canonical_flow( array( 'x' ) ), 'non-strings become empty' );

// A running Classic vs Swipe test is stopped and kept in history.
hd_exp_reset();
update_option( HD_DD_Experiments::OPTION, array(
	'id' => 'exp_20261001_7d55ea', 'control' => 'classic', 'challenger' => 'swipe', 'percent' => 50,
	'started_at' => '2026-10-01 14:13:32', 'status' => 'running', 'decided_at' => null, 'decision' => null,
	'emailed' => array( 'winner' => false, 'no_difference' => false ), 'unattributed' => 0,
) );
update_option( 'hd_dd_settings', array( 'default_flow' => 'swipe' ) );
HD_DD_Experiments::migrate_flows();
check( null === HD_DD_Experiments::current(), 'the running test is ended' );
$history = HD_DD_Experiments::history();
check( 1 === count( $history ) && 'stopped' === $history[0]['outcome'], 'it is filed as stopped' );
check( 'swipe' === $history[0]['challenger'], 'history keeps the old flow key' );
check( 'swipe2' === HD_DD_Plugin::settings()['default_flow'], 'a swipe default becomes swipe2' );

// Nothing to do: a test between live flows, and a second run, are left alone.
hd_exp_reset();
update_option( HD_DD_Experiments::OPTION, array(
	'id' => 'exp_20261020_aaaaaa', 'control' => 'classic', 'challenger' => 'swipe2', 'percent' => 50,
	'started_at' => '2026-10-20 09:00:00', 'status' => 'running', 'decided_at' => null, 'decision' => null,
	'emailed' => array( 'winner' => false, 'no_difference' => false ), 'unattributed' => 0,
) );
HD_DD_Experiments::migrate_flows();
HD_DD_Experiments::migrate_flows();
check( null !== HD_DD_Experiments::current(), 'a Classic vs Swipe 2 test keeps running' );
check( array() === HD_DD_Experiments::history(), 'and nothing is added to history' );
check( '2' === HD_DD_Experiments::DB_VERSION, 'version bumped so the migration runs on update' );

hd_test_done( 'experiment-flows.test.php' );
