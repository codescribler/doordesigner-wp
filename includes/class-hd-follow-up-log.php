<?php
/**
 * What happened with the saver follow-ups, one row per event in wp_hd_dd_followup_events:
 *   sent      email N went to this saver
 *   click     they pressed a button in email N (detail: price / open)
 *   quote     they asked for a price after email N (N = 0: before any follow-up)
 *   callback  they asked for a call back after email N
 * Unsubscribes and hand stops are on the follow-up row itself (stop_reason).
 *
 * summarise() is pure, so the report maths is tested without a database.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Follow_Up_Log {

	const TYPES = array( 'sent', 'click', 'quote', 'callback' );

	/** Clicks this soon after sending are mail scanners checking links, not people. */
	const SCANNER_SECONDS = 120;

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'hd_dd_followup_events';
	}

	/** Record an event. $detail is a short note (the button pressed). */
	public static function add( $enquiry_id, $step, $type, $detail = '', $at = null ) {
		global $wpdb;
		if ( ! in_array( $type, self::TYPES, true ) ) {
			return false;
		}
		return (bool) $wpdb->insert(
			self::table(),
			array(
				'enquiry_id' => (int) $enquiry_id,
				'step'       => (int) $step,
				'type'       => $type,
				'detail'     => substr( (string) $detail, 0, 20 ),
				'at'         => gmdate( 'Y-m-d H:i:s', null === $at ? time() : (int) $at ),
			),
			array( '%d', '%d', '%s', '%s', '%s' )
		);
	}

	/** Every event, oldest first. */
	public static function all() {
		global $wpdb;
		return (array) $wpdb->get_results( 'SELECT * FROM ' . self::table() . ' ORDER BY at ASC, id ASC' );
	}

	/** One saved design's events, oldest first. */
	public static function for_enquiry( $enquiry_id ) {
		global $wpdb;
		return (array) $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE enquiry_id = %d ORDER BY at ASC, id ASC', (int) $enquiry_id ) );
	}

	/** The latest events with who they were for (email address, design, reference), newest first. */
	public static function recent( $limit = 100 ) {
		global $wpdb;
		$et = HD_DD_Repository::table();
		return (array) $wpdb->get_results( $wpdb->prepare( 'SELECT ev.*, e.customer_email, e.design_name, e.reference FROM ' . self::table() . " ev LEFT JOIN {$et} e ON e.id = ev.enquiry_id ORDER BY ev.at DESC, ev.id DESC LIMIT %d", (int) $limit ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	/** How sequences ended: stop_reason => count, plus 'running' and 'total'. */
	public static function outcomes() {
		global $wpdb;
		$rows = (array) $wpdb->get_results( 'SELECT stopped_at IS NULL AS running, stop_reason, COUNT(*) AS n FROM ' . HD_DD_Follow_Up::table() . ' GROUP BY running, stop_reason' );
		$out  = array( 'running' => 0, 'total' => 0 );
		foreach ( $rows as $r ) {
			$k         = (int) $r->running ? 'running' : (string) $r->stop_reason;
			$out[ $k ] = ( isset( $out[ $k ] ) ? $out[ $k ] : 0 ) + (int) $r->n;
			$out['total'] += (int) $r->n;
		}
		return $out;
	}

	/**
	 * Per email (1–3): how many it went to, how many clicked, and how many asked for a price
	 * or a call back with it as the last email they had. Step 0 counts leads that came before
	 * any follow-up went (they stop the sequence, so they are shown for context).
	 *
	 * @param object[] $events Rows from all().
	 * @return array step => {sent, clicked, quotes, callbacks}.
	 */
	public static function summarise( array $events ) {
		$out  = array();
		$seen = array();
		foreach ( array( 0, 1, 2, 3 ) as $s ) {
			$out[ $s ] = array( 'sent' => 0, 'clicked' => 0, 'quotes' => 0, 'callbacks' => 0 );
		}
		$key = array( 'sent' => 'sent', 'click' => 'clicked', 'quote' => 'quotes', 'callback' => 'callbacks' );
		foreach ( $events as $e ) {
			$step = (int) $e->step;
			$type = (string) $e->type;
			if ( ! isset( $out[ $step ], $key[ $type ] ) ) {
				continue;
			}
			$id = $type . '|' . $step . '|' . (int) $e->enquiry_id; // people, not clicks.
			if ( isset( $seen[ $id ] ) ) {
				continue;
			}
			$seen[ $id ] = true;
			$out[ $step ][ $key[ $type ] ]++;
		}
		return $out;
	}

	/** Plain words for one event, for the log. */
	public static function describe( $e ) {
		$n = (int) $e->step;
		switch ( (string) $e->type ) {
			case 'sent':
				return sprintf( /* translators: %d: email number */ __( 'Sent email %d', 'hd-door-designer' ), $n );
			case 'click':
				$what = 'price' === $e->detail ? __( 'Get my exact price', 'hd-door-designer' ) : __( 'Open my design', 'hd-door-designer' );
				return sprintf( /* translators: 1: button, 2: email number */ __( 'Clicked "%1$s" in email %2$d', 'hd-door-designer' ), $what, $n );
			case 'quote':
				return $n ? sprintf( /* translators: %d: email number */ __( 'Asked for a price (after email %d)', 'hd-door-designer' ), $n ) : __( 'Asked for a price (before any follow-up)', 'hd-door-designer' );
			case 'callback':
				return $n ? sprintf( /* translators: %d: email number */ __( 'Asked for a call back (after email %d)', 'hd-door-designer' ), $n ) : __( 'Asked for a call back (before any follow-up)', 'hd-door-designer' );
		}
		return (string) $e->type;
	}

	public static function create_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$t = self::table();
		dbDelta(
			"CREATE TABLE {$t} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			enquiry_id BIGINT UNSIGNED NOT NULL,
			step TINYINT UNSIGNED NOT NULL DEFAULT 0,
			type VARCHAR(10) NOT NULL,
			detail VARCHAR(20) NOT NULL DEFAULT '',
			at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY enquiry_id (enquiry_id),
			KEY at (at)
		) {$wpdb->get_charset_collate()};"
		);
	}
}
