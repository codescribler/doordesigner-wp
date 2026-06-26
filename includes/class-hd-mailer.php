<?php
/**
 * Builds and sends the enquiry notification. The email carries BOTH a human
 * summary for Daniel AND a fenced JSON block (Endurance vocabulary) that he or
 * Claude can paste straight into the quote-creator workflow.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Mailer {

	/**
	 * @param array  $payload   The full structured payload (reference, customer, design, derived).
	 * @param string $recipient Recipient email.
	 * @return bool wp_mail result.
	 */
	public static function send( array $payload, $recipient ) {
		$reference = isset( $payload['reference'] ) ? $payload['reference'] : '';
		$subject   = sprintf(
			/* translators: 1: reference, 2: customer name */
			__( 'New door enquiry %1$s — %2$s', 'hd-door-designer' ),
			$reference,
			isset( $payload['customer']['name'] ) ? $payload['customer']['name'] : ''
		);

		$body = self::build_body( $payload );

		$headers = array( 'Content-Type: text/plain; charset=UTF-8' );

		// Reply straight to the customer if we have their address.
		if ( ! empty( $payload['customer']['email'] ) ) {
			$headers[] = 'Reply-To: ' . sanitize_email( $payload['customer']['email'] );
		}

		/**
		 * Allow downstream integrations (CRM, second recipient) to adjust the mail.
		 */
		$args = apply_filters(
			'hd_dd_enquiry_mail',
			array(
				'to'      => $recipient,
				'subject' => $subject,
				'body'    => $body,
				'headers' => $headers,
			),
			$payload
		);

		return wp_mail( $args['to'], $args['subject'], $args['body'], $args['headers'] );
	}

	/** Plain-text body: readable summary, then a copyable JSON block. */
	private static function build_body( array $payload ) {
		$c     = isset( $payload['customer'] ) ? $payload['customer'] : array();
		$lines = array();

		$lines[] = __( 'A new door enquiry has come in from the website configurator.', 'hd-door-designer' );
		$lines[] = '';
		$lines[] = __( 'REFERENCE: ', 'hd-door-designer' ) . ( isset( $payload['reference'] ) ? $payload['reference'] : '' );
		$lines[] = __( 'RECEIVED:  ', 'hd-door-designer' ) . ( isset( $payload['submittedAt'] ) ? $payload['submittedAt'] : '' );
		$lines[] = '';
		$lines[] = __( '— CUSTOMER —', 'hd-door-designer' );
		$lines[] = sprintf( "%-12s %s", __( 'Name:', 'hd-door-designer' ), isset( $c['name'] ) ? $c['name'] : '' );
		$lines[] = sprintf( "%-12s %s", __( 'Telephone:', 'hd-door-designer' ), isset( $c['telephone'] ) ? $c['telephone'] : '' );
		$lines[] = sprintf( "%-12s %s", __( 'Email:', 'hd-door-designer' ), isset( $c['email'] ) ? $c['email'] : '' );
		$lines[] = sprintf( "%-12s %s", __( 'Postcode:', 'hd-door-designer' ), isset( $c['postcode'] ) ? $c['postcode'] : '' );
		$lines[] = '';
		$lines[] = __( '— DESIGN —', 'hd-door-designer' );

		if ( ! empty( $payload['design'] ) && is_array( $payload['design'] ) ) {
			foreach ( $payload['design'] as $heading => $choice ) {
				$label = is_array( $choice ) && isset( $choice['label'] ) ? $choice['label'] : '';
				$lines[] = sprintf( '%-26s %s', $heading . ':', $label );
			}
		}

		if ( ! empty( $payload['derived']['suggestedLock'] ) ) {
			$lines[] = '';
			$lines[] = sprintf(
				/* translators: %s: lock name */
				__( 'Suggested lock (derived, non-binding): %s', 'hd-door-designer' ),
				$payload['derived']['suggestedLock']
			);
		}

		$lines[] = '';
		$lines[] = __( '— STRUCTURED PAYLOAD (paste into the quote-creator) —', 'hd-door-designer' );
		$lines[] = '```json';
		$lines[] = wp_json_encode( $payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		$lines[] = '```';

		return implode( "\n", $lines );
	}
}
