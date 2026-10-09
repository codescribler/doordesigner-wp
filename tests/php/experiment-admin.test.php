<?php
/**
 * Experiments page actions: start, Make X the default, Stop test, and the history
 * they leave behind; plus the default_flow setting.  Run: php tests/php/experiment-admin.test.php
 */
require __DIR__ . '/experiment-helpers.php';
require_once HD_DD_DIR . 'includes/class-hd-admin.php';
require_once HD_DD_DIR . 'includes/class-hd-experiments-admin.php';

$A = 'HD_DD_Experiments_Admin';

// --- Start: validation -------------------------------------------------------------------
hd_exp_reset();
check( 'hd_dd_exp_flows' === $A::apply( array( 'do' => 'start', 'control' => 'classic', 'challenger' => 'classic', 'percent' => '50' ) )->get_error_code(), 'same flow twice is refused' );
check( 'hd_dd_exp_flows' === $A::apply( array( 'do' => 'start', 'control' => 'classic', 'challenger' => 'nope', 'percent' => '50' ) )->get_error_code(), 'unregistered flow is refused' );
check( 'hd_dd_exp_percent' === $A::apply( array( 'do' => 'start', 'control' => 'classic', 'challenger' => 'swipe2', 'percent' => '100' ) )->get_error_code(), 'percent 100 is refused' );
check( 'hd_dd_exp_percent' === $A::apply( array( 'do' => 'start', 'control' => 'classic', 'challenger' => 'swipe2', 'percent' => '0' ) )->get_error_code(), 'percent 0 is refused' );
check( null === HD_DD_Experiments::current(), 'nothing started by a refused form' );
check( 'hd_dd_exp_unknown' === $A::apply( array( 'do' => 'explode' ) )->get_error_code(), 'unknown action refused' );

check( 'started' === $A::apply( array( 'do' => 'start', 'control' => 'classic', 'challenger' => 'swipe2', 'percent' => '40' ) ), 'valid start' );
$exp = HD_DD_Experiments::current();
check( $exp && 40 === $exp['percent'] && 'swipe2' === $exp['challenger'], 'experiment stored with its split' );
check( 'hd_dd_exp_running' === $A::apply( array( 'do' => 'start', 'control' => 'swipe2', 'challenger' => 'classic', 'percent' => '50' ) )->get_error_code(), 'a second test is refused while one runs' );

// --- Change the split while the test runs --------------------------------------------------------
check( 'hd_dd_exp_percent' === $A::apply( array( 'do' => 'set_percent', 'percent' => '100' ) )->get_error_code(), 'new split 100 is refused' );
check( 'hd_dd_exp_percent' === $A::apply( array( 'do' => 'set_percent', 'percent' => '0' ) )->get_error_code(), 'new split 0 is refused' );
check( 'hd_dd_exp_percent' === $A::apply( array( 'do' => 'set_percent' ) )->get_error_code(), 'a missing split is refused' );
check( 'hd_dd_exp_same' === $A::apply( array( 'do' => 'set_percent', 'percent' => '40' ) )->get_error_code(), 'the same split is not a change' );
check( 40 === HD_DD_Experiments::current()['percent'] && empty( HD_DD_Experiments::current()['split_changes'] ), 'refused changes leave the split and its log alone' );
check( 'split_changed' === $A::apply( array( 'do' => 'set_percent', 'percent' => '25' ) ), 'valid split change' );
$changed = HD_DD_Experiments::current();
check( 25 === $changed['percent'] && 25 === HD_DD_Experiments::front_config()['experiment']['percent'], 'the new split is stored and sent to the browser' );
check( $exp['id'] === $changed['id'] && $exp['started_at'] === $changed['started_at'] && 'running' === $changed['status'], 'the test keeps its id, start date and status' );
check( 1 === count( $changed['split_changes'] ) && 40 === $changed['split_changes'][0]['from'] && 25 === $changed['split_changes'][0]['to'] && ! empty( $changed['split_changes'][0]['at'] ), 'the change is logged with its time' );
$A::apply( array( 'do' => 'set_percent', 'percent' => '60' ) );
$changed = HD_DD_Experiments::current();
check( 2 === count( $changed['split_changes'] ) && 25 === $changed['split_changes'][1]['from'] && 60 === $changed['split_changes'][1]['to'], 'later changes append to the log' );

