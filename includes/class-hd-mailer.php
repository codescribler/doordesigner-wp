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
	 * @param array  $payload     The full structured payload (reference, customer, design, derived).
	 * @param string $recipient   Recipient email.
	 * @param array  $attachments Absolute file paths to attach (e.g. the door preview PNG).
	 * @return bool wp_mail result.
	 */
	public static function send( array $payload, $recipient, array $attachments = array() ) {
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
				'to'          => $recipient,
				'subject'     => $subject,
				'body'        => $body,
				'headers'     => $headers,
				'attachments' => $attachments,
			),
			$payload
		);

		return wp_mail( $args['to'], $args['subject'], $args['body'], $args['headers'], isset( $args['attachments'] ) ? $args['attachments'] : array() );
	}

	/**
	 * Friendly acknowledgment to the CUSTOMER (best-effort): thanks, a summary of their
	 * door, and the link to revisit/tweak it. Sent from "Hertfordshire Doors"; replies go
	 * to the business. Never throws — a failure here must not affect the saved enquiry.
	 *
	 * @param array  $payload    The enquiry payload (reference, customer, design).
	 * @param string $reload_url The "revisit your design" link (may be empty).
	 * @return bool wp_mail result.
	 */
	public static function send_customer_ack( array $payload, $reload_url ) {
		$to = isset( $payload['customer']['email'] ) ? sanitize_email( $payload['customer']['email'] ) : '';
		if ( ! is_email( $to ) ) {
			return false;
		}
		$name      = isset( $payload['customer']['name'] ) && '' !== $payload['customer']['name'] ? $payload['customer']['name'] : __( 'there', 'hd-door-designer' );
		$reference = isset( $payload['reference'] ) ? $payload['reference'] : '';

		// Send from the site's own domain so SPF/DKIM line up; replies reach the business.
		$host     = preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		$from     = $host ? 'Hertfordshire Doors <noreply@' . $host . '>' : 'Hertfordshire Doors';
		$settings = HD_DD_Plugin::settings();

		/* translators: %s: enquiry reference */
		$subject = sprintf( __( 'Your Hertfordshire Doors design (%s)', 'hd-door-designer' ), $reference );

		$body = self::customer_ack_html( $payload, $reload_url, $name, $reference );

		$headers = array( 'Content-Type: text/html; charset=UTF-8', 'From: ' . $from );
		if ( ! empty( $settings['recipient_email'] ) ) {
			$headers[] = 'Reply-To: ' . sanitize_email( $settings['recipient_email'] );
		}

		return wp_mail( $to, $subject, $body, $headers );
	}

	/**
	 * The customer acknowledgment as an HTML email — a picture of their designed door on the
	 * left with the spec to the right (table-based for email-client compatibility, inline
	 * styles only). Degrades to spec-only when no preview image was captured.
	 */
	private static function customer_ack_html( array $payload, $reload_url, $name, $reference ) {
		$image_url = isset( $payload['image'] ) ? esc_url( $payload['image'] ) : '';

		// Spec rows (heading : value).
		$rows = '';
		if ( ! empty( $payload['design'] ) && is_array( $payload['design'] ) ) {
			foreach ( $payload['design'] as $heading => $choice ) {
				$label = is_array( $choice ) && isset( $choice['label'] ) ? $choice['label'] : '';
				if ( '' === $label ) {
					continue;
				}
				$rows .= '<tr>'
					. '<td style="padding:2px 12px 2px 0;color:#8a8e96;font-size:13px;vertical-align:top;">' . esc_html( $heading ) . '</td>'
					. '<td style="padding:2px 0;color:#161616;font-size:13px;font-weight:600;vertical-align:top;">' . esc_html( $label ) . '</td>'
					. '</tr>';
			}
		}

		$image_cell = $image_url
			? '<td valign="top" width="160" style="width:160px;padding:0 18px 0 0;">'
				. '<img src="' . $image_url . '" alt="' . esc_attr__( 'Your door design', 'hd-door-designer' ) . '" width="160" style="display:block;width:160px;height:auto;border:1px solid #e6e6e6;border-radius:6px;background:#f3f3f1;" />'
				. '</td>'
			: '';

		$revisit = $reload_url
			? '<tr><td style="padding:20px 28px 0;">'
				. '<a href="' . esc_url( $reload_url ) . '" style="display:inline-block;background:#161616;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:6px;">'
				. esc_html__( 'Revisit or tweak this design', 'hd-door-designer' ) . '</a>'
				. '</td></tr>'
			: '';

		$intro = esc_html__( 'Thanks for designing your door with Hertfordshire Doors. We have received it and will be in touch shortly with your free, no-obligation quote — usually within one working day.', 'hd-door-designer' );
		$price = esc_html__( 'As a guide, a fully fitted composite door installed by qualified fitters typically ranges from £1,000 to £4,000 depending on the options you choose.', 'hd-door-designer' );

		return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;"><tr><td align="center">'
			. '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6e6e6;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">'
			. '<tr><td style="padding:28px 28px 6px;">'
			. '<h1 style="margin:0 0 10px;font-size:20px;color:#161616;">' . sprintf( esc_html__( 'Thank you, %s', 'hd-door-designer' ), esc_html( $name ) ) . '</h1>'
			. '<p style="margin:0;font-size:14px;line-height:1.5;color:#5a5f68;">' . $intro . '</p>'
			. '</td></tr>'
			. '<tr><td style="padding:18px 28px 0;">'
			. '<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>'
			. $image_cell
			. '<td valign="top">'
			. '<div style="font-size:13px;font-weight:700;color:#161616;margin-bottom:6px;">' . esc_html__( 'Your design', 'hd-door-designer' ) . ' <span style="color:#8a8e96;font-weight:400;">' . esc_html( $reference ) . '</span></div>'
			. '<table role="presentation" cellpadding="0" cellspacing="0">' . $rows . '</table>'
			. '</td>'
			. '</tr></table>'
			. '</td></tr>'
			. $revisit
			. '<tr><td style="padding:20px 28px 0;">'
			. '<p style="margin:0;padding:12px 14px;background:#f3f3f1;border:1px solid #e6e6e6;border-radius:6px;font-size:13px;line-height:1.5;color:#161616;">' . $price . '</p>'
			. '</td></tr>'
			. '<tr><td style="padding:18px 28px 28px;"><p style="margin:0;font-size:13px;color:#8a8e96;">Hertfordshire Doors</p></td></tr>'
			. '</table></td></tr></table></body></html>';
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

		if ( ! empty( $payload['image'] ) ) {
			$lines[] = '';
			$lines[] = __( '— DOOR PREVIEW —', 'hd-door-designer' );
			$lines[] = __( "What the customer designed is attached as a PNG.", 'hd-door-designer' );
			$lines[] = __( 'Full image: ', 'hd-door-designer' ) . $payload['image'];
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
