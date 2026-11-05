<?php
/**
 * Saver follow-up emails: timing rules, who qualifies, the wording, the hourly run, the
 * "No more emails" link and the earlier-saves backfill.  Run: php tests/php/follow-up.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-plan.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-mailer.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up.php';
require_once HD_DD_DIR . 'includes/class-hd-follow-up-admin.php';

function wp_date( $f, $ts = null ) { return gmdate( $f, null === $ts ? time() : $ts ); }
function mysql2date( $f, $d ) { return gmdate( $f, strtotime( $d ) ); }

/** Enquiries in $rows (as the base fake), follow-ups in $follow; answers the follow-up queries. */
class HD_Test_FU_WPDB extends HD_Test_WPDB {
	public $follow = array();
	public function insert( $table, $data, $format = null ) {
		if ( 'wp_hd_dd_followups' === $table ) {
			if ( isset( $this->follow[ $data['enquiry_id'] ] ) ) { return false; }
			$this->follow[ $data['enquiry_id'] ] = $data + array( 'last_sent_at' => null, 'stopped_at' => null, 'stop_reason' => '' );
			return 1;
		}
		return parent::insert( $table, $data, $format );
	}
	private function enquiry( $id ) {
		foreach ( $this->rows as $r ) { if ( (int) $r['id'] === (int) $id ) { return $r; } }
		return null;
	}
	public function get_row( $q ) {
		if ( preg_match( "/FROM wp_hd_enquiries WHERE id = (\d+)/", $q, $m ) ) {
			$r = $this->enquiry( $m[1] );
			return $r ? (object) $r : null;
		}
		if ( preg_match( "/FROM wp_hd_dd_followups WHERE enquiry_id = (\d+)/", $q, $m ) ) {
			return isset( $this->follow[ $m[1] ] ) ? (object) $this->follow[ $m[1] ] : null;
		}
		if ( preg_match( "/FROM wp_hd_dd_followups WHERE token = '([^']*)'/", $q, $m ) ) {
			foreach ( $this->follow as $f ) { if ( $f['token'] === $m[1] ) { return (object) $f; } }
			return null;
		}
		return parent::get_row( $q );
	}
	public function get_results( $q ) {
		if ( 0 === strpos( $q, 'SELECT * FROM wp_hd_dd_followups WHERE stopped_at IS NULL' ) ) {
			$out = array_filter( $this->follow, function ( $f ) { return null === $f['stopped_at']; } );
			usort( $out, function ( $a, $b ) { return strcmp( $a['started_at'], $b['started_at'] ); } );
			return array_map( function ( $f ) { return (object) $f; }, $out );
		}
		if ( false !== strpos( $q, "FROM wp_hd_enquiries WHERE kind = 'save'" ) ) {
			return array_values( array_map( function ( $r ) { return (object) $r; }, array_filter( $this->rows, function ( $r ) { return 'save' === $r['kind']; } ) ) );
		}
		return array();
	}
	public function get_col( $q ) {
		if ( false !== strpos( $q, "SELECT DISTINCT customer_email FROM wp_hd_enquiries WHERE kind IN" ) ) {
			return array_values( array_unique( array_map( function ( $r ) { return $r['customer_email']; }, array_filter( $this->rows, function ( $r ) { return in_array( $r['kind'], array( 'enquiry', 'callback' ), true ); } ) ) ) );
		}
		if ( 'SELECT enquiry_id FROM wp_hd_dd_followups' === $q ) {
			return array_keys( $this->follow );
		}
		if ( preg_match( "/JOIN wp_hd_enquiries e ON e.id = f.enquiry_id WHERE e.customer_email = '([^']*)' AND f.stopped_at IS NULL/", $q, $m ) ) {
			$out = array();
			foreach ( $this->follow as $id => $f ) {
				$e = $this->enquiry( $id );
				if ( $e && $e['customer_email'] === $m[1] && null === $f['stopped_at'] ) { $out[] = $id; }
			}
			return $out;
		}
		return array();
	}
	public function get_var( $q ) {
		if ( preg_match( "/FROM wp_hd_enquiries WHERE customer_email = '([^']*)' AND kind IN/", $q, $m ) ) {
			return count( array_filter( $this->rows, function ( $r ) use ( $m ) { return $r['customer_email'] === $m[1] && in_array( $r['kind'], array( 'enquiry', 'callback' ), true ); } ) );
		}
		return parent::get_var( $q );
	}
	public function query( $q ) {
		if ( preg_match( "/^UPDATE wp_hd_dd_followups SET stopped_at = '([^']*)', stop_reason = '([^']*)' WHERE enquiry_id = (\d+) AND stopped_at IS NULL$/", $q, $m ) ) {
			if ( isset( $this->follow[ $m[3] ] ) && null === $this->follow[ $m[3] ]['stopped_at'] ) {
				$this->follow[ $m[3] ]['stopped_at'] = $m[1];
				$this->follow[ $m[3] ]['stop_reason'] = $m[2];
				return 1;
			}
			return 0;
		}
		if ( preg_match( "/^UPDATE wp_hd_dd_followups SET sent_steps = (\d+), last_sent_at = '([^']*)' WHERE enquiry_id = (\d+) AND sent_steps = (\d+) AND stopped_at IS NULL$/", $q, $m ) ) {
			$f = &$this->follow[ $m[3] ];
			if ( isset( $f ) && (int) $f['sent_steps'] === (int) $m[4] && null === $f['stopped_at'] ) {
				$f['sent_steps'] = (int) $m[1];
				$f['last_sent_at'] = $m[2];
				return 1;
			}
			return 0;
		}
		return parent::query( $q );
	}
}

