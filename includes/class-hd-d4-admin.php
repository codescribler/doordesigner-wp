<?php
/**
 * Designer 4 in wp-admin: the list badges, the state of a door, the scoreboard note and the
 * manager backlog. Static helpers; every string returned is escaped markup.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4_Admin {

	private static function pill( $text, $bg = '#e7f0ec', $fg = '#1d4f3f' ) {
		return '<span style="display:inline-block;margin:3px 3px 0 0;padding:1px 7px;border-radius:9px;background:' . $bg . ';color:' . $fg . ';font-size:11px;font-weight:600;">' . esc_html( $text ) . '</span>';
	}

	private static function is_d4( $row ) {
		return $row && isset( $row->flow, $row->kind ) && 'designer4' === $row->flow && 'enquiry' === $row->kind;
	}

	/** Badges for a Designer 4 row (new columns may be absent), or '' for any other row. */
	public static function badges( $row ) {
		if ( ! self::is_d4( $row ) ) {
			return '';
		}
		$html = self::pill( __( 'Designer 4', 'hd-door-designer' ) );
		if ( ! empty( $row->removed_at ) ) {
			$html .= self::pill( __( 'Removed by customer', 'hd-door-designer' ), '#fbe9e7', '#8a2a1f' );
		}
		if ( ! empty( $row->doorway_at ) ) {
			$html .= self::pill( __( 'Doorway ✓', 'hd-door-designer' ) );
		}
		if ( ! empty( $row->details_at ) ) {
			$html .= self::pill( __( 'Details ✓', 'hd-door-designer' ) );
		}
		return '<br>' . $html;
	}

	/** A note under the Leads figure of a Designer 4 arm: its lead is the email sent. */
	public static function leads_note( $flow ) {
		return 'designer4' === $flow ? '<br><small>' . esc_html__( 'Leads (email sent)', 'hd-door-designer' ) . '</small>' : '';
	}

	/**
	 * What wp-admin shows: rows waiting, rows the manager keeps refusing (HD_DD_Manager_Queue::STUCK+ failures, by last
	 * error) and rows refused for good in the last REFUSED_DAYS days (by code).
	 *
	 * @return array{waiting:int,stuck:int,stuck_codes:array,refused:int,refused_codes:array}
	 */
	public static function queue_report() {
		global $wpdb;
		$t   = HD_DD_Manager_Queue::table();
		$col = HD_DD_Manager_Queue::schema_current() ? 'last_error' : 'failed'; // no last_error column yet: failed is NULL on waiting rows.
		$cut = gmdate( 'Y-m-d H:i:s', time() - HD_DD_Manager_Queue::REFUSED_DAYS * 86400 );
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table and column names are internal.
		$stuck = self::by_code( (array) $wpdb->get_results( $wpdb->prepare( "SELECT {$col} AS code, COUNT(*) AS n FROM {$t} WHERE done_at IS NULL AND attempts >= %d GROUP BY {$col}", HD_DD_Manager_Queue::STUCK ) ) );
		$gone  = self::by_code( (array) $wpdb->get_results( $wpdb->prepare( "SELECT failed AS code, COUNT(*) AS n FROM {$t} WHERE failed IS NOT NULL AND done_at >= %s GROUP BY failed", $cut ) ) );
		// phpcs:enable
		return array(
			'waiting'       => HD_DD_Manager_Queue::pending(),
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

	/**
	 * The manager backlog: events waiting, events the manager keeps refusing (failed 8+ times,
	 * with the last error) and events refused for good in the last 30 days (with the code).
	 */
	public static function waiting_note() {
		$r     = self::queue_report();
		$lines = array(
			/* translators: %d: events */
			sprintf( __( 'Manager events waiting to be delivered: %d', 'hd-door-designer' ), $r['waiting'] ),
			/* translators: %d: events */
			sprintf( __( 'The manager keeps refusing: %d', 'hd-door-designer' ), $r['stuck'] ) . self::codes( $r['stuck_codes'], __( 'last error', 'hd-door-designer' ) ),
			/* translators: %d: events */
			sprintf( __( 'Refused for good in the last 30 days: %d', 'hd-door-designer' ), $r['refused'] ) . self::codes( $r['refused_codes'], __( 'code', 'hd-door-designer' ) ),
		);
		return '<p class="description">' . implode( '<br>', array_map( 'esc_html', $lines ) ) . '</p>';
	}

	/** " (last error: http_401:unauthorized × 2)" or '' when there are none. */
	private static function codes( array $codes, $label ) {
		$parts = array();
		foreach ( $codes as $code => $n ) {
			$parts[] = $code . ( $n > 1 ? ' × ' . $n : '' );
		}
		return $parts ? ' (' . $label . ': ' . implode( ', ', $parts ) . ')' : '';
	}
}
