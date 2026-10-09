<?php
/**
 * Enquiry → conversion: the enquiry payload carries a valid `experiment` ref, the
 * listener converts a visitor once, unexposed leads count as unattributed, and the
 * daily evaluation emails once.  Run: php tests/php/experiment-conversion.test.php
 */
require __DIR__ . '/experiment-helpers.php';

function hd_exp_submit( $experiment ) {
	$enq  = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
	$body = array(
		'consent'   => true,
		'name'      => 'Real Customer',
		'email'     => 'real@example.com',
		'telephone' => '01234 567890',
		'postcode'  => 'AL1 1AA',
		'design'    => array( 'Door Type' => array( 'label' => 'Single Door', 'id' => null ) ),
	);
	if ( null !== $experiment ) {
		$body['experiment'] = $experiment;
	}
	return $enq->rest_submit( hd_test_request( 'POST', '/hd-door-designer/v1/enquiry', $body ) );
}
function hd_exp_last_payload() {
	global $wpdb;
	$rows = $wpdb->rows;
	$row  = end( $rows );
	return json_decode( $row['payload'], true );
}

// --- Payload: valid ref stored, malformed ones dropped --------------------------------
hd_exp_reset();
( new HD_DD_Experiments() )->register();
$exp = hd_exp_start();
$vid = md5( 'visitor-1' );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => 'challenger' ) );

$res = hd_exp_submit( array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => 'challenger' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'enquiry accepted' );
$p = hd_exp_last_payload();
check( isset( $p['experiment'] ) && array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => 'challenger', 'flow' => 'swipe2' ) === $p['experiment'], 'payload carries the experiment ref + its flow' );
check( null !== $wpdb->visitors[ $exp['id'] . '|' . $vid ]['converted_at'], 'listener converted the visitor' );
$converted_at = $wpdb->visitors[ $exp['id'] . '|' . $vid ]['converted_at'];

$malformed = array(
	'bad id'        => array( 'experimentId' => 'exp_2026_x', 'visitorId' => $vid, 'arm' => 'control' ),
	'bad visitor'   => array( 'experimentId' => $exp['id'], 'visitorId' => 'nope', 'arm' => 'control' ),
	'bad arm'       => array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => '<script>' ),
	'missing field' => array( 'experimentId' => $exp['id'], 'visitorId' => $vid ),
	'not an object' => 'exp_20260928_abcdef',
);
foreach ( $malformed as $why => $ref ) {
	hd_exp_submit( $ref );
	$p = hd_exp_last_payload();
	check( ! isset( $p['experiment'] ), "$why → no experiment in payload" );
}
hd_exp_submit( null );
check( ! isset( hd_exp_last_payload()['experiment'] ), 'no ref → no experiment key' );
check( 0 === (int) HD_DD_Experiments::current()['unattributed'], 'malformed refs never count as unattributed' );

// --- Converts once ---------------------------------------------------------------------------
hd_exp_submit( array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => 'challenger' ) );
check( $converted_at === $wpdb->visitors[ $exp['id'] . '|' . $vid ]['converted_at'], 'a second enquiry does not re-convert' );
check( 0 === (int) HD_DD_Experiments::current()['unattributed'], 'a repeat lead is not unattributed' );
$arms = HD_DD_Experiments::arms( HD_DD_Experiments::current() );
check( 1 === $arms['challenger']['visitors'] && 1 === $arms['challenger']['leads'] && 0 === $arms['control']['visitors'], 'stats: challenger 1 visitor / 1 lead' );

// Wrong arm for a known visitor: ignored, not unattributed.
hd_exp_submit( array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => 'control' ) );
check( 0 === (int) HD_DD_Experiments::current()['unattributed'], 'a mismatched arm is ignored' );

// --- Unattributed: a lead with no exposure row --------------------------------------------------
hd_exp_submit( array( 'experimentId' => $exp['id'], 'visitorId' => md5( 'never-exposed' ), 'arm' => 'control' ) );
check( 1 === (int) HD_DD_Experiments::current()['unattributed'], 'unexposed lead increments unattributed' );
hd_exp_submit( array( 'experimentId' => 'exp_20200101_abcdef', 'visitorId' => md5( 'old' ), 'arm' => 'control' ) );
check( 1 === (int) HD_DD_Experiments::current()['unattributed'], 'a lead from an old experiment does not count' );

