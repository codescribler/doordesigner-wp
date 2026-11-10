<?php
/**
 * Designer 4: the endpoints a visitor uses after becoming a lead (list, add, change, doorway,
 * remove, details) and who may use them.
 * Run: php tests/php/d4-doors.test.php
 */
require __DIR__ . '/d4-helpers.php';

function d4d() {
	$repo = new HD_DD_Repository();
	return new HD_DD_D4( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
}
function d4_call( $method, array $body, $token = null ) {
	$r = hd_test_request( 'POST', '/hd-door-designer/v1/d4/x', $body );
	if ( null !== $token ) { $r->set_url_params( array( 'token' => $token ) ); }
	$d4 = d4d();
	return 'rest_details' === $method ? $d4->details->rest_details( $r ) : $d4->doors->$method( $r );
}
function d4_make( $email = 'nicola@example.com', $colour = 'French Navy' ) {
	return hd_d4_lead( array( 'email' => $email, 'design' => hd_d4_design( 'Pull Handle', $colour ) ) )->get_data();
}
function d4_owner( $door ) { return array( 'token' => $door['token'], 'k' => HD_DD_D4_Access::owner_key( 'nicola@example.com' ) ); }
function d4_types() { return array_map( function ( $e ) { return $e['type']; }, $GLOBALS['wpdb']->events() ); }
function d4_last_type() { $t = d4_types(); return end( $t ); }
function d4_last_event() { $e = $GLOBALS['wpdb']->events(); return end( $e ); }
function d4_code( $res ) { return is_wp_error( $res ) ? ( isset( $res->get_error_data()['status'] ) ? $res->get_error_data()['status'] : 0 ) : 200; }
function hd_d4_subjects() { return array_map( function ( $m ) { return $m['subject']; }, $GLOBALS['hd_test_mail'] ); }
function d4_row( $i ) { return $GLOBALS['wpdb']->rows[ $i ]; }
function d4_manager_says( array $doors ) {
	$GLOBALS['hd_test_transients'] = array();
	update_option( 'hd_dd_settings', array( 'manager_url' => 'https://manager.test/api/', 'manager_key' => 'secret' ) );
	$GLOBALS['hd_test_http_replies'] = array( array( 'response' => array( 'code' => 200 ), 'body' => json_encode( array( 'doors' => $doors ) ) ) );
}
function d4_design_with_frame( $frame = 'Sidelight Left' ) {
	return hd_d4_design() + array( 'Frame Design' => array( 'label' => $frame, 'id' => 41 ), 'Sidelight Type' => array( 'label' => 'Left', 'id' => 5 ), 'Sidelight Glass' => array( 'label' => 'Obscure', 'id' => 6 ) );
}

// --- the owner link lists every live designer4 door for the email -----------------------------
hd_d4_reset();
$a = d4_make();
$b = d4_make( 'nicola@example.com', 'Sage' );
d4_make( 'other@example.com' );
$res = d4_call( 'rest_designs', array( 'auth' => d4_owner( $a ) ) );
$data = $res->get_data();
check( ! is_wp_error( $res ) && 'nicola@example.com' === strtolower( $data['email'] ) && true === $data['owner'], 'the owner link resolves as owner' );
check( 2 === count( $data['doors'] ) && $b['token'] === $data['doors'][0]['token'] && $a['token'] === $data['doors'][1]['token'], 'every live door for the email, newest first, and no one else\'s' );
$door = $data['doors'][1];
check( array( 'token', 'reference', 'name', 'image', 'savedAt', 'frame', 'sideGlass', 'doorway', 'status' ) === array_keys( $door ), 'each door has the contract keys' );
check( 'pending' === $door['status'] && null === $door['frame'] && '' === $door['sideGlass'] && false === $data['older'], 'status defaults to pending, frame null before the doorway, older false' );
check( array( 'name' => true, 'postcode' => true, 'phone' => true ) === $data['missing'], 'name, postcode and phone are all missing' );
$json = json_encode( $data );
check( false === strpos( $json, HD_DD_D4_Access::owner_key( 'nicola@example.com' ) ) && false === strpos( $json, 'customer_' ), 'the list never carries the owner key' );

// --- a wrong k is 403 --------------------------------------------------------------------------
check( 403 === d4_code( d4_call( 'rest_designs', array( 'auth' => array( 'token' => $a['token'], 'k' => 'nope' ) ) ) ), 'a wrong k is 403' );
check( 403 === d4_code( d4_call( 'rest_designs', array( 'auth' => array( 'token' => $a['token'] ) ) ) ), 'a token without k is 403' );
check( 403 === d4_code( d4_call( 'rest_designs', array( 'auth' => array( 'token' => 'missing', 'k' => 'x' ) ) ) ), 'an unknown token is 403' );
check( 403 === d4_code( d4_call( 'rest_designs', array() ) ), 'no auth is 403' );
$other = d4_make( 'third@example.com' );
check( 403 === d4_code( d4_call( 'rest_designs', array( 'auth' => array( 'token' => $other['token'], 'k' => HD_DD_D4_Access::owner_key( 'nicola@example.com' ) ) ) ) ), 'another person\'s key does not open this token' );

// --- a session lists only its own tokens and reports older ------------------------------------
$res = d4_call( 'rest_designs', array( 'auth' => array( 'tokens' => array( $a['token'] ) ) ) );
$data = $res->get_data();
check( false === $data['owner'] && 1 === count( $data['doors'] ) && $a['token'] === $data['doors'][0]['token'] && true === $data['older'], 'a session sees only its token and older = true' );
check( 'nicola@example.com' === strtolower( $data['email'] ), 'the session gets the email back (they typed it)' );
$res = d4_call( 'rest_designs', array( 'auth' => array( 'tokens' => array( $a['token'], $b['token'] ) ) ) );
check( false === $res->get_data()['older'] && 2 === count( $res->get_data()['doors'] ), 'a session holding all of them has older = false' );
check( 403 === d4_code( d4_call( 'rest_designs', array( 'auth' => array( 'tokens' => array( $a['token'], $other['token'] ) ) ) ) ), 'tokens from two different emails are 403' );
check( 403 === d4_code( d4_call( 'rest_designs', array( 'auth' => array( 'tokens' => array( 'nope', 'nada' ) ) ) ) ), 'tokens that match nothing are 403' );
check( 403 === d4_code( d4_call( 'rest_designs', array( 'auth' => array( 'tokens' => array() ) ) ) ), 'an empty token list is 403' );
$res = d4_call( 'rest_designs', array( 'auth' => array( 'tokens' => array( 'nope', $a['token'] ) ) ) );
check( ! is_wp_error( $res ) && 1 === count( $res->get_data()['doors'] ), 'an invalid token beside a valid one is ignored' );
$many = array_fill( 0, 60, 'x' );
$many[55] = $a['token'];
check( 403 === d4_code( d4_call( 'rest_designs', array( 'auth' => array( 'tokens' => $many ) ) ) ), 'only the first 50 tokens count' );
$GLOBALS['wpdb']->rows[3]['flow'] = 'swipe2';
check( 403 === d4_code( d4_call( 'rest_designs', array( 'auth' => array( 'tokens' => array( $other['token'] ) ) ) ) ), 'a row of another flow is not resolved' );

// --- a session cannot change or remove a door it holds no token for ---------------------------
hd_d4_reset();
$a = d4_make();
$b = d4_make( 'nicola@example.com', 'Sage' );
$before = count( $GLOBALS['wpdb']->events() );
$sess = array( 'tokens' => array( $a['token'] ) );
check( 403 === d4_code( d4_call( 'rest_change', array( 'auth' => $sess, 'design' => hd_d4_design( 'Bar Handle' ) ), $b['token'] ) ), 'a session cannot change a door it holds no token for' );
check( 403 === d4_code( d4_call( 'rest_remove', array( 'auth' => $sess ), $b['token'] ) ), 'a session cannot remove a door it holds no token for' );
check( empty( d4_row( 1 )['removed_at'] ) && $before === count( $GLOBALS['wpdb']->events() ), 'nothing changed and nothing queued' );
check( 403 === d4_code( d4_call( 'rest_remove', array( 'auth' => array( 'token' => $a['token'], 'k' => 'bad' ) ), $a['token'] ) ), 'a wrong k cannot remove' );
check( 403 === d4_code( d4_call( 'rest_remove', array( 'auth' => d4_owner( $a ) ), 'unknown' ) ), 'an unknown door token is 403' );

// --- adding a door ------------------------------------------------------------------------------
hd_d4_reset();
$a = d4_make();
$GLOBALS['hd_test_mail'] = array();
$ev = count( $GLOBALS['wpdb']->events() );
$fired = 0;
add_action( 'hd_dd_enquiry_submitted', function () use ( &$fired ) { $fired++; }, 10, 2 );
$res = d4_call( 'rest_add', array( 'auth' => d4_owner( $a ), 'design' => hd_d4_design( 'No Handle' ), 'pageUrl' => 'https://example.test/door-designer/' ) );
check( is_wp_error( $res ) && 422 === d4_code( $res ) && 'Oops, your door needs a handle to be saved.' === $res->get_error_data()['fields']['handle'], 'adding a door with no handle is refused' );
check( 1 === count( $GLOBALS['wpdb']->rows ) && array() === $GLOBALS['hd_test_mail'], 'refused: nothing stored, nothing sent' );
$res = d4_call( 'rest_add', array( 'auth' => d4_owner( $a ), 'design' => hd_d4_design( 'Bar Handle', 'Sage' ), 'image' => hd_d4_png(), 'pageUrl' => 'https://example.test/door-designer/' ) );
check( ! is_wp_error( $res ) && true === $res->get_data()['ok'] && 2 === count( $GLOBALS['wpdb']->rows ), 'a door with a handle is added as a new row' );
$new = d4_row( 1 );
check( 'nicola@example.com' === strtolower( $new['customer_email'] ) && 'designer4' === $new['flow'] && 'enquiry' === $new['kind'] && $res->get_data()['token'] === $new['token'], 'the new row is the same email\'s designer4 enquiry' );
check( array( 'door_added', 'door_added' ) === d4_types(), 'door_added is queued' );
check( 1 === count( $GLOBALS['hd_test_mail'] ) && 0 === strpos( $GLOBALS['hd_test_mail'][0]['subject'], 'Designer 4: another door ' ), 'only the owner is emailed, nothing goes to the visitor (' . implode( '|', hd_d4_subjects() ) . ')' );
check( 0 === $fired, 'hd_dd_enquiry_submitted does not fire again' );
check( 403 === d4_code( d4_call( 'rest_add', array( 'auth' => array( 'token' => $a['token'], 'k' => 'no' ), 'design' => hd_d4_design() ) ) ), 'adding needs valid auth' );
$res = d4_call( 'rest_add', array( 'auth' => array( 'tokens' => array( $a['token'] ) ), 'design' => hd_d4_design( 'Pull Handle', 'Red' ), 'hd_hp' => 'x' ) );
check( ! is_wp_error( $res ) && 'flagged' === d4_row( 2 )['status'] && 0 === strpos( $GLOBALS['hd_test_mail'][1]['subject'], '[Possible bot] Designer 4: another door' ), 'a session can add a door; a flagged one is kept and the owner email says so' );
hd_d4_reset();
$a = d4_make();
for ( $i = 1; $i < HD_DD_Save::SAVE_LIMIT; $i++ ) { d4_call( 'rest_add', array( 'auth' => d4_owner( $a ), 'design' => hd_d4_design() ) ); }
check( 429 === d4_code( d4_call( 'rest_add', array( 'auth' => d4_owner( $a ), 'design' => hd_d4_design() ) ) ), 'the per-IP limit applies to adding a door' );

// --- doorway picked marks doorway_at once and queues doorway_set with the frame ----------------
hd_d4_reset();
$a = d4_make();
$res = d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => d4_design_with_frame(), 'doorway' => 'skipped' ), $a['token'] );
check( ! is_wp_error( $res ) && empty( d4_row( 0 )['doorway_at'] ) && array( 'door_added', 'door_changed' ) === d4_types(), 'skipped marks nothing; the changed design queues door_changed' );
$res = d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => d4_design_with_frame(), 'doorway' => 'picked' ), $a['token'] );
check( ! is_wp_error( $res ) && ! empty( d4_row( 0 )['doorway_at'] ), 'picked marks doorway_at' );
check( array( 'door_added', 'door_changed', 'doorway_set' ) === d4_types(), 'doorway_set is queued (got ' . implode( ',', d4_types() ) . ')' );
$ev = d4_last_event();
check( array( 'id' => 41, 'label' => 'Sidelight Left' ) === $ev['door']['frame'] && 'Left · Obscure' === $ev['door']['sideGlass'], 'the event carries the frame id and label and the side glass' );
$GLOBALS['wpdb']->rows[0]['doorway_at'] = '2026-11-05 09:00:00';
d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => d4_design_with_frame(), 'doorway' => 'picked' ), $a['token'] );
check( '2026-11-05 09:00:00' === d4_row( 0 )['doorway_at'] && array( 'door_added', 'door_changed', 'doorway_set' ) === d4_types(), 'picking again changes nothing and queues nothing' );
$list = d4_call( 'rest_designs', array( 'auth' => d4_owner( $a ) ) )->get_data()['doors'][0];
check( array( 'id' => 41, 'label' => 'Sidelight Left' ) === $list['frame'] && 'Left · Obscure' === $list['sideGlass'], 'the list shows the frame once the doorway is set' );
d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => d4_design_with_frame( 'Sidelight Right' ) ), $a['token'] );
check( 'door_changed' === d4_last_type() && 'Sidelight Right' === d4_last_event()['door']['frame']['label'], 'a later change queues door_changed with the new frame' );
hd_d4_reset();
$a = d4_make();
d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => d4_design_with_frame() ), $a['token'] );
check( null === d4_call( 'rest_designs', array( 'auth' => d4_owner( $a ) ) )->get_data()['doors'][0]['frame'], 'the list gives frame null until the doorway is set, even if the design holds one' );

