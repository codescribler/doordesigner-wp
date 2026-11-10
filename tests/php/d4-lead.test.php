<?php
/**
 * Designer 4: sending an email address beside the finished door is the price request and the lead.
 * Run: php tests/php/d4-lead.test.php
 */
require __DIR__ . '/d4-helpers.php';

function hd_d4_rows() { return $GLOBALS['wpdb']->rows; }
function hd_d4_subjects() { return array_map( function ( $m ) { return $m['subject']; }, $GLOBALS['hd_test_mail'] ); }

// --- 1) A valid lead: one designer4 enquiry row, the token comes back ------------------------
hd_d4_reset();
$exp = hd_exp_start();
$vid = md5( 'jo' );
hd_exp_expose( array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => 'challenger' ) );
$saves = 0;
add_action( 'hd_dd_design_saved', function () use ( &$saves ) { $saves++; }, 10, 2 );
$res = hd_d4_lead( array( 'email' => '  Jo@Example.com ', 'experiment' => array( 'experimentId' => $exp['id'], 'visitorId' => $vid, 'arm' => 'challenger' ) ) );
check( ! is_wp_error( $res ) && 200 === $res->get_status() && true === $res->get_data()['ok'], 'a valid lead is accepted with 200' );
check( 1 === count( hd_d4_rows() ), 'exactly one row is stored' );
$row = hd_d4_rows()[0];
check( 'enquiry' === $row['kind'] && 'designer4' === $row['flow'] && 'new' === $row['status'], 'stored as a designer4 enquiry' );
check( 'Jo@Example.com' === $row['customer_email'] && '' === $row['customer_name'] && '' === $row['customer_phone'] && '' === $row['customer_postcode'], 'only the email is known' );
check( 'Etna in French Navy' === $row['design_name'], 'named from the door (got "' . $row['design_name'] . '")' );
$payload = json_decode( $row['payload'], true );
check( 'designer4' === $payload['flow'] && 'enquiry' === $payload['kind'], 'payload flow is designer4' );
check( array( 'name' => '', 'telephone' => '', 'email' => 'Jo@Example.com', 'postcode' => '' ) === $payload['customer'], 'payload customer has the email and empty name, telephone, postcode' );
check( 'challenger' === $payload['experiment']['arm'] && ! empty( $payload['image'] ), 'payload carries the experiment ref and the picture' );
check( $res->get_data()['token'] === $row['token'] && $res->get_data()['reference'] === $row['reference'], 'the response carries the token and reference' );

// --- 2) door_added is queued; one email each way ---------------------------------------------
$events = $GLOBALS['wpdb']->events();
check( 1 === count( $events ) && 'door_added' === $events[0]['type'] && 'hd-1' === $events[0]['eventId'], 'one door_added event is queued' );
$e = $events[0];
check( 'Jo@Example.com' === $e['email'] && array( 'name' => '', 'phone' => '', 'postcode' => '', 'overwrite' => false ) === $e['details'], 'the event has the email and empty details' );
$d = $e['door'];
check( $row['reference'] === $d['reference'] && 'Etna in French Navy' === $d['name'] && 'Single Door · Etna · French Navy' === $d['summary'], 'door reference, name and summary' );
check( $payload['image'] === $d['imageUrl'] && false !== strpos( $d['designUrl'], 'design=' . $row['token'] ) && null === $d['frame'] && '' === $d['sideGlass'], 'door image, design link, frame null, sideGlass empty' );
check( 4 === count( $d['choices'] ) && array( 'heading' => 'Handle', 'label' => 'Pull Handle' ) === $d['choices'][3], 'choices lists every heading and label' );
$subjects = hd_d4_subjects();
check( 2 === count( $subjects ), 'two emails: the customer once and the owner once (got ' . count( $subjects ) . ')' );
check( 'Your door design: Etna in French Navy' === $subjects[0] && 'jo@example.com' === strtolower( $GLOBALS['hd_test_mail'][0]['to'] ), 'the customer gets the link email (' . $subjects[0] . ')' );
check( 0 === strpos( $subjects[1], 'New Designer 4 lead ' . $row['reference'] . ' — ' ), 'the owner gets the lead email (' . $subjects[1] . ')' );
check( 0 === count( array_filter( $subjects, function ( $s ) { return false !== strpos( $s, 'New door enquiry' ); } ) ), 'no email says New door enquiry' );

