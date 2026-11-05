<?php
/**
 * Pure counting for the A/B report: turns the visitor rows of one experiment into the
 * per-arm numbers the scoreboard shows. No WordPress calls, so it is tested under plain PHP.
 *
 * Per arm:
 *   visitors, leads (quote requests: the deciding figure), callbacks,
 *   saves, anyLeads (quote, save or call back), savedThenQuoted,
 *   journey  { since, opened, started, shown, saved, form, quoted, callbacks, anyLeads }
 *            visitors who arrived on or after `since` only (milestones were not recorded before),
 *   devices  { phone|desktop|unknown: { visitors, leads, anyLeads } }
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Experiment_Journey {

	const DEVICES = array( 'phone', 'desktop', 'unknown' );

	/**
	 * @param array  $rows  Visitor rows (objects or arrays): arm, device, exposed_at, started_at,
	 *                      shown_at, form_at, saved_at, converted_at, callback_at.
	 * @param string $since 'Y-m-d H:i:s' UTC: the journey counts visitors exposed from then on.
	 * @param array  $arms  Arm keys to report (always present, even with no rows).
	 * @return array arm => numbers.
	 */
	public static function summarise( array $rows, $since, array $arms = array( 'control', 'challenger' ) ) {
		$out = array();
		foreach ( $arms as $arm ) {
			$out[ $arm ] = self::blank( $since );
		}
		foreach ( $rows as $row ) {
			$r   = is_object( $row ) ? get_object_vars( $row ) : (array) $row;
			$arm = isset( $r['arm'] ) ? (string) $r['arm'] : '';
			if ( ! isset( $out[ $arm ] ) ) {
				continue;
			}
			self::add( $out[ $arm ], $r, (string) $since );
		}
		return $out;
	}

	private static function blank( $since ) {
		$dev = array();
		foreach ( self::DEVICES as $d ) {
			$dev[ $d ] = array( 'visitors' => 0, 'leads' => 0, 'anyLeads' => 0 );
		}
		return array(
			'visitors'        => 0,
			'leads'           => 0,
			'callbacks'       => 0,
			'saves'           => 0,
			'anyLeads'        => 0,
			'savedThenQuoted' => 0,
			'journey'         => array(
				'since'     => self::iso( $since ),
				'opened'    => 0,
				'started'   => 0,
				'shown'     => 0,
				'saved'     => 0,
				'form'      => 0,
				'quoted'    => 0,
				'callbacks' => 0,
				'anyLeads'  => 0,
			),
			'devices'         => $dev,
		);
	}

	private static function add( array &$a, array $r, $since ) {
		$quoted   = self::set( $r, 'converted_at' );
		$saved    = self::set( $r, 'saved_at' );
		$callback = self::set( $r, 'callback_at' );
		$any      = $quoted || $saved || $callback;

		$a['visitors']++;
		$a['leads']           += $quoted ? 1 : 0;
		$a['callbacks']       += $callback ? 1 : 0;
		$a['saves']           += $saved ? 1 : 0;
		$a['anyLeads']        += $any ? 1 : 0;
		$a['savedThenQuoted'] += ( $saved && $quoted ) ? 1 : 0;

		$device = isset( $r['device'] ) && in_array( $r['device'], self::DEVICES, true ) ? $r['device'] : 'unknown';
		$a['devices'][ $device ]['visitors']++;
		$a['devices'][ $device ]['leads']    += $quoted ? 1 : 0;
		$a['devices'][ $device ]['anyLeads'] += $any ? 1 : 0;

		$exposed = isset( $r['exposed_at'] ) ? (string) $r['exposed_at'] : '';
		if ( '' === $exposed || strcmp( $exposed, $since ) < 0 ) {
			return; // arrived before milestones were recorded.
		}
		$j = &$a['journey'];
		$j['opened']++;
		$j['started']   += self::set( $r, 'started_at' ) ? 1 : 0;
		$j['shown']     += self::set( $r, 'shown_at' ) ? 1 : 0;
		$j['form']      += self::set( $r, 'form_at' ) ? 1 : 0;
		$j['saved']     += $saved ? 1 : 0;
		$j['quoted']    += $quoted ? 1 : 0;
		$j['callbacks'] += $callback ? 1 : 0;
		$j['anyLeads']  += $any ? 1 : 0;
	}

	private static function set( array $r, $key ) {
		return isset( $r[ $key ] ) && null !== $r[ $key ] && '' !== $r[ $key ];
	}

	/** 'Y-m-d H:i:s' (UTC) → ISO 8601 with a Z. */
	private static function iso( $mysql ) {
		$t = strtotime( (string) $mysql . ' UTC' );
		return $t ? gmdate( 'Y-m-d\TH:i:s\Z', $t ) : (string) $mysql;
	}
}
