<?php
/**
 * Who may open a person's Designer 4 doors, and the links that carry it. The owner key is a
 * keyed hash of the email address: it is only ever sent to that address (in the link email),
 * so possessing it is what proves a visitor is the owner. It is never returned by the API.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4_Access {

	/** 40 hex characters, stable for an email address (case and outer spaces ignored). */
	public static function owner_key( $email ) {
		return substr( hash_hmac( 'sha256', strtolower( trim( (string) $email ) ), wp_salt( 'auth' ) ), 0, 40 );
	}

	/** True when $key is the owner key of the row's email address. */
	public static function is_owner( $row, $key ) {
		$email = ( is_object( $row ) && isset( $row->customer_email ) ) ? (string) $row->customer_email : '';
		return '' !== $email && is_string( $key ) && '' !== $key && hash_equals( self::owner_key( $email ), $key );
	}

	/**
	 * The page a link should open: the page the visitor was on, but only when it is on this site
	 * (a forged pageUrl can never put an off-site link in an email), else the designer page.
	 */
	public static function page_base( $page_url ) {
		$candidate = esc_url_raw( (string) $page_url );
		if ( $candidate && wp_parse_url( $candidate, PHP_URL_HOST ) === wp_parse_url( home_url(), PHP_URL_HOST ) ) {
			return $candidate;
		}
		$page_id = (int) HD_DD_Plugin::settings()['page_id'];
		$base    = $page_id ? get_permalink( $page_id ) : home_url( '/' );
		return $base ? (string) $base : '';
	}

	/** The "My designs" link: the page with designs={token}&k={owner key}. '' when there is no page. */
	public static function designs_url( $page_url, $row ) {
		$base = self::page_base( $page_url );
		if ( '' === $base || ! is_object( $row ) ) {
			return '';
		}
		return add_query_arg( array( 'designs' => rawurlencode( (string) $row->token ), 'k' => self::owner_key( $row->customer_email ) ), $base );
	}

	/** False when the Handle choice is missing, or says "No handle" (any case, any trailing space). */
	public static function has_handle( array $design ) {
		if ( ! isset( $design['Handle']['label'] ) || ! is_scalar( $design['Handle']['label'] ) ) {
			return false;
		}
		$label = trim( (string) $design['Handle']['label'] );
		return '' !== $label && ! preg_match( '/^\s*no handle/i', $label );
	}
}
