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
	const DB_VERSION   = '2';
	const CRON         = 'hd_dd_manager_push';
	const BATCH        = 25;  // rows per run at most.
	const CLAIM        = 300; // seconds a row is held while it is being sent.
	const STUCK        = 8;   // failures after which a row no longer holds newer rows back.
	const REFUSED_DAYS = 30;  // how far back wp-admin counts rows refused for good.

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

	/**
	 * Create or migrate the table when the stored version differs. The version is stored only
	 * once the table and this version's column are really there, so a failed dbDelta is tried
	 * again on the next load (the same pattern as HD_DD_Repository::maybe_upgrade).
	 */
	public static function maybe_upgrade() {
		if ( ! self::schema_current() ) {
			self::create_table();
			if ( self::table_ready() ) {
				update_option( self::DB_OPTION, self::DB_VERSION, false );
			}
		}
	}

	/** True when the stored version is this code's (so the last_error column exists). */
	public static function schema_current() {
		return get_option( self::DB_OPTION ) === self::DB_VERSION;
	}

	private static function table_ready() {
		global $wpdb;
		$t = self::table();
		if ( $t !== $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $t ) ) ) {
			return false;
		}
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		return (bool) $wpdb->get_var( $wpdb->prepare( "SHOW COLUMNS FROM {$t} LIKE %s", 'last_error' ) );
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
			last_error VARCHAR(190) NULL DEFAULT NULL,
			PRIMARY KEY  (id),
			KEY pending (done_at, id)
		) {$wpdb->get_charset_collate()};"
		);
	}

	/**
	 * Store an event and ask for a push now. Returns the row id (0 when it could not be stored).
	 * The row is inserted held back (not due), and one update writes its eventId and time and makes
	 * it due, so a cron run in between can never send an event that has no eventId.
	 */
	public static function enqueue( array $event ) {
		global $wpdb;
		$ok = $wpdb->insert(
			self::table(),
			array(
				'body'     => wp_json_encode( $event ),
				'attempts' => 0,
				'next_at'  => gmdate( 'Y-m-d H:i:s', time() + self::CLAIM ),
			),
			array( '%s', '%d', '%s' )
		);
		$id = $ok ? (int) $wpdb->insert_id : 0;
		if ( ! $id ) {
			return 0;
		}
		$event['eventId'] = 'hd-' . $id;
		$event['at']      = (int) round( microtime( true ) * 1000 );
		$done             = $wpdb->update(
			self::table(),
			array( 'body' => wp_json_encode( $event ), 'next_at' => gmdate( 'Y-m-d H:i:s' ) ),
			array( 'id' => $id ),
			array( '%s', '%s' ),
			array( '%d' )
		);
		if ( ! $done ) {
			$wpdb->delete( self::table(), array( 'id' => $id ), array( '%d' ) ); // never leave a half-written row.
			return 0;
		}
		wp_schedule_single_event( time(), self::CRON );
		return $id;
	}

	/** Rows not yet delivered or refused. */
	public static function pending() {
		global $wpdb;
		return (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . self::table() . ' WHERE done_at IS NULL' );
	}

	/**
	 * What wp-admin shows: rows waiting, rows the manager keeps refusing (STUCK+ failures, by last
	 * error) and rows refused for good in the last REFUSED_DAYS days (by code).
	 *
	 * @return array{waiting:int,stuck:int,stuck_codes:array,refused:int,refused_codes:array}
	 */
	public static function report() {
		global $wpdb;
		$t   = self::table();
		$col = self::schema_current() ? 'last_error' : 'failed'; // no last_error column yet: failed is NULL on waiting rows.
		$cut = gmdate( 'Y-m-d H:i:s', time() - self::REFUSED_DAYS * 86400 );
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table and column names are internal.
		$stuck = self::by_code( (array) $wpdb->get_results( $wpdb->prepare( "SELECT {$col} AS code, COUNT(*) AS n FROM {$t} WHERE done_at IS NULL AND attempts >= %d GROUP BY {$col}", self::STUCK ) ) );
		$gone  = self::by_code( (array) $wpdb->get_results( $wpdb->prepare( "SELECT failed AS code, COUNT(*) AS n FROM {$t} WHERE failed IS NOT NULL AND done_at >= %s GROUP BY failed", $cut ) ) );
		// phpcs:enable
		return array(
			'waiting'       => self::pending(),
			'stuck'         => (int) array_sum( $stuck ),
			'stuck_codes'   => $stuck,
			'refused'       => (int) array_sum( $gone ),
			'refused_codes' => $gone,
		);
	}

	private static function by_code( array $rows ) {
		$out = array();
		foreach ( $rows as $r ) {
			$code         = ( isset( $r->code ) && '' !== (string) $r->code ) ? (string) $r->code : 'unknown';
			$out[ $code ] = ( isset( $out[ $code ] ) ? $out[ $code ] : 0 ) + (int) $r->n;
		}
		return $out;
	}

	/** Seconds to wait after the nth failed attempt. */
	public static function delay( $attempt ) {
		return (int) min( 3600, 60 * ( 2 ** max( 0, min( 20, (int) $attempt - 1 ) ) ) );
	}

	/**
	 * Push what is due, oldest first. Stops at the first row that fails (or is not due yet) so
	 * events reach the manager in the order they happened. The exception is a row that has
	 * already failed STUCK times: it is skipped while it waits, and its next failure does not stop
	 * the run, so one event the manager keeps refusing never holds the newer ones back for ever.
	 * Its own customer's later events (same email or same door reference) are held back untouched
	 * while it waits or fails, so the manager never sees a customer's events out of order; other
	 * customers' events keep flowing. A final refusal holds nothing back.
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
		// Stuck rows that are not due are left out, so they cannot fill the batch.
		$rows = (array) $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . $t . ' WHERE done_at IS NULL AND ( attempts < %d OR next_at <= %s ) ORDER BY id ASC LIMIT %d', self::STUCK, gmdate( 'Y-m-d H:i:s', $now ), self::BATCH ) );
		$sent = 0;
		$held = self::held_by_earlier( $rows, $now );
		foreach ( $rows as $row ) {
			$stuck = (int) $row->attempts >= self::STUCK;
			$event = json_decode( (string) $row->body, true );
			if ( self::is_held( $held, $event ) ) {
				continue; // an earlier event of this customer has not gone yet: untouched this run.
			}
			if ( strtotime( $row->next_at . ' UTC' ) > $now || ! self::claim( $row, $now ) ) {
				if ( $stuck ) {
					self::hold( $held, $event );
					continue;
				}
				break;
			}
			if ( ! is_array( $event ) ) {
				self::finish( $row, $now, 'bad_body' );
				continue;
			}
			// A body that never got its eventId (a crash mid-enqueue) is completed, never sent without one.
			if ( empty( $event['eventId'] ) ) {
				$event['eventId'] = 'hd-' . (int) $row->id;
			}
			if ( empty( $event['at'] ) ) {
				$event['at'] = (int) round( microtime( true ) * 1000 );
			}
			$reply = HD_DD_Manager_Client::post_event( $event );
			if ( $reply['ok'] ) {
				self::finish( $row, $now, null );
				$sent++;
			} elseif ( $reply['final'] ) {
				self::finish( $row, $now, $reply['code'] );
			} else {
				$n    = (int) $row->attempts + 1;
				$data = array( 'attempts' => $n, 'next_at' => gmdate( 'Y-m-d H:i:s', $now + self::delay( $n ) ) );
				if ( self::schema_current() ) {
					$data['last_error'] = $reply['code'];
				}
				$wpdb->update( $t, $data, array( 'id' => (int) $row->id ), array_merge( array( '%d' ), array_fill( 0, count( $data ) - 1, '%s' ) ), array( '%d' ) );
				if ( ! $stuck ) {
					break;
				}
				self::hold( $held, $event );
			}
		}
		return $sent;
	}

	/**
	 * The customers held back before the batch starts: those of earlier stuck rows that are not
	 * due (the batch query leaves them out). One query, undelivered rows only.
	 *
	 * @return array{emails:array,refs:array}
	 */
	private static function held_by_earlier( array $rows, $now ) {
		global $wpdb;
		$held = array( 'emails' => array(), 'refs' => array() );
		if ( ! $rows ) {
			return $held;
		}
		$last    = (int) end( $rows )->id;
		$waiting = (array) $wpdb->get_results( $wpdb->prepare( 'SELECT id, body FROM ' . self::table() . ' WHERE done_at IS NULL AND attempts >= %d AND next_at > %s AND id < %d', self::STUCK, gmdate( 'Y-m-d H:i:s', $now ), $last ) );
		foreach ( $waiting as $w ) {
			self::hold( $held, json_decode( (string) $w->body, true ) );
		}
		return $held;
	}

	/** The event's customer keys: its email (trimmed, lower case) and its door reference. */
	private static function keys_of( $event ) {
		$email = ( is_array( $event ) && isset( $event['email'] ) && is_scalar( $event['email'] ) ) ? strtolower( trim( (string) $event['email'] ) ) : '';
		$ref   = ( is_array( $event ) && isset( $event['door']['reference'] ) && is_scalar( $event['door']['reference'] ) ) ? trim( (string) $event['door']['reference'] ) : '';
		return array( $email, $ref );
	}

	private static function hold( array &$held, $event ) {
		list( $email, $ref ) = self::keys_of( $event );
		if ( '' !== $email ) {
			$held['emails'][ $email ] = true;
		}
		if ( '' !== $ref ) {
			$held['refs'][ $ref ] = true;
		}
	}

	private static function is_held( array $held, $event ) {
		list( $email, $ref ) = self::keys_of( $event );
		return ( '' !== $email && isset( $held['emails'][ $email ] ) ) || ( '' !== $ref && isset( $held['refs'][ $ref ] ) );
	}

	/** Hold the row for a while so a second run skips it. False when someone else holds it. */
	private static function claim( $row, $now ) {
		global $wpdb;
		return 1 === (int) $wpdb->query( $wpdb->prepare( 'UPDATE ' . self::table() . ' SET next_at = %s WHERE id = %d AND done_at IS NULL AND next_at <= %s', gmdate( 'Y-m-d H:i:s', $now + self::CLAIM ), (int) $row->id, gmdate( 'Y-m-d H:i:s', $now ) ) );
	}

	private static function finish( $row, $now, $failed ) {
		global $wpdb;
		$data = array( 'attempts' => (int) $row->attempts + 1, 'done_at' => gmdate( 'Y-m-d H:i:s', $now ), 'failed' => $failed );
		if ( null !== $failed && self::schema_current() ) {
			$data['last_error'] = $failed;
		}
		$wpdb->update( self::table(), $data, array( 'id' => (int) $row->id ) );
	}
}