// --- Make default ------------------------------------------------------------------------------
$wpdb->seed( $exp['id'], 'control', 120, 9 );
$wpdb->seed( $exp['id'], 'challenger', 110, 14 );
check( 'hd_dd_exp_flow' === $A::apply( array( 'do' => 'make_default', 'flow' => 'bogus' ) )->get_error_code(), 'make_default only accepts one of the test\'s flows' );
check( 'made_default' === $A::apply( array( 'do' => 'make_default', 'flow' => 'swipe2' ) ), 'make swipe2 the default' );
check( null === HD_DD_Experiments::current(), 'the experiment has ended' );
check( 'swipe2' === HD_DD_Plugin::settings()['default_flow'], 'default_flow is now swipe2' );
check( 'daniel@dreamfree.co.uk, hello@hertfordshiredoors.co.uk' === HD_DD_Plugin::settings()['recipient_email'], 'other settings survive' );
$h = HD_DD_Experiments::history();
check( 1 === count( $h ) && 'made_default:swipe2' === $h[0]['outcome'] && ! empty( $h[0]['ended_at'] ), 'history records the outcome and end date' );
check( 110 === $h[0]['stats']['challenger']['visitors'] && 14 === $h[0]['stats']['challenger']['leads'] && 9 === $h[0]['stats']['control']['leads'], 'history keeps the final numbers' );
check( 60 === $h[0]['percent'] && 2 === count( $h[0]['split_changes'] ), 'history keeps the final split and its changes' );
check( 'Swipe 2 made the default' === $A::outcome_label( $h[0]['outcome'] ), 'outcome label' );
check( 'swipe2' === HD_DD_Experiments::front_config()['default'] && null === HD_DD_Experiments::front_config()['experiment'], 'browser now gets swipe2, no experiment' );

// --- Stop --------------------------------------------------------------------------------------
check( 'hd_dd_exp_none' === $A::apply( array( 'do' => 'stop' ) )->get_error_code(), 'stop with nothing running is refused' );
check( 'hd_dd_exp_none' === $A::apply( array( 'do' => 'set_percent', 'percent' => '30' ) )->get_error_code(), 'a split change with nothing running is refused' );
$A::apply( array( 'do' => 'start', 'control' => 'swipe2', 'challenger' => 'classic', 'percent' => '50' ) );
check( 'stopped' === $A::apply( array( 'do' => 'stop' ) ), 'stop the test' );
check( 'swipe2' === HD_DD_Plugin::settings()['default_flow'], 'stop leaves the default unchanged' );
$h = HD_DD_Experiments::history();
check( 2 === count( $h ) && 'stopped' === $h[1]['outcome'] && 'Stopped' === $A::outcome_label( 'stopped' ), 'history appends, never clears' );

// --- Settings: default_flow is sanitised to a registered flow ------------------------------------
$admin = new HD_DD_Admin( new HD_DD_Repository() );
$clean = $admin->sanitize_settings( array( 'recipient_email' => 'a@example.com', 'default_flow' => 'swipe2' ) );
check( 'swipe2' === $clean['default_flow'], 'a registered flow is kept' );
$GLOBALS['hd_test_options']['hd_dd_settings'] = array( 'default_flow' => 'classic' );
$clean = $admin->sanitize_settings( array( 'recipient_email' => 'a@example.com', 'default_flow' => '<b>x</b>' ) );
check( 'classic' === $clean['default_flow'], 'an unknown flow falls back to the current value' );

hd_test_done( 'experiment-admin.test.php' );