// --- an unchanged design queues nothing --------------------------------------------------------
hd_d4_reset();
$a = d4_make();
$res = d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => hd_d4_design() ), $a['token'] );
check( ! is_wp_error( $res ) && array( 'door_added' ) === d4_types(), 'an unchanged design queues nothing' );
$res = d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => hd_d4_design( 'No Handle' ) ), $a['token'] );
check( 422 === d4_code( $res ) && array( 'door_added' ) === d4_types(), 'a change that drops the handle is refused' );

// --- remove -------------------------------------------------------------------------------------
hd_d4_reset();
$a = d4_make();
$b = d4_make( 'nicola@example.com', 'Sage' );
$res = d4_call( 'rest_remove', array( 'auth' => d4_owner( $a ) ), $a['token'] );
check( ! is_wp_error( $res ) && ! empty( d4_row( 0 )['removed_at'] ) && 2 === count( $GLOBALS['wpdb']->rows ), 'remove marks the row and keeps it' );
check( 'door_removed' === d4_last_type(), 'door_removed is queued' );
$data = d4_call( 'rest_designs', array( 'auth' => d4_owner( $b ) ) )->get_data();
check( 1 === count( $data['doors'] ) && $b['token'] === $data['doors'][0]['token'], 'the removed door is gone from the list' );
$res = d4_call( 'rest_designs', array( 'auth' => d4_owner( $a ) ) );
check( ! is_wp_error( $res ) && true === $res->get_data()['owner'] && 1 === count( $res->get_data()['doors'] ), 'a link to a removed door still resolves as owner' );
$n = count( d4_types() );
$res = d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => hd_d4_design( 'Bar Handle' ) ), $a['token'] );
check( 409 === d4_code( $res ) && 'removed' === $res->get_error_code(), 'changing a removed door is 409 removed' );
check( 409 === d4_code( d4_call( 'rest_remove', array( 'auth' => d4_owner( $a ) ), $a['token'] ) ) && $n === count( d4_types() ), 'removing it again is 409 and queues nothing' );
$res = d4_call( 'rest_designs', array( 'auth' => array( 'tokens' => array( $a['token'] ) ) ) );
check( ! is_wp_error( $res ) && array() === $res->get_data()['doors'] && true === $res->get_data()['older'], 'a session holding only a removed door lists nothing' );

