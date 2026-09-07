<?php
/**
 * Records every enquiry POST that did NOT end in a stored enquiry — validation
 * errors, an unrecoverable nonce failure, a database error — as a status=failed row
 * carrying whatever the customer typed, writes a line to the PHP error log, and emails
 * the enquiry recipients so the customer can be called back.
 *
 * Hooks rest_post_dispatch, which WordPress applies to EVERY REST response including
 * authentication failures raised before the route's own callbacks run.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Failure_Log {

	/** At most one failure email per IP per this many seconds. Rows are always stored. */
	const MAIL_THROTTLE = 600;

	/** @var HD_DD_Repository */
	private $repository;

	public function __construct( HD_DD_Repository $repository ) {
		$this->repository = $repository;
	}

	public function register() {
		add_filter( 'rest_post_dispatch', array( $this, 'maybe_record' ), 10, 3 );
	}

	/**
	 * @param WP_HTTP_Response $response
	 * @param WP_REST_Server   $server
	 * @param WP_REST_Request  $request
	 * @return WP_HTTP_Response Always the untouched response.
	 */
	public function maybe_record( $response, $server, $request ) {
		try {
			if ( $this->is_failed_enquiry( $response, $request ) ) {
				$this->record( $response, $request );
			}
		} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement -- logging must never break the response.
			error_log( 'hd-door-designer: failure log error: ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		}
		return $response;
	}

	private function is_failed_enquiry( $response, $request ) {
		if ( ! ( $request instanceof WP_REST_Request ) || ! is_object( $response ) || ! method_exists( $response, 'get_status' ) ) {
			return false;
		}
		if ( 'POST' !== $request->get_method() || '/' . HD_DD_REST_NS . '/enquiry' !== $request->get_route() ) {
			return false;
		}
		$status = (int) $response->get_status();
		if ( $status < 400 ) {
			return false;
		}
		// A 403 is a nonce problem. The designer refreshes its nonce and retries once
		// (attempt 2); only that final failure is a lost customer. Attempt 1 heals itself,
		// and a request without the marker did not come from our UI.
		if ( 403 === $status ) {
			return '2' === (string) $request->get_header( 'X-HD-DD-Attempt' );
		}
		return true;
	}

	private function record( $response, WP_REST_Request $request ) {
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$data   = $response->get_data();
		$data   = is_array( $data ) ? $data : array();
		$fields = ( isset( $data['data']['fields'] ) && is_array( $data['data']['fields'] ) ) ? $data['data']['fields'] : array();

		$customer = array();
		foreach ( array( 'name', 'email', 'telephone', 'postcode' ) as $k ) {
			$customer[ $k ] = isset( $params[ $k ] ) && is_scalar( $params[ $k ] ) ? sanitize_text_field( wp_unslash( (string) $params[ $k ] ) ) : '';
		}
		$design = ( isset( $params['design'] ) && is_array( $params['design'] ) ) ? $this->clean_design( $params['design'] ) : array();

		$record = array(
			'failure'  => array(
				'code'    => isset( $data['code'] ) ? (string) $data['code'] : 'http_' . (int) $response->get_status(),
				'status'  => (int) $response->get_status(),
				'message' => isset( $data['message'] ) ? (string) $data['message'] : '',
				'fields'  => array_map( 'strval', $fields ),
			),
			'failedAt' => gmdate( 'c' ),
			'customer' => $customer,
			'design'   => $design,
			'request'  => array(
				'ip'        => self::client_ip(),
				'userAgent' => sanitize_text_field( (string) $request->get_header( 'User-Agent' ) ),
				'attempt'   => sanitize_text_field( (string) $request->get_header( 'X-HD-DD-Attempt' ) ),
				'hadImage'  => ! empty( $params['image'] ),
				'consent'   => ! empty( $params['consent'] ),
				'honeypot'  => ! empty( $params['hd_hp'] ),
			),
		);

		$saved     = $this->repository->insert_failure( array_merge( $customer, array( 'design' => $design, 'payload' => $record, 'source_ip' => $record['request']['ip'] ) ) );
		$reference = is_wp_error( $saved ) ? '(not stored: ' . $saved->get_error_message() . ')' : $saved['reference'];

		error_log( sprintf( // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			'hd-door-designer: enquiry submission FAILED %s [%s HTTP %d] %s | %s <%s> %s',
			$reference,
			$record['failure']['code'],
			$record['failure']['status'],
			$record['failure']['message'],
			$customer['name'],
			$customer['email'],
			$customer['telephone']
		) );

		if ( $this->may_email( $record['request']['ip'] ) ) {
			$this->email( $reference, $record );
		}
	}

	/** heading => { label, id } only, sanitised and capped — never the raw client blob. */
	private function clean_design( array $design ) {
		$out = array();
		$n   = 0;
		foreach ( $design as $heading => $choice ) {
			if ( ++$n > 40 ) {
				break;
			}
			$label = ( is_array( $choice ) && isset( $choice['label'] ) ) ? $choice['label'] : ( is_scalar( $choice ) ? $choice : '' );
			$out[ self::cap( sanitize_text_field( (string) $heading ), 80 ) ] = array(
				'label' => self::cap( sanitize_text_field( (string) $label ), 200 ),
				'id'    => ( is_array( $choice ) && isset( $choice['id'] ) && null !== $choice['id'] ) ? (int) $choice['id'] : null,
			);
		}
		return $out;
	}

	private function may_email( $ip ) {
		$key = 'hd_dd_failmail_' . md5( (string) $ip );
		if ( get_transient( $key ) ) {
			return false;
		}
		set_transient( $key, 1, self::MAIL_THROTTLE );
		return true;
	}

	private function email( $reference, array $record ) {
		$c   = $record['customer'];
		$f   = $record['failure'];
		$r   = $record['request'];
		$who = '' !== $c['name'] ? $c['name'] : ( '' !== $c['email'] ? $c['email'] : __( 'unknown customer', 'hd-door-designer' ) );

		/* translators: 1: customer name or email, 2: error code */
		$subject = sprintf( __( 'Door designer: submission FAILED — %1$s (%2$s)', 'hd-door-designer' ), $who, $f['code'] );

		$lines   = array();
		$lines[] = __( 'A customer tried to send a door design from the website configurator and it was NOT saved as an enquiry.', 'hd-door-designer' );
		$lines[] = __( 'If a successful enquiry from the same person follows, ignore this. Otherwise call them — their details are below.', 'hd-door-designer' );
		$lines[] = '';
		$lines[] = 'REFERENCE: ' . $reference;
		$lines[] = 'FAILED AT: ' . $record['failedAt'];
		$lines[] = 'REASON:    ' . $f['message'] . ' [' . $f['code'] . ', HTTP ' . $f['status'] . ']';
		foreach ( $f['fields'] as $field => $msg ) {
			$lines[] = '  - ' . $field . ': ' . $msg;
		}
		$lines[] = '';
		$lines[] = __( '— CUSTOMER (exactly as typed) —', 'hd-door-designer' );
		$lines[] = sprintf( '%-12s %s', __( 'Name:', 'hd-door-designer' ), $c['name'] );
		$lines[] = sprintf( '%-12s %s', __( 'Telephone:', 'hd-door-designer' ), $c['telephone'] );
		$lines[] = sprintf( '%-12s %s', __( 'Email:', 'hd-door-designer' ), $c['email'] );
		$lines[] = sprintf( '%-12s %s', __( 'Postcode:', 'hd-door-designer' ), $c['postcode'] );
		$lines[] = '';
		$lines[] = __( '— DESIGN —', 'hd-door-designer' );
		if ( $record['design'] ) {
			foreach ( $record['design'] as $heading => $choice ) {
				$lines[] = sprintf( '%-26s %s', $heading . ':', $choice['label'] );
			}
		} else {
			$lines[] = __( 'No design was received.', 'hd-door-designer' );
		}
		$lines[] = '';
		$lines[] = __( '— REQUEST —', 'hd-door-designer' );
		$lines[] = sprintf( '%-16s %s', 'IP:', $r['ip'] );
		$lines[] = sprintf( '%-16s %s', 'Browser:', $r['userAgent'] );
		$lines[] = sprintf( '%-16s %s', 'Attempt:', $r['attempt'] );
		$lines[] = sprintf( '%-16s %s', 'Image attached:', $r['hadImage'] ? 'yes' : 'no' );
		$lines[] = sprintf( '%-16s %s', 'Consent ticked:', $r['consent'] ? 'yes' : 'no' );
		$lines[] = sprintf( '%-16s %s', 'Honeypot filled:', $r['honeypot'] ? 'yes' : 'no' );
		$lines[] = '';
		$lines[] = '```json';
		$lines[] = wp_json_encode( $record, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		$lines[] = '```';

		$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
		if ( is_email( $c['email'] ) ) {
			$headers[] = 'Reply-To: ' . sanitize_email( $c['email'] );
		}
		wp_mail( HD_DD_Plugin::settings()['recipient_email'], $subject, implode( "\n", $lines ), $headers );
	}

	private static function cap( $s, $n ) {
		return function_exists( 'mb_substr' ) ? mb_substr( (string) $s, 0, $n ) : substr( (string) $s, 0, $n );
	}

	private static function client_ip() {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		return ( $ip && filter_var( $ip, FILTER_VALIDATE_IP ) ) ? $ip : '';
	}
}
