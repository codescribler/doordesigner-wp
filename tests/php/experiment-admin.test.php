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
check( 'hd_dd_exp_percent' === $A::apply( array( 'do' => 'start', 'control' => 'classic', 'challenger' => 'swipe', 'percent' => '100' ) )->get_error_code(), 'percent 100 is refused' );
check( 'hd_dd_exp_percent' === $A::apply( array( 'do' => 'start', 'control' => 'classic', 'challenger' => 'swipe', 'percent' => '0' ) )->get_error_code(), 'percent 0 is refused' );
check( null === HD_DD_Experiments::current(), 'nothing started by a refused form' );
check( 'hd_dd_exp_unknown' === $A::apply( array( 'do' => 'explode' ) )->get_error_code(), 'unknown action refused' );

check( 'started' === $A::apply( array( 'do' => 'start', 'control' => 'classic', 'challenger' => 'swipe', 'percent' => '40' ) ), 'valid start' );
$exp = HD_DD_Experiments::current();
check( $exp && 40 === $exp['percent'] && 'swipe' === $exp['challenger'], 'experiment stored with its split' );
check( 'hd_dd_exp_running' === $A::apply( array( 'do' => 'start', 'control' => 'swipe', 'challenger' => 'classic', 'percent' => '50' ) )->get_error_code(), 'a second test is refused while one runs' );

// --- Make default ------------------------------------------------------------------------------
$wpdb->seed( $exp['id'], 'control', 120, 9 );
$wpdb->seed( $exp['id'], 'challenger', 110, 14 );
check( 'hd_dd_exp_flow' === $A::apply( array( 'do' => 'make_default', 'flow' => 'bogus' ) )->get_error_code(), 'make_default only accepts one of the test\'s flows' );
check( 'made_default' === $A::apply( array( 'do' => 'make_default', 'flow' => 'swipe' ) ), 'make swipe the default' );
check( null === HD_DD_Experiments::current(), 'the experiment has ended' );
check( 'swipe' === HD_DD_Plugin::settings()['default_flow'], 'default_flow is now swipe' );
check( 'daniel@dreamfree.co.uk, hello@hertfordshiredoors.co.uk' === HD_DD_Plugin::settings()['recipient_email'], 'other settings survive' );
$h = HD_DD_Experiments::history();
check( 1 === count( $h ) && 'made_default:swipe' === $h[0]['outcome'] && ! empty( $h[0]['ended_at'] ), 'history records the outcome and end date' );
check( 110 === $h[0]['stats']['challenger']['visitors'] && 14 === $h[0]['stats']['challenger']['leads'] && 9 === $h[0]['stats']['control']['leads'], 'history keeps the final numbers' );
check( 'Swipe made the default' === $A::outcome_label( $h[0]['outcome'] ), 'outcome label' );
check( 'swipe' === HD_DD_Experiments::front_config()['default'] && null === HD_DD_Experiments::front_config()['experiment'], 'browser now gets swipe, no experiment' );

// --- Stop --------------------------------------------------------------------------------------
check( 'hd_dd_exp_none' === $A::apply( array( 'do' => 'stop' ) )->get_error_code(), 'stop with nothing running is refused' );
$A::apply( array( 'do' => 'start', 'control' => 'swipe', 'challenger' => 'classic', 'percent' => '50' ) );
check( 'stopped' === $A::apply( array( 'do' => 'stop' ) ), 'stop the test' );
check( 'swipe' === HD_DD_Plugin::settings()['default_flow'], 'stop leaves the default unchanged' );
$h = HD_DD_Experiments::history();
check( 2 === count( $h ) && 'stopped' === $h[1]['outcome'] && 'Stopped' === $A::outcome_label( 'stopped' ), 'history appends, never clears' );

// --- Settings: default_flow is sanitised to a registered flow ------------------------------------
$admin = new HD_DD_Admin( new HD_DD_Repository() );
$clean = $admin->sanitize_settings( array( 'recipient_email' => 'a@example.com', 'default_flow' => 'swipe' ) );
check( 'swipe' === $clean['default_flow'], 'a registered flow is kept' );
$GLOBALS['hd_test_options']['hd_dd_settings'] = array( 'default_flow' => 'classic' );
$clean = $admin->sanitize_settings( array( 'recipient_email' => 'a@example.com', 'default_flow' => '<b>x</b>' ) );
check( 'classic' === $clean['default_flow'], 'an unknown flow falls back to the current value' );

hd_test_done( 'experiment-admin.test.php' );