// --- details ------------------------------------------------------------------------------------
hd_d4_reset();
$a = d4_make();
$b = d4_make( 'nicola@example.com', 'Sage' );
$res = d4_call( 'rest_details', array( 'auth' => d4_owner( $a ), 'name' => 'Nicola Smith', 'postcode' => 'sg1 1aa', 'telephone' => '07700 900123' ) );
check( ! is_wp_error( $res ) && 'Nicola Smith' === d4_row( 0 )['customer_name'] && 'Nicola Smith' === d4_row( 1 )['customer_name'] && 'SG1 1AA' === d4_row( 1 )['customer_postcode'] && '07700 900123' === d4_row( 0 )['customer_phone'], 'details are written to every row' );
check( ! empty( d4_row( 0 )['details_at'] ) && ! empty( d4_row( 1 )['details_at'] ), 'details_at is marked on every row' );
$e = d4_last_event();
check( 'details' === $e['type'] && true === $e['details']['overwrite'] && 'Nicola Smith' === $e['details']['name'] && '07700 900123' === $e['details']['phone'] && 'SG1 1AA' === $e['details']['postcode'], 'a details event is queued with overwrite = owner (true)' );
check( 'Nicola Smith' === json_decode( d4_row( 0 )['payload'], true )['customer']['name'], 'the stored payload carries the details too' );
d4_call( 'rest_details', array( 'auth' => d4_owner( $a ), 'name' => 'Nicola Jones' ) );
check( 'Nicola Jones' === d4_row( 0 )['customer_name'] && 'SG1 1AA' === d4_row( 0 )['customer_postcode'], 'the owner overwrites a field and leaves the ones not sent' );
$data = d4_call( 'rest_designs', array( 'auth' => d4_owner( $a ) ) )->get_data();
check( array( 'name' => false, 'postcode' => false, 'phone' => false ) === $data['missing'] && false === strpos( json_encode( $data ), 'Nicola' ) && false === strpos( json_encode( $data ), 'SG1' ), 'the list says nothing is missing and returns no name, phone or postcode' );