// Honeypot-flagged enquiries still convert.
$vid2 = md5( 'visitor-2' );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $vid2, 'arm' => 'control' ) );
$enq = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
$enq->rest_submit( hd_test_request( 'POST', '/x', array( 'hd_hp' => 'autofill', 'consent' => true, 'name' => 'A', 'email' => 'a@example.com', 'telephone' => '0123', 'postcode' => 'AL1 1AA', 'design' => array( 'Door Type' => array( 'label' => 'Single Door', 'id' => null ) ), 'experiment' => array( 'experimentId' => $exp['id'], 'visitorId' => $vid2, 'arm' => 'control' ) ) ) );
check( null !== $wpdb->visitors[ $exp['id'] . '|' . $vid2 ]['converted_at'], 'a flagged (honeypot) enquiry still converts' );

// --- Daily evaluation: winner emailed once --------------------------------------------------------
hd_exp_reset();
$exp = hd_exp_start( 30 );
$wpdb->seed( $exp['id'], 'control', 1000, 20 );
$wpdb->seed( $exp['id'], 'challenger', 1000, 50 );
$e = new HD_DD_Experiments();
$e->evaluate_current();
$cur = HD_DD_Experiments::current();
check( 'winner_found' === $cur['status'] && 'swipe2' === $cur['decision']['winner'], 'cron marks winner_found' );
check( ! empty( $cur['decided_at'] ) && true === $cur['emailed']['winner'], 'decided_at + emailed recorded' );
$mail = $GLOBALS['hd_test_mail'];
check( 1 === count( $mail ), 'one email sent' );
check( $mail && 'Door designer A/B test: Swipe 2 is the clear winner' === $mail[0]['subject'], 'winner subject (got "' . ( $mail ? $mail[0]['subject'] : '' ) . '")' );
check( $mail && 'daniel@dreamfree.co.uk, hello@hertfordshiredoors.co.uk' === $mail[0]['to'], 'sent to the enquiry recipients' );
$body = $mail ? $mail[0]['message'] : '';
foreach ( array( 'Classic: 1000 visitors opened the designer, 20 enquiries (2.0% conversion)', 'Swipe 2: 1000 visitors opened the designer, 50 enquiries (5.0% conversion)', '100% chance', 'run for 30 days', 'admin.php?page=hd-dd-experiments', 'Make X the default', 'Expected loss if you pick Swipe 2: 0.00', 'Expected loss if you pick Classic: 2.99', 'For context: with about 4 leads a week' ) as $needle ) {
	check( false !== strpos( $body, $needle ), "email body contains \"$needle\"" );
}
$e->evaluate_current();
check( 1 === count( $GLOBALS['hd_test_mail'] ), 'the winner email is not repeated' );
check( 'winner_found' === HD_DD_Experiments::current()['status'], 'the experiment keeps running after a winner' );

// --- No difference at 182 days ---------------------------------------------------------------------
hd_exp_reset();
$exp = hd_exp_start( 182 );
$wpdb->seed( $exp['id'], 'control', 400, 20 );
$wpdb->seed( $exp['id'], 'challenger', 400, 21 );
$e->evaluate_current();
check( 'no_difference' === HD_DD_Experiments::current()['status'], 'cron marks no_difference' );
check( 1 === count( $GLOBALS['hd_test_mail'] ) && 'Door designer A/B test: no clear difference' === $GLOBALS['hd_test_mail'][0]['subject'], 'no-difference email sent' );

// --- Still running: no email -------------------------------------------------------------------------
hd_exp_reset();
$exp = hd_exp_start( 5 );
$e->evaluate_current();
check( 'running' === HD_DD_Experiments::current()['status'] && ! $GLOBALS['hd_test_mail'], 'guards unmet → running, no email' );
check( in_array( '9 more days', HD_DD_Experiments::current()['decision']['guards'], true ), 'decision stored with guards' );

hd_test_done( 'experiment-conversion.test.php' );
