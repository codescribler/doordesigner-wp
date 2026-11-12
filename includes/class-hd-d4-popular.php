<?php
/**
 * Which door styles Designer 4's style screen shows first (assets/js/designer4/d4-styles.js).
 *
 * It starts from a hand-picked list (data/popular-styles.json) and learns from the doors people
 * really send: every stored design adds to its style's score, a lead more than an email-only
 * save. With little data the starting list leads; as designs come in, the styles people choose
 * most rise above it. Worked out at most every few hours and cached.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4_Popular {

	const TRANSIENT = 'hd_dd_d4_popular_styles';
	const TTL       = 21600;   // 6 hours
	const TOP       = 8;       // styles per door type
	const ROWS      = 600;     // newest stored designs read
	const SEED_TOP  = 3.0;     // score of the first style in the starting list
	const SEED_STEP = 0.3;     // and how much each later one drops by (never below SEED_MIN)
	const SEED_MIN  = 0.6;

	/** { "Single Door": ["Etna", …], … } for HD_DD_CONFIG.popularStyles. */
	public static function front_config() {
		$cached = get_transient( self::TRANSIENT );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$rows = array();
		try {
			$repository = new HD_DD_Repository();
			$rows       = $repository->list( self::ROWS );
		} catch ( \Throwable $e ) {
			$rows = array();
		}
		$out = self::rank( is_array( $rows ) ? $rows : array(), self::seed() );
		set_transient( self::TRANSIENT, $out, self::TTL );
		return $out;
	}

	/** The starting list: { type: [style, …] }, most likely first. */
	public static function seed() {
		$file = HD_DD_DIR . 'data/popular-styles.json';
		$data = is_readable( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : null; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a file in the plugin.
		$out  = array();
		foreach ( is_array( $data ) ? $data : array() as $type => $styles ) {
			if ( is_array( $styles ) ) {
				$out[ (string) $type ] = array_values( array_filter( array_map( 'strval', $styles ) ) );
			}
		}
		return $out;
	}

	/**
	 * The top styles per door type from stored rows and the starting list.
	 *
	 * @param array $rows Enquiry rows (design JSON, kind, status, removed_at).
	 * @param array $seed { type: [style, …] }.
	 * @return array { type: [style, …] } at most TOP each, best first.
	 */
	public static function rank( array $rows, array $seed ) {
		$score = array();
		$order = array();   // first seen, to break ties the same way every time
		$n     = 0;
		foreach ( $seed as $type => $styles ) {
			foreach ( array_values( $styles ) as $i => $style ) {
				$style = trim( $style );
				if ( '' === $style || isset( $score[ $type ][ $style ] ) ) {
					continue;
				}
				$score[ $type ][ $style ] = max( self::SEED_MIN, self::SEED_TOP - self::SEED_STEP * $i );
				$order[ $type ][ $style ] = $n++;
			}
		}
		foreach ( $rows as $row ) {
			if ( ! is_object( $row ) || ! empty( $row->removed_at ) || ( isset( $row->status ) && in_array( $row->status, array( 'failed', 'flagged' ), true ) ) ) {
				continue;
			}
			$design = json_decode( isset( $row->design ) ? (string) $row->design : '', true );
			$type   = isset( $design['Door Type']['label'] ) ? trim( (string) $design['Door Type']['label'] ) : '';
			$style  = isset( $design['Door Design']['label'] ) ? trim( (string) $design['Door Design']['label'] ) : '';
			if ( '' === $type || '' === $style ) {
				continue;
			}
			if ( ! isset( $score[ $type ][ $style ] ) ) {
				$score[ $type ][ $style ] = 0;
				$order[ $type ][ $style ] = $n++;
			}
			$score[ $type ][ $style ] += ( isset( $row->kind ) && 'save' === $row->kind ) ? 1 : 2;
		}
		$out = array();
		foreach ( $score as $type => $styles ) {
			$names = array_keys( $styles );
			usort(
				$names,
				function ( $a, $b ) use ( $styles, $order, $type ) {
					if ( $styles[ $a ] === $styles[ $b ] ) {
						return $order[ $type ][ $a ] - $order[ $type ][ $b ];
					}
					return $styles[ $a ] < $styles[ $b ] ? 1 : -1;
				}
			);
			$out[ $type ] = array_slice( $names, 0, self::TOP );
		}
		return $out;
	}
}