function fu_reset() {
	hd_test_reset();
	$GLOBALS['wpdb'] = new HD_Test_FU_WPDB();
}
function fu_save( $email, $created, $extra = array() ) {
	global $wpdb;
	$wpdb->insert( 'wp_hd_enquiries', array_merge( array(
		'token' => bin2hex( random_bytes( 8 ) ), 'created_at' => $created, 'status' => 'new', 'customer_name' => '', 'customer_email' => $email,
		'design_name' => 'Ascot in Anthracite Grey', 'kind' => 'save',
		'design' => json_encode( array( 'Door Colour (External)' => array( 'label' => 'Anthracite Grey' ) ) ),
		'payload' => json_encode( array( 'image' => 'https://example.test/door.png' ) ),
	), $extra ) );
	return $wpdb->insert_id;
}
// A UK weekday, 10:00 GMT (November): inside the sending window.
$t0 = strtotime( '2026-11-02 10:00:00 UTC' );

// --- Plan: timing ---------------------------------------------------------------------------
check( $t0 + 24 * 3600 === HD_DD_Follow_Up_Plan::next_due( $t0, 0 ), 'email 1 a day after the save' );
check( $t0 + 48 * 3600 === HD_DD_Follow_Up_Plan::next_due( $t0, 1, $t0 + 24 * 3600 ), 'email 2 two days after' );
check( $t0 + 96 * 3600 === HD_DD_Follow_Up_Plan::next_due( $t0, 2, $t0 + 48 * 3600 ), 'email 3 four days after' );
check( null === HD_DD_Follow_Up_Plan::next_due( $t0, 3 ), 'nothing after the third' );
check( $t0 + 30 * 3600 + 20 * 3600 === HD_DD_Follow_Up_Plan::next_due( $t0, 1, $t0 + 30 * 3600 ), 'never two within 20 hours' );
check( HD_DD_Follow_Up_Plan::in_window( strtotime( '2026-11-02 08:00:00 UTC' ) ), '8am UK (GMT) is in' );
check( ! HD_DD_Follow_Up_Plan::in_window( strtotime( '2026-11-02 20:00:00 UTC' ) ), '8pm UK is out' );
check( HD_DD_Follow_Up_Plan::in_window( strtotime( '2026-07-01 07:30:00 UTC' ) ), '8:30am BST (07:30 UTC in summer) is in: UK time, not UTC' );
check( ! HD_DD_Follow_Up_Plan::in_window( strtotime( '2026-07-01 19:30:00 UTC' ) ), '8:30pm BST is out' );
check( ! HD_DD_Follow_Up_Plan::should_send( $t0, 0, null, $t0 + 23 * 3600 ), 'not before it is due' );
check( ! HD_DD_Follow_Up_Plan::should_send( $t0 - 14 * 3600, 0, null, strtotime( '2026-11-02 03:00:00 UTC' ) ), 'never at night, even when due' );

