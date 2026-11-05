<?php
/**
 * Saver follow-ups: stores one row per followed-up save, sends the emails from an hourly cron,
 * and handles the "No more emails" link and the wp-admin controls. The rules (timing, who
 * qualifies) are HD_DD_Follow_Up_Plan; the wording is HD_DD_Follow_Up_Mailer.
 *
 * Replies go to Daniel's inbox and cannot be seen here, so the enquiry screen has a
 * "Stop follow-ups" button for anyone who replied.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Follow_Up {

	const DB_OPTION  = 'hd_dd_followups_db_version';
	const DB_VERSION = '1';
	const CRON       = 'hd_dd_followups_run';
	const STOP       = 'hd_dd_followup_stop';    // public admin-post action (the email link).
	const ADMIN_STOP = 'hd_dd_followup_admin_stop';
	const BACKFILL   = 'hd_dd_followup_backfill';
	const BATCH      = 25;                        // emails per cron run at most.

	const REASONS = array(
		'converted'    => 'They asked for a price or a call back',
		'unsubscribed' => 'They clicked "No more emails"',
		'replied'      => 'Stopped by hand (they replied)',
		'superseded'   => 'They saved a newer design',
		'flagged'      => 'Possible bot',
		'deleted'      => 'The saved design was deleted',
		'no_email'     => 'No valid email address',
		'finished'     => 'All three emails sent',
	);

	public function register() {
		add_action( self::CRON, array( __CLASS__, 'run' ) );
		add_action( 'init', array( __CLASS__, 'schedule' ) );
		add_action( 'hd_dd_design_saved', array( __CLASS__, 'on_saved' ), 10, 2 );
		add_action( 'admin_post_nopriv_' . self::STOP, array( __CLASS__, 'handle_stop' ) );
		add_action( 'admin_post_' . self::STOP, array( __CLASS__, 'handle_stop' ) );
		add_action( 'admin_post_' . self::ADMIN_STOP, array( __CLASS__, 'handle_admin_stop' ) );
		add_action( 'admin_post_' . self::BACKFILL, array( __CLASS__, 'handle_backfill' ) );
	}

	public static function schedule() {
		if ( ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + 300, 'hourly', self::CRON );
		}
	}

	// -------------------------------------------------------------------
	// Starting and stopping
	// -------------------------------------------------------------------
	/** hd_dd_design_saved: follow up this save (an older one from the same address stops). */
	public static function on_saved( $payload, $id = 0 ) {
		$id = (int) $id;
		if ( ! $id || ! empty( $payload['flags'] ) ) {
			return;
		}
		$row = ( new HD_DD_Repository() )->get( $id );
		if ( ! $row || HD_DD_Follow_Up_Plan::is_test( $row ) ) {
			return;
		}
		$url = isset( $payload['reloadUrl'] ) ? (string) $payload['reloadUrl'] : '';
		self::start( $row, time(), $url );
	}

	/**
	 * Begin a follow-up for a save row. $started is the moment the timing counts from.
	 *
	 * @return bool True when a follow-up was created.
	 */
	public static function start( $row, $started, $reload_url = '' ) {
		global $wpdb;
		$t = self::table();
		if ( self::get( (int) $row->id ) ) {
			return false;
		}
		foreach ( self::active_for_email( (string) $row->customer_email ) as $older ) {
			self::stop( $older, 'superseded' );
		}
		return (bool) $wpdb->insert(
			$t,
			array(
				'enquiry_id' => (int) $row->id,
				'token'      => bin2hex( random_bytes( 16 ) ),
				'started_at' => gmdate( 'Y-m-d H:i:s', (int) $started ),
				'sent_steps' => 0,
				'reload_url' => substr( esc_url_raw( $reload_url ), 0, 500 ),
			),
			array( '%d', '%s', '%s', '%d', '%s' )
		);
	}

	/** Stop a follow-up (no-op when already stopped). */
	public static function stop( $enquiry_id, $reason ) {
		global $wpdb;
		return (int) $wpdb->query( $wpdb->prepare( 'UPDATE ' . self::table() . ' SET stopped_at = %s, stop_reason = %s WHERE enquiry_id = %d AND stopped_at IS NULL', gmdate( 'Y-m-d H:i:s' ), (string) $reason, (int) $enquiry_id ) );
	}

	// -------------------------------------------------------------------
	// Sending (hourly)
	// -------------------------------------------------------------------
	/** Send whatever is due. Returns the number of emails sent. */
	public static function run( $now = null ) {
		global $wpdb;
		$now  = null === $now ? time() : (int) $now;
		$rows = (array) $wpdb->get_results( 'SELECT * FROM ' . self::table() . ' WHERE stopped_at IS NULL ORDER BY started_at ASC LIMIT 200' );
		$repo = new HD_DD_Repository();
		$sent = 0;
		foreach ( $rows as $f ) {
			if ( $sent >= self::BATCH ) {
				break;
			}
			$step = (int) $f->sent_steps;
			if ( $step >= HD_DD_Follow_Up_Plan::STEPS ) {
				self::stop( $f->enquiry_id, 'finished' );
				continue;
			}
			$last = $f->last_sent_at ? strtotime( $f->last_sent_at . ' UTC' ) : null;
			if ( ! HD_DD_Follow_Up_Plan::should_send( strtotime( $f->started_at . ' UTC' ), $step, $last, $now ) ) {
				continue;
			}
			$row    = $repo->get( (int) $f->enquiry_id );
			$reason = HD_DD_Follow_Up_Plan::stop_reason( $row, $row ? self::has_lead( (string) $row->customer_email ) : false );
			if ( '' !== $reason ) {
				self::stop( $f->enquiry_id, $reason );
				continue;
			}
			// Claim the step first, so two overlapping runs can never send the same email twice.
			$claimed = $wpdb->query( $wpdb->prepare( 'UPDATE ' . self::table() . ' SET sent_steps = %d, last_sent_at = %s WHERE enquiry_id = %d AND sent_steps = %d AND stopped_at IS NULL', $step + 1, gmdate( 'Y-m-d H:i:s', $now ), (int) $f->enquiry_id, $step ) );
			if ( 1 !== (int) $claimed ) {
				continue;
			}
			HD_DD_Follow_Up_Mailer::send( $step + 1, $row, self::links( $f, $row, $step + 1 ) );
			$sent++;
			if ( $step + 1 >= HD_DD_Follow_Up_Plan::STEPS ) {
				self::stop( $f->enquiry_id, 'finished' );
			}
		}
		return $sent;
	}

	/** The open / price / stop links for one email (tagged so analytics can see which brought them back). */
	public static function links( $f, $row, $step ) {
		$base = (string) $f->reload_url;
		if ( '' === $base || false === strpos( $base, 'design=' ) ) {
			$base = self::designer_url( (string) $row->token );
		}
		$open = add_query_arg(
			array(
				'utm_source'   => 'saved-design',
				'utm_medium'   => 'email',
				'utm_campaign' => 'follow-up',
				'utm_content'  => 'email-' . (int) $step,
			),
			$base
		);
		return array(
			'open'  => $open,
			'price' => add_query_arg( 'price', '1', $open ),
			'stop'  => add_query_arg( array( 'action' => self::STOP, 't' => (string) $f->token ), admin_url( 'admin-post.php' ) ),
		);
	}

	/** The designer page with ?design=token: the page setting, else /door-designer/. */
	public static function designer_url( $token ) {
		$page_id = (int) HD_DD_Plugin::settings()['page_id'];
		$base    = $page_id ? get_permalink( $page_id ) : '';
		return add_query_arg( 'design', rawurlencode( $token ), $base ? $base : home_url( '/door-designer/' ) );
	}

	// -------------------------------------------------------------------
	// "No more emails" (public) and the wp-admin buttons
	// -------------------------------------------------------------------
	/**
	 * The page behind the email link. A GET only asks (mail scanners open links), a POST stops
	 * (the button, or a mail app's one-click unsubscribe). Returns the HTML message.
	 */
	public static function stop_page( $token, $is_post ) {
		global $wpdb;
		$f = preg_match( '/^[a-f0-9]{32}$/', (string) $token ) ? $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE token = %s', $token ) ) : null;
		if ( ! $f ) {
			return '<p>' . esc_html__( 'That link has expired. You will not get any more emails about this design.', 'hd-door-designer' ) . '</p>';
		}
		if ( $is_post || $f->stopped_at ) {
			self::stop( $f->enquiry_id, 'unsubscribed' );
			return '<p>' . esc_html__( 'Done. You will not get any more emails about this design. It stays saved, so the link in your first email still opens it.', 'hd-door-designer' ) . '</p>';
		}
		$action = add_query_arg( array( 'action' => self::STOP, 't' => $token ), admin_url( 'admin-post.php' ) );
		return '<p>' . esc_html__( 'Stop the follow-up emails about your saved door design?', 'hd-door-designer' ) . '</p>'
			. '<form method="post" action="' . esc_url( $action ) . '"><button type="submit" class="button">' . esc_html__( 'Yes, no more emails', 'hd-door-designer' ) . '</button></form>';
	}

	public static function handle_stop() {
		$token   = isset( $_REQUEST['t'] ) ? sanitize_key( wp_unslash( $_REQUEST['t'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification -- the token is the credential.
		$is_post = isset( $_SERVER['REQUEST_METHOD'] ) && 'POST' === strtoupper( (string) $_SERVER['REQUEST_METHOD'] );
		wp_die( self::stop_page( $token, $is_post ), esc_html__( 'Hertfordshire Doors', 'hd-door-designer' ), array( 'response' => 200 ) ); // phpcs:ignore WordPress.Security.EscapeOutput -- built from escaped parts.
	}

	public static function handle_admin_stop() {
		$id = isset( $_POST['enquiry_id'] ) ? absint( $_POST['enquiry_id'] ) : 0;
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( self::ADMIN_STOP . '_' . $id ) ) {
			wp_die( esc_html__( 'Not allowed.', 'hd-door-designer' ) );
		}
		self::stop( $id, 'replied' );
		wp_safe_redirect( admin_url( 'admin.php?page=hd-door-enquiries&enquiry=' . $id ) );
		exit;
	}

	public static function handle_backfill() {
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( self::BACKFILL ) ) {
			wp_die( esc_html__( 'Not allowed.', 'hd-door-designer' ) );
		}
		$n = self::backfill( time() );
		wp_safe_redirect( admin_url( 'admin.php?page=hd-door-settings&followups_started=' . $n ) );
		exit;
	}

	/**
	 * Follow up earlier saves (the save email went out long ago, so email 1 is due straight away).
	 *
	 * @return int Follow-ups started.
	 */
	public static function backfill( $now ) {
		$n = 0;
		foreach ( self::backfill_candidates() as $row ) {
			$n += self::start( $row, (int) $now - HD_DD_Follow_Up_Plan::OFFSETS[1] * 3600 ) ? 1 : 0;
		}
		return $n;
	}

	/** @return object[] Saves backfill() would start, newest first. */
	public static function backfill_candidates() {
		global $wpdb;
		$et      = HD_DD_Repository::table();
		$saves   = (array) $wpdb->get_results( "SELECT id, token, created_at, customer_email, customer_name, design_name, status, kind FROM {$et} WHERE kind = 'save'" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$leads   = (array) $wpdb->get_col( "SELECT DISTINCT customer_email FROM {$et} WHERE kind IN ('enquiry','callback')" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$started = (array) $wpdb->get_col( 'SELECT enquiry_id FROM ' . self::table() ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		return HD_DD_Follow_Up_Plan::backfill_candidates( $saves, $leads, $started );
	}

	// -------------------------------------------------------------------
	// Lookups and schema
	// -------------------------------------------------------------------
	public static function get( $enquiry_id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE enquiry_id = %d', (int) $enquiry_id ) );
	}

	private static function active_for_email( $email ) {
		global $wpdb;
		$et = HD_DD_Repository::table();
		return array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( 'SELECT f.enquiry_id FROM ' . self::table() . " f JOIN {$et} e ON e.id = f.enquiry_id WHERE e.customer_email = %s AND f.stopped_at IS NULL", $email ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	private static function has_lead( $email ) {
		global $wpdb;
		$et = HD_DD_Repository::table();
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$et} WHERE customer_email = %s AND kind IN ('enquiry','callback')", $email ) ) > 0; // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'hd_dd_followups';
	}

	public static function maybe_upgrade() {
		if ( get_option( self::DB_OPTION ) !== self::DB_VERSION ) {
			self::create_table();
			update_option( self::DB_OPTION, self::DB_VERSION, false );
		}
	}

	public static function create_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$t = self::table();
		dbDelta(
			"CREATE TABLE {$t} (
			enquiry_id BIGINT UNSIGNED NOT NULL,
			token CHAR(32) NOT NULL,
			started_at DATETIME NOT NULL,
			sent_steps TINYINT UNSIGNED NOT NULL DEFAULT 0,
			last_sent_at DATETIME NULL DEFAULT NULL,
			stopped_at DATETIME NULL DEFAULT NULL,
			stop_reason VARCHAR(20) NOT NULL DEFAULT '',
			reload_url VARCHAR(500) NOT NULL DEFAULT '',
			PRIMARY KEY  (enquiry_id),
			UNIQUE KEY token (token),
			KEY stopped_at (stopped_at)
		) {$wpdb->get_charset_collate()};"
		);
	}
}