// --- 3) The listeners tolerate an empty name; the visitor is converted -----------------------
$visitor = $GLOBALS['wpdb']->visitors[ $exp['id'] . '|' . $vid ];
check( null !== $visitor['converted_at'], 'hd_dd_enquiry_submitted marks the visitor converted' );
check( ! empty( $visitor['form_at'] ), 'the journey tracking listener ran too' );
check( array() === $GLOBALS['hd_d4_php_errors'], 'no PHP notice or warning from any listener (' . implode( '; ', $GLOBALS['hd_d4_php_errors'] ) . ')' );

// --- 4) The follow-up sequence is not started -------------------------------------------------
check( 0 === $saves && empty( $GLOBALS['wpdb']->tables['wp_hd_dd_followups'] ), 'hd_dd_design_saved is not fired and no follow-up row is made' );

// --- 5) The response never contains the owner key --------------------------------------------
$json = json_encode( $res->get_data() );
check( array( 'ok', 'token', 'reference' ) === array_keys( $res->get_data() ) && false === strpos( $json, HD_DD_D4_Access::owner_key( 'jo@example.com' ) ), 'the response has only ok, token and reference, never the owner key' );

// --- 6) Refusals store nothing ---------------------------------------------------------------
foreach ( array( 'missing' => null, 'No Handle ' => 'No Handle ', 'lower case' => 'no handle' ) as $why => $handle ) {
	hd_d4_reset();
	$res = hd_d4_lead( array( 'design' => hd_d4_design( $handle ) ) );
	check( is_wp_error( $res ) && 422 === $res->get_error_data()['status'] && 'Oops, your door needs a handle to be saved.' === $res->get_error_data()['fields']['handle'], "handle $why is refused with the Oops message" );
	check( array() === hd_d4_rows() && array() === $GLOBALS['hd_test_mail'] && array() === $GLOBALS['wpdb']->events(), "handle $why stores, queues and sends nothing" );
}
hd_d4_reset();
$res = hd_d4_lead( array( 'email' => 'not-an-email' ) );
check( is_wp_error( $res ) && isset( $res->get_error_data()['fields']['email'] ) && array() === hd_d4_rows(), 'a bad email is refused by name and stores nothing' );
$res = hd_d4_lead( array( 'email' => array( 'x' ) ) );
check( is_wp_error( $res ), 'an array email is refused, not a crash' );
$res = hd_d4_lead( array( 'design' => array() ) );
check( is_wp_error( $res ) && 'hd_dd_no_design' === $res->get_error_code(), 'no design is refused' );

// --- 7) Honeypot: stored flagged but treated as real ------------------------------------------
hd_d4_reset();
$res = hd_d4_lead( array( 'hd_hp' => 'autofill' ) );
check( ! is_wp_error( $res ) && 'flagged' === hd_d4_rows()[0]['status'], 'a honeypot lead is stored flagged' );
check( array( 'honeypot' ) === json_decode( hd_d4_rows()[0]['payload'], true )['flags'], 'the payload carries the honeypot flag' );
$types = array_map( function ( $e ) { return $e['type']; }, $GLOBALS['wpdb']->events() );
check( array( 'door_added' ) === $types, 'the door_added manager event is still queued' );
$subjects = hd_d4_subjects();
check( 2 === count( $subjects ) && 'jo@example.com' === $GLOBALS['hd_test_mail'][0]['to'], 'the customer link email and the owner email both go' );
check( 0 === strpos( $subjects[1], '[Possible bot] New Designer 4 lead HD-' ), 'the owner subject has the Possible bot prefix (' . $subjects[1] . ')' );
check( 0 === strpos( $subjects[0], 'Your door design' ), 'the customer subject has no prefix' );
$conv = 0;
hd_d4_reset();
add_action( 'hd_dd_enquiry_submitted', function () use ( &$conv ) { $conv++; }, 10, 2 );
hd_d4_lead( array( 'hd_hp' => 'x' ) );
check( 1 === $conv, 'hd_dd_enquiry_submitted fires for a flagged lead' );