// --- Plan: who --------------------------------------------------------------------------------
$r = function ( $over = array() ) { return (object) array_merge( array( 'id' => 1, 'kind' => 'save', 'status' => 'new', 'customer_email' => 'sam@example.com', 'customer_name' => '', 'design_name' => 'Ascot', 'created_at' => '2026-10-20 10:00:00' ), $over ); };
check( '' === HD_DD_Follow_Up_Plan::stop_reason( $r(), false ), 'a plain save carries on' );
check( 'converted' === HD_DD_Follow_Up_Plan::stop_reason( $r( array( 'kind' => 'enquiry' ) ), false ), 'a save turned quote stops' );
check( 'converted' === HD_DD_Follow_Up_Plan::stop_reason( $r(), true ), 'a quote from the same email elsewhere stops' );
check( 'flagged' === HD_DD_Follow_Up_Plan::stop_reason( $r( array( 'status' => 'flagged' ) ), false ), 'bots stop' );
check( 'deleted' === HD_DD_Follow_Up_Plan::stop_reason( null, false ), 'deleted rows stop' );
check( HD_DD_Follow_Up_Plan::is_test( $r( array( 'customer_email' => 'daniel@dreamfree.co.uk' ) ) ) && HD_DD_Follow_Up_Plan::is_test( $r( array( 'design_name' => 'TEST door (please delete)' ) ) ), 'our own saves are tests' );
check( ! HD_DD_Follow_Up_Plan::is_test( $r( array( 'design_name' => 'Contest' ) ) ), '"test" only as a word' );
$c = HD_DD_Follow_Up_Plan::backfill_candidates(
	array( $r( array( 'id' => 1, 'customer_email' => 'a@x.com', 'created_at' => '2026-10-01 10:00:00' ) ), $r( array( 'id' => 2, 'customer_email' => 'A@x.com', 'created_at' => '2026-10-05 10:00:00' ) ), $r( array( 'id' => 3, 'customer_email' => 'b@x.com' ) ), $r( array( 'id' => 4, 'customer_email' => 'c@x.com' ) ), $r( array( 'id' => 5, 'customer_email' => 'd@x.com', 'status' => 'flagged' ) ) ),
	array( 'b@x.com' ),
	array( 4 )
);
check( array( 2 ) === array_map( function ( $s ) { return (int) $s->id; }, $c ), 'backfill: newest save per person, no leads, not started, no bots' );