hd_d4_reset();
$a = d4_make();
$b = d4_make( 'nicola@example.com', 'Sage' );
d4_call( 'rest_details', array( 'auth' => d4_owner( $a ), 'name' => 'Nicola Smith' ) );
$res = d4_call( 'rest_details', array( 'auth' => array( 'tokens' => array( $a['token'], $b['token'] ) ), 'name' => 'Someone Else', 'postcode' => 'AL1 2BB' ) );
check( ! is_wp_error( $res ) && 'Nicola Smith' === d4_row( 0 )['customer_name'] && 'Nicola Smith' === d4_row( 1 )['customer_name'], 'a session never replaces a name already there' );
check( 'AL1 2BB' === d4_row( 0 )['customer_postcode'] && 'AL1 2BB' === d4_row( 1 )['customer_postcode'], 'a session fills a blank' );
check( false === d4_last_event()['details']['overwrite'], 'the session event has overwrite = false' );
d4_call( 'rest_details', array( 'auth' => array( 'tokens' => array( $a['token'] ) ), 'telephone' => '01234 567890' ) );
check( '01234 567890' === d4_row( 0 )['customer_phone'] && '' === d4_row( 1 )['customer_phone'], 'a session writes only to the rows it holds' );
$n   = count( $GLOBALS['wpdb']->events() );
$res = d4_call( 'rest_details', array( 'auth' => d4_owner( $a ), 'postcode' => 'not a postcode' ) );
check( 422 === d4_code( $res ) && isset( $res->get_error_data()['fields']['postcode'] ) && 'AL1 2BB' === d4_row( 0 )['customer_postcode'] && $n === count( $GLOBALS['wpdb']->events() ), 'an invalid postcode is refused and changes nothing' );
$res = d4_call( 'rest_details', array( 'auth' => d4_owner( $a ), 'name' => 'Nicola Smith', 'postcode' => '' ) );
check( ! is_wp_error( $res ) && 'AL1 2BB' === d4_row( 0 )['customer_postcode'], 'an empty postcode is fine and blanks nothing' );
$z = d4_make( 'z@example.com' );
check( 403 === d4_code( d4_call( 'rest_details', array( 'auth' => array( 'tokens' => array( $a['token'], $z['token'] ) ), 'name' => 'X' ) ) ), 'details with tokens from two emails are 403' );
check( array() === $GLOBALS['hd_d4_php_errors'], 'no PHP notice or warning (' . implode( '; ', $GLOBALS['hd_d4_php_errors'] ) . ')' );