// --- 8) Sending again with the row token updates that row ------------------------------------
hd_d4_reset();
$first = hd_d4_lead();
$token = $first->get_data()['token'];
$mails = count( $GLOBALS['hd_test_mail'] );
$again = hd_d4_lead( array( 'token' => $token, 'design' => hd_d4_design( 'Bar Handle', 'Sage' ) ) );
check( ! is_wp_error( $again ) && 200 === $again->get_status() && $token === $again->get_data()['token'] && $first->get_data()['reference'] === $again->get_data()['reference'], 'sending again returns the same token and reference' );
check( 1 === count( hd_d4_rows() ), 'still one row' );
check( $mails === count( $GLOBALS['hd_test_mail'] ), 'no new emails' );
$types = array_map( function ( $e ) { return $e['type']; }, $GLOBALS['wpdb']->events() );
check( array( 'door_added', 'door_changed' ) === $types, 'door_changed is queued (got ' . implode( ',', $types ) . ')' );
$chg = $GLOBALS['wpdb']->events()[1];
check( 'Etna in Sage' === hd_d4_rows()[0]['design_name'] && 'Etna in Sage' === $chg['door']['name'] && 'Bar Handle' === json_decode( hd_d4_rows()[0]['design'], true )['Handle']['label'], 'the row and the event carry the changed door' );
check( 'enquiry' === hd_d4_rows()[0]['kind'], 'the row is still an enquiry' );
// A change that drops the handle is still refused, and the stored door is left alone.
$bad = hd_d4_lead( array( 'token' => $token, 'design' => hd_d4_design( null ) ) );
check( is_wp_error( $bad ) && 'Bar Handle' === json_decode( hd_d4_rows()[0]['design'], true )['Handle']['label'], 'an update without a handle is refused and changes nothing' );

// --- 9) Someone else's token, or a removed door, never edits that row -------------------------
hd_d4_reset();
$mine  = hd_d4_lead( array( 'email' => 'nicola@example.com' ) )->get_data();
$other = hd_d4_lead( array( 'email' => 'jo@example.com', 'token' => $mine['token'], 'design' => hd_d4_design( 'Bar Handle', 'Sage' ) ) );
check( 2 === count( hd_d4_rows() ) && $other->get_data()['token'] !== $mine['token'], 'another email with that token gets its own new row' );
check( 'Etna in French Navy' === hd_d4_rows()[0]['design_name'], 'the first door is untouched' );
$GLOBALS['wpdb']->rows[0]['removed_at'] = '2026-11-10 10:00:00';
$res = hd_d4_lead( array( 'email' => 'nicola@example.com', 'token' => $mine['token'] ) );
check( 3 === count( hd_d4_rows() ) && $res->get_data()['token'] !== $mine['token'], 'a removed door is not updated: a new row is added' );

// --- 10) Per-IP limit shared with the save endpoints -----------------------------------------
hd_d4_reset();
for ( $i = 0; $i < HD_DD_Save::SAVE_LIMIT; $i++ ) { hd_d4_lead(); }
$res = hd_d4_lead();
check( is_wp_error( $res ) && 429 === $res->get_error_data()['status'], 'the request after the limit from one IP in an hour is refused with 429' );
check( HD_DD_Save::SAVE_LIMIT === count( hd_d4_rows() ), 'and nothing more is stored' );

// --- 11) Access helpers ------------------------------------------------------------------------
$k = HD_DD_D4_Access::owner_key( ' Jo@Example.com ' );
check( 1 === preg_match( '/^[a-f0-9]{40}$/', $k ) && $k === HD_DD_D4_Access::owner_key( 'jo@example.com' ) && $k !== HD_DD_D4_Access::owner_key( 'x@example.com' ), 'owner_key is 40 hex characters, stable for an email, different per email' );
$r = (object) array( 'token' => 'abc123abc123', 'customer_email' => 'jo@example.com' );
check( HD_DD_D4_Access::is_owner( $r, $k ) && ! HD_DD_D4_Access::is_owner( $r, 'nope' ) && ! HD_DD_D4_Access::is_owner( $r, '' ), 'is_owner checks the key' );
check( 'https://example.test/door-designer/?designs=abc123abc123&k=' . $k === HD_DD_D4_Access::designs_url( 'https://example.test/door-designer/', $r ), 'designs_url is the page with designs= and k=' );
check( 0 === strpos( HD_DD_D4_Access::designs_url( 'https://evil.test/x', $r ), 'https://example.test/' ), 'an off-site page URL is never used' );
check( ! HD_DD_D4_Access::has_handle( array() ) && HD_DD_D4_Access::has_handle( hd_d4_design() ) && ! HD_DD_D4_Access::has_handle( hd_d4_design( '  No handle' ) ), 'has_handle' );

hd_test_done( 'd4-lead' );