// --- Mailer -------------------------------------------------------------------------------------
fu_reset();
$id   = fu_save( 'sam@example.com', '2026-11-02 10:00:00' );
$row  = $wpdb->get_row( "SELECT * FROM wp_hd_enquiries WHERE id = $id" );
$link = array( 'open' => 'https://example.test/door-designer/?design=abc&utm_content=email-1', 'price' => 'https://example.test/door-designer/?design=abc&price=1', 'stop' => 'https://example.test/wp-admin/admin-post.php?action=x&t=y' );
$m1   = HD_DD_Follow_Up_Mailer::build( 1, $row, $link );
$m2   = HD_DD_Follow_Up_Mailer::build( 2, $row, $link );
$m3   = HD_DD_Follow_Up_Mailer::build( 3, $row, $link );
check( 'Your door design, in daylight' === $m1['subject'] && false !== strpos( $m1['html'], 'Anthracite Grey' ), 'email 1 names their colour' );
check( false !== strpos( $m2['html'], 'fully fitted' ) && false !== strpos( $m2['html'], 'small extra cost' ) && false !== strpos( $m2['html'], '£1,500 to £4,000' ), 'email 2: fitted, old door, guide price' );
check( false !== strpos( $m3['html'], '10/10 on Checkatrade from 79 reviews' ) && false !== strpos( $m3['html'], 'last email' ), 'email 3: rating and last-email line' );
foreach ( array( $m1, $m2, $m3 ) as $i => $m ) {
	$n = $i + 1;
	check( false !== strpos( $m['html'], 'Get my exact price' ) && false !== strpos( $m['html'], 'Ascot in Anthracite Grey' ) && false !== strpos( $m['html'], 'door.png' ), "email $n shows their door and the price button" );
	check( false !== strpos( $m['html'], 'No more emails about this design' ) && false !== strpos( $m['html'], 'Daniel<br>Hertfordshire Doors' ), "email $n is from Daniel with a stop link" );
	check( ! preg_match( '/samples?/i', $m['html'] ), "email $n offers no samples" );
}
check( false !== strpos( $m1['html'] . $m2['html'], 'name and postcode' ), 'reply route asks for name and postcode' );
HD_DD_Follow_Up_Mailer::send( 1, $row, $link );
$mail = end( $GLOBALS['hd_test_mail'] );
$h    = implode( "\n", $mail['headers'] );
check( 'sam@example.com' === $mail['to'] && false !== strpos( $h, 'From: Daniel at Hertfordshire Doors' ) && false !== strpos( $h, 'Reply-To: Daniel at Hertfordshire Doors <daniel@dreamfree.co.uk>' ), 'from Daniel, replies to the enquiry inbox' );
check( false !== strpos( $h, 'List-Unsubscribe: <https://example.test/wp-admin/admin-post.php?action=x&t=y>' ) && false !== strpos( $h, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click' ), 'one-click unsubscribe headers' );

// --- Run: the whole sequence -----------------------------------------------------------------------
fu_reset();
$id  = fu_save( 'sam@example.com', '2026-11-02 10:00:00' );
$row = $wpdb->get_row( "SELECT * FROM wp_hd_enquiries WHERE id = $id" );
check( HD_DD_Follow_Up::start( $row, $t0, 'https://example.test/door-designer/?design=' . $row->token ), 'started' );
check( ! HD_DD_Follow_Up::start( $row, $t0 ), 'never started twice' );
check( 0 === HD_DD_Follow_Up::run( $t0 + 3600 ), 'nothing in the first day' );
check( 1 === HD_DD_Follow_Up::run( $t0 + 24 * 3600 ) && 0 === HD_DD_Follow_Up::run( $t0 + 24 * 3600 + 60 ), 'email 1 once' );
$mail = end( $GLOBALS['hd_test_mail'] );
check( false !== strpos( $mail['message'], 'utm_content=email-1' ) && false !== strpos( $mail['message'], 'design=' . $row->token ), 'links open their design and say which email' );
check( 1 === HD_DD_Follow_Up::run( $t0 + 48 * 3600 ), 'email 2' );
check( 0 === HD_DD_Follow_Up::run( $t0 + 72 * 3600 ), 'nothing on day 3' );
check( 1 === HD_DD_Follow_Up::run( $t0 + 96 * 3600 ), 'email 3' );
check( 'finished' === $wpdb->follow[ $id ]['stop_reason'] && 3 === count( $GLOBALS['hd_test_mail'] ), 'three emails, then finished' );
check( 0 === HD_DD_Follow_Up::run( $t0 + 200 * 3600 ), 'nothing after that' );

// A quote request (or a quote from the same email elsewhere) stops it.
fu_reset();
$id = fu_save( 'kim@example.com', '2026-11-02 10:00:00' );
HD_DD_Follow_Up::start( $wpdb->get_row( "SELECT * FROM wp_hd_enquiries WHERE id = $id" ), $t0 );
fu_save( 'kim@example.com', '2026-11-02 11:00:00', array( 'kind' => 'enquiry' ) );
check( 0 === HD_DD_Follow_Up::run( $t0 + 24 * 3600 ) && 'converted' === $wpdb->follow[ $id ]['stop_reason'], 'a quote from the same address stops the emails' );

// A newer save from the same person replaces the older follow-up.
fu_reset();
$a = fu_save( 'lee@example.com', '2026-11-01 10:00:00' );
$b = fu_save( 'lee@example.com', '2026-11-02 10:00:00' );
HD_DD_Follow_Up::start( $wpdb->get_row( "SELECT * FROM wp_hd_enquiries WHERE id = $a" ), $t0 - 86400 );
HD_DD_Follow_Up::start( $wpdb->get_row( "SELECT * FROM wp_hd_enquiries WHERE id = $b" ), $t0 );
check( 'superseded' === $wpdb->follow[ $a ]['stop_reason'] && null === $wpdb->follow[ $b ]['stopped_at'], 'one sequence per person' );

// on_saved: follows real saves, not bots or our own tests.
fu_reset();
$id = fu_save( 'pat@example.com', '2026-11-02 10:00:00' );
HD_DD_Follow_Up::on_saved( array( 'reloadUrl' => 'https://example.test/door-designer/?design=x' ), $id );
check( isset( $wpdb->follow[ $id ] ) && 'https://example.test/door-designer/?design=x' === $wpdb->follow[ $id ]['reload_url'], 'a save starts a follow-up with its link' );
$bot = fu_save( 'bot@example.com', '2026-11-02 10:00:00' );
HD_DD_Follow_Up::on_saved( array( 'flags' => array( 'honeypot' ) ), $bot );
$own = fu_save( 'daniel@dreamfree.co.uk', '2026-11-02 10:00:00' );
HD_DD_Follow_Up::on_saved( array(), $own );
check( ! isset( $wpdb->follow[ $bot ] ) && ! isset( $wpdb->follow[ $own ] ), 'bots and our own saves are never followed up' );

// --- The "No more emails" link ------------------------------------------------------------------
$tok  = $wpdb->follow[ $id ]['token'];
$page = HD_DD_Follow_Up::stop_page( $tok, false );
check( false !== strpos( $page, '<form method="post"' ) && null === $wpdb->follow[ $id ]['stopped_at'], 'opening the link only asks (mail scanners open links)' );
$page = HD_DD_Follow_Up::stop_page( $tok, true );
check( false !== strpos( $page, 'Done.' ) && 'unsubscribed' === $wpdb->follow[ $id ]['stop_reason'], 'pressing the button stops' );
check( false !== strpos( HD_DD_Follow_Up::stop_page( 'nope', true ), 'expired' ), 'a bad token is harmless' );
$f = (object) $wpdb->follow[ $id ];
check( false !== strpos( HD_DD_Follow_Up_Admin::status_text( $f ), 'They clicked "No more emails"' ), 'admin status names the reason' );

// --- Backfill earlier saves -------------------------------------------------------------------------
fu_reset();
$old  = fu_save( 'old@example.com', '2026-10-10 10:00:00' );
$quot = fu_save( 'q@example.com', '2026-10-11 10:00:00' );
fu_save( 'q@example.com', '2026-10-11 10:05:00', array( 'kind' => 'enquiry' ) );
fu_save( 'daniel@dreamfree.co.uk', '2026-10-12 10:00:00' );
check( array( $old ) === array_map( function ( $s ) { return (int) $s->id; }, HD_DD_Follow_Up::backfill_candidates() ), 'candidates: only the real, unconverted saver' );
check( 1 === HD_DD_Follow_Up::backfill( $t0 ), 'one started' );
check( 1 === HD_DD_Follow_Up::run( $t0 ), 'their first email goes straight away' );
check( 0 === HD_DD_Follow_Up::run( $t0 + 3600 ) && 1 === HD_DD_Follow_Up::run( $t0 + 24 * 3600 ), 'then a day later the second' );
check( false !== strpos( end( $GLOBALS['hd_test_mail'] )['message'], 'design=' ), 'a backfilled save links to its design via the designer page' );
check( array() === HD_DD_Follow_Up::backfill_candidates(), 'running the backfill again starts nothing' );

hd_test_done( 'follow-up.test.php' );
