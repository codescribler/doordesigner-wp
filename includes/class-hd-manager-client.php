<?php
/**
 * Talks to the manager: pushes one lead event, reads door statuses back.
 * Settings `manager_url` and `manager_key` live in hd_dd_settings and never reach the browser.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Manager_Client {

	const TIMEOUT   = 8;
	const CACHE_TTL = 300;

	/**
	 * Send one event.
	 *
	 * ok = delivered. final = refused for good (never retry). Not ok and not final = try later.
	 * The manager answers ANY error it does not recognise (infrastructure failures included) with
	 * 422 request_failed, so only its deliberate refusals are final: 422 invalid_request and
	 * 409 deal_closed. Its error body is { "error": { "code": "...", "message": "..." } }.
	 * code is the refusal's code when final, otherwise what went wrong ("http_422:request_failed",
	 * "http_500", or the WP_Error code such as "http_request_failed").
	 *
	 * @return array{ok:bool,final:bool,code:string,status:string}
	 */
	public static function post_event( array $event ) {
		$reply = self::post( '/website-leads/events', $event );
		if ( null === $reply ) {
			return self::result( false, false, 'not_configured' );
		}
		if ( is_wp_error( $reply ) ) {
			return self::result( false, false, substr( (string) $reply->get_error_code(), 0, 190 ) );
		}
		$http = (int) wp_remote_retrieve_response_code( $reply );
		$data = json_decode( (string) wp_remote_retrieve_body( $reply ), true );
		$data = is_array( $data ) ? $data : array();
		if ( 200 === $http ) {
			return self::result( true, false, '', isset( $data['status'] ) ? (string) $data['status'] : '' );
		}
		$code = ( isset( $data['error']['code'] ) && is_string( $data['error']['code'] ) ) ? substr( sanitize_key( $data['error']['code'] ), 0, 150 ) : '';
		if ( ( 422 === $http && 'invalid_request' === $code ) || ( 409 === $http && 'deal_closed' === $code ) ) {
			return self::result( false, true, $code );
		}
		return self::result( false, false, 'http_' . $http . ( '' !== $code ? ':' . $code : '' ) );
	}

	/**
	 * Door statuses for some references, from the manager (cached five minutes).
	 *
	 * @return array<string,string> reference => pending | estimate_sent | closed. Empty on any failure.
	 */
	public static function status( array $references ) {
		$refs = array_values( array_unique( array_filter( array_map( 'strval', $references ) ) ) );
		if ( ! $refs ) {
			return array();
		}
		sort( $refs );
		$key    = 'hd_dd_d4_status_' . md5( implode( ',', $refs ) );
		$cached = get_transient( $key );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$reply = self::post( '/website-leads/status', array( 'references' => $refs ) );
		if ( null === $reply || is_wp_error( $reply ) || 200 !== (int) wp_remote_retrieve_response_code( $reply ) ) {
			return array();
		}
		$data = json_decode( (string) wp_remote_retrieve_body( $reply ), true );
		if ( ! is_array( $data ) || ! isset( $data['doors'] ) || ! is_array( $data['doors'] ) ) {
			return array();
		}
		$out = array();
		foreach ( $data['doors'] as $door ) {
			if ( is_array( $door ) && isset( $door['reference'], $door['status'] ) ) {
				$out[ (string) $door['reference'] ] = (string) $door['status'];
			}
		}
		set_transient( $key, $out, self::CACHE_TTL );
		return $out;
	}

	public static function is_configured() {
		$s = HD_DD_Plugin::settings();
		return '' !== trim( (string) $s['manager_url'] ) && '' !== trim( (string) $s['manager_key'] );
	}

	/** POST JSON to the manager. null when it is not configured (nothing is sent). */
	private static function post( $path, array $payload ) {
		if ( ! self::is_configured() ) {
			return null;
		}
		$s = HD_DD_Plugin::settings();
		return wp_remote_post(
			rtrim( trim( (string) $s['manager_url'] ), '/' ) . $path,
			array(
				'timeout' => self::TIMEOUT,
				'headers' => array(
					'Authorization' => 'Bearer ' . trim( (string) $s['manager_key'] ),
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( $payload ),
			)
		);
	}

	private static function result( $ok, $final, $code, $status = '' ) {
		return array( 'ok' => $ok, 'final' => $final, 'code' => $code, 'status' => $status );
	}
}
