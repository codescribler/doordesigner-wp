<?php
/**
 * The design effort a Designer 4 visitor put into a door: how many changes they made and how
 * long they spent on it (assets/js/designer4/d4-effort.js). Kept on the door's payload and passed
 * to the business, so a considered design can be told from a passing look. It gates nothing.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4_Effort {

	const MAX_CHANGES = 999;
	const MAX_SECONDS = 86400;
	const MAX_PARTS   = 12;

	/** The submitted effort, cleaned; null when none (or nothing usable) was sent. */
	public static function clean( $raw ) {
		if ( ! is_array( $raw ) || ! isset( $raw['changes'], $raw['seconds'] ) || ! is_numeric( $raw['changes'] ) || ! is_numeric( $raw['seconds'] ) ) {
			return null;
		}
		$parts = array();
		foreach ( ( isset( $raw['parts'] ) && is_array( $raw['parts'] ) ) ? $raw['parts'] : array() as $part ) {
			$part = is_string( $part ) ? preg_replace( '/[^a-z]/', '', strtolower( $part ) ) : '';
			if ( '' !== $part && ! in_array( $part, $parts, true ) && count( $parts ) < self::MAX_PARTS ) {
				$parts[] = substr( $part, 0, 20 );
			}
		}
		return array(
			'changes' => max( 0, min( self::MAX_CHANGES, (int) $raw['changes'] ) ),
			'seconds' => max( 0, min( self::MAX_SECONDS, (int) $raw['seconds'] ) ),
			'parts'   => $parts,
		);
	}

	/**
	 * The effort to keep for a door: the larger of what is stored and what has just arrived. A
	 * visit's counts only grow, and a later visit that reopens the door starts again from nothing.
	 */
	public static function merge( $stored, $raw ) {
		$new = self::clean( $raw );
		$old = self::clean( $stored );
		if ( ! $new ) {
			return $old;
		}
		if ( ! $old ) {
			return $new;
		}
		return array(
			'changes' => max( $old['changes'], $new['changes'] ),
			'seconds' => max( $old['seconds'], $new['seconds'] ),
			'parts'   => array_slice( array_values( array_unique( array_merge( $old['parts'], $new['parts'] ) ) ), 0, self::MAX_PARTS ),
		);
	}

	/** "7 changes over 6 min", or '' when there is nothing to say. */
	public static function describe( $effort ) {
		$e = self::clean( $effort );
		if ( ! $e ) {
			return '';
		}
		$time = $e['seconds'] < 60 ? $e['seconds'] . ' sec' : (int) round( $e['seconds'] / 60 ) . ' min';
		return $e['changes'] . ( 1 === $e['changes'] ? ' change' : ' changes' ) . ' over ' . $time;
	}
}