// --- the manager's status: closed blocks changes; status shows in the list --------------------
hd_d4_reset();
$a   = d4_make();
$ref = $a['reference'];
d4_manager_says( array( array( 'reference' => $ref, 'status' => 'estimate_sent' ) ) );
$res = d4_call( 'rest_designs', array( 'auth' => d4_owner( $a ) ) );
check( 'estimate_sent' === $res->get_data()['doors'][0]['status'], 'the list shows the manager\'s status' );
check( 'https://manager.test/api/website-leads/status' === $GLOBALS['hd_test_http'][0]['url'] && array( $ref ) === json_decode( $GLOBALS['hd_test_http'][0]['args']['body'], true )['references'], 'the status is asked of the manager by reference' );
d4_manager_says( array( array( 'reference' => $ref, 'status' => 'estimate_sent' ) ) );
$res = d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => hd_d4_design( 'Bar Handle' ) ), $a['token'] );
check( ! is_wp_error( $res ) && 'door_changed' === d4_last_type(), 'an estimate-sent door can still be changed' );
d4_manager_says( array( array( 'reference' => $ref, 'status' => 'closed' ) ) );
$n   = count( d4_types() );
$res = d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'design' => hd_d4_design( 'Pull Handle' ) ), $a['token'] );
check( 409 === d4_code( $res ) && 'closed' === $res->get_error_code() && 'Bar Handle' === json_decode( d4_row( 0 )['design'], true )['Handle']['label'], 'a closed door cannot be changed' );
d4_manager_says( array( array( 'reference' => $ref, 'status' => 'closed' ) ) );
$res = d4_call( 'rest_remove', array( 'auth' => d4_owner( $a ) ), $a['token'] );
check( 409 === d4_code( $res ) && 'closed' === $res->get_error_code() && empty( d4_row( 0 )['removed_at'] ), 'a closed door cannot be removed' );
d4_manager_says( array( array( 'reference' => $ref, 'status' => 'closed' ) ) );
$res = d4_call( 'rest_change', array( 'auth' => d4_owner( $a ), 'doorway' => 'picked' ), $a['token'] );
check( 409 === d4_code( $res ) && empty( d4_row( 0 )['doorway_at'] ) && $n === count( d4_types() ), 'a closed door cannot take the doorway answer' );
d4_manager_says( array() );
$GLOBALS['hd_test_http_replies'] = array( array( 'response' => array( 'code' => 500 ), 'body' => '' ) );
$res = d4_call( 'rest_remove', array( 'auth' => d4_owner( $a ) ), $a['token'] );
check( ! is_wp_error( $res ) && ! empty( d4_row( 0 )['removed_at'] ), 'a manager that is down does not block a removal' );

// --- the door acted on is the one in the URL, never one named in the body ----------------------
hd_d4_reset();
$a = d4_make();
$b = d4_make( 'nicola@example.com', 'Sage' );
$auth = array( 'tokens' => array( $a['token'], $b['token'] ) );
$res  = d4_call( 'rest_remove', array( 'auth' => $auth, 'token' => $b['token'] ), $a['token'] );
$gone = array();
foreach ( $GLOBALS['wpdb']->rows as $r ) { if ( ! empty( $r['removed_at'] ) ) { $gone[] = $r['token']; } }
check( ! is_wp_error( $res ) && array( $a['token'] ) === $gone, 'a body token cannot redirect a remove to another door (removed: ' . implode( ',', $gone ) . ')' );

hd_test_done( 'd4-doors' );
