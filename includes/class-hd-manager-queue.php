<?php
/**
 * A durable queue of lead events for the manager. An event is stored first (so a manager that
 * is down, or a blank key, never loses a lead) and pushed from a cron, oldest first, each row
 * claimed before it is sent so overlapping runs cannot deliver it twice.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Manager_Queue {

	const DB_OPTION  = 'hd_dd_manager_db_version';
	const DB_VERSION = '1';
	const CRON       = 'hd_dd_manager_push';
	const BATCH      = 25;  // rows per run at most.
	const CLAIM      = 300; // seconds a row is held while it is being sent.

	public function register() {
		add_action( self::CRON, array( __CLASS__, 'run' ) );
		add_action( 'init', array( __CLASS__, 'schedule' ) );
	}

	public static function schedule() {
		if ( ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + 300, 'hourly', self::CRON );
		}
	}

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'hd_dd_manager_queue';
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
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			body LONGTEXT NOT NULL,
			attempts INT UNSIGNED NOT NULL DEFAULT 0,
			next_at DATETIME NOT NULL,
			done_at DATETIME NULL DEFAULT NULL,
			failed VARCHAR(190) NULL DEFAULT NULL,
			PRIMARY KEY  (id),
			KEY pending (done_at, id)
		) {$wpdb->get_charset_collate()};"
		);
	}

	/** Store an event and ask for a push now. Returns the row id (0 when it could not be stored). */
	public static function enqueue( array $event ) {
		global $wpdb;
		$ok = $wpdb->insert(
			self::table(),
			array(
				'body'     => wp_json_encode( $event ),
				'attempts' => 0,
				'next_at'  => gmdate( 'Y-m-d H:i:s' ),
			),
			array( '%s', '%d', '%s' )
		);
		$id = $ok ? (int) $wpdb->insert_id : 0;
		if ( ! $id ) {
			return 0;
		}
		$event['eventId'] = 'hd-' . $id;
		$event['at']      = (int) round( microtime( true ) * 1000 );
		$wpdb->update( self::table(), array( 'body' => wp_json_encode( $event ) ), array( 'id' => $id ), array( '%s' ), array( '%d' ) );
		wp_schedule_single_event( time(), self::CRON );
		return $id;
	}

	/** Rows not yet delivered or refused. */
	public static function pending() {
		global $wpdb;
		return (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . self::table() . ' WHERE done_at IS NULL' );
	}

	/** Seconds to wait after the nth failed attempt. */
	public static function delay( $attempt ) {
		return (int) min( 3600, 60 * ( 2 ** max( 0, min( 20, (int) $attempt - 1 ) ) ) );
	}

	/**
	 * Push what is due, oldest first. Stops at the first row that fails (or is not due yet) so
	 * events reach the manager in the order they happened.
	 *
	 * @return int Events delivered.
	 */
	public static function run( $now = null ) {
		global $wpdb;
		if ( ! HD_DD_Manager_Client::is_configured() ) {
			return 0; // Nothing is sent or counted; the rows wait for a key.
		}
		$now  = null === $now ? time() : (int) $now;
		$t    = self::table();
		$rows = (array) $wpdb->get_results( 'SELECT * FROM ' . $t . ' WHERE done_at IS NULL ORDER BY id ASC LIMIT ' . self::BATCH );
		$sent = 0;
		foreach ( $rows as $row ) {
			if ( strtotime( $row->next_at . ' UTC' ) > $now || ! self::claim( $row, $now ) ) {
				break;
			}
			$event = json_decode( (string) $row->body, true );
			if ( ! is_array( $event ) ) {
				self::finish( $row, $now, 'bad_body' );
				continue;
			}
			$reply = HD_DD_Manager_Client::post_event( $event );
			if ( $reply['ok'] ) {
				self::finish( $row, $now, null );
				$sent++;
			} elseif ( $reply['final'] ) {
				self::finish( $row, $now, $reply['code'] );
			} else {
				$n = (int) $row->attempts + 1;
				$wpdb->update( $t, array( 'attempts' => $n, 'next_at' => gmdate( 'Y-m-d H:i:s', $now + self::delay( $n ) ) ), array( 'id' => (int) $row->id ), array( '%d', '%s' ), array( '%d' ) );
				break;
			}
		}
		return $sent;
	}

	/** Hold the row for a while so a second run skips it. False when someone else holds it. */
	private static function claim( $row, $now ) {
		global $wpdb;
		return 1 === (int) $wpdb->query( $wpdb->prepare( 'UPDATE ' . self::table() . ' SET next_at = %s WHERE id = %d AND done_at IS NULL AND next_at <= %s', gmdate( 'Y-m-d H:i:s', $now + self::CLAIM ), (int) $row->id, gmdate( 'Y-m-d H:i:s', $now ) ) );
	}

	private static function finish( $row, $now, $failed ) {
		global $wpdb;
		$wpdb->update(
			self::table(),
			array( 'attempts' => (int) $row->attempts + 1, 'done_at' => gmdate( 'Y-m-d H:i:s', $now ), 'failed' => $failed ),
			array( 'id' => (int) $row->id )
		);
	}
}
