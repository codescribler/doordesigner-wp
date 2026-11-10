<?php
/**
 * Designer 4 emails. The visitor gets one kind: the link email (their door and a way back to
 * their designs). The business gets a short plain-text note for a new lead or another door.
 * Sending an email address beside the finished door is the price request, so no email asks
 * the visitor to request a price.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4_Mailer {

	/** The link email to the visitor. $designs_url is the "My designs" link ('' = no button). */
	public static function send_link( array $payload, $designs_url ) {
		$to = isset( $payload['customer']['email'] ) ? sanitize_email( $payload['customer']['email'] ) : '';
		if ( ! is_email( $to ) ) {
			return false;
		}
		$name = isset( $payload['designName'] ) ? (string) $payload['designName'] : '';
		/* translators: %s: design name */
		$subject = '' !== $name ? sprintf( __( 'Your door design: %s', 'hd-door-designer' ), $name ) : __( 'Your door design', 'hd-door-designer' );
		return wp_mail( $to, $subject, self::link_html( $payload, (string) $designs_url, $name ), self::customer_headers() );
	}

	/** Tell the business a new Designer 4 lead arrived. */
	public static function send_owner_lead( array $payload, $recipient, array $attachments = array() ) {
		/* translators: 1: reference, 2: the visitor's email address */
		$subject = sprintf( __( 'New Designer 4 lead %1$s — %2$s', 'hd-door-designer' ), self::ref_of( $payload ), self::email_of( $payload ) );
		$intro   = array(
			__( 'Someone finished a door in Designer 4 and sent their email address. That is their request for a price, so the lead is also on its way to the manager.', 'hd-door-designer' ),
			__( 'They have been emailed a link to their designs and told the price follows within 1 working day.', 'hd-door-designer' ),
		);
		return self::send_owner( $subject, $intro, $payload, $recipient, $attachments );
	}

	/** Tell the business a known visitor added another door. */
	public static function send_owner_door_added( array $payload, $recipient, array $attachments = array() ) {
		/* translators: 1: reference, 2: the visitor's email address */
		$subject = sprintf( __( 'Designer 4: another door %1$s — %2$s', 'hd-door-designer' ), self::ref_of( $payload ), self::email_of( $payload ) );
		$intro   = array( __( 'Someone who already has Designer 4 doors added another one.', 'hd-door-designer' ) );
		return self::send_owner( $subject, $intro, $payload, $recipient, $attachments );
	}

	private static function email_of( array $payload ) {
		return isset( $payload['customer']['email'] ) ? (string) $payload['customer']['email'] : '';
	}

	private static function ref_of( array $payload ) {
		return isset( $payload['reference'] ) ? (string) $payload['reference'] : '';
	}

	private static function send_owner( $subject, array $intro, array $payload, $recipient, array $attachments ) {
		$email   = self::email_of( $payload );
		$lines   = $intro;
		$lines[] = '';
		$lines[] = __( 'REFERENCE: ', 'hd-door-designer' ) . self::ref_of( $payload );
		$lines[] = __( 'DESIGN:    ', 'hd-door-designer' ) . ( isset( $payload['designName'] ) ? $payload['designName'] : '' );
		$lines[] = __( 'EMAIL:     ', 'hd-door-designer' ) . $email;
		$lines[] = '';
		foreach ( ( isset( $payload['design'] ) && is_array( $payload['design'] ) ) ? $payload['design'] : array() as $heading => $choice ) {
			$lines[] = sprintf( '%-26s %s', $heading . ':', ( is_array( $choice ) && isset( $choice['label'] ) ) ? $choice['label'] : '' );
		}
		if ( ! empty( $payload['image'] ) ) {
			$lines[] = '';
			$lines[] = __( 'Picture: ', 'hd-door-designer' ) . $payload['image'];
		}
		$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
		if ( is_email( $email ) ) {
			$headers[] = 'Reply-To: ' . sanitize_email( $email );
		}
		return wp_mail( $recipient, $subject, implode( "\n", $lines ), $headers, $attachments );
	}

	/** HTML mail with the same From and Reply-To rule as the saver's email. */
	private static function customer_headers() {
		$host     = preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		$headers  = array( 'Content-Type: text/html; charset=UTF-8', 'From: ' . ( $host ? 'Hertfordshire Doors <noreply@' . $host . '>' : 'Hertfordshire Doors' ) );
		$settings = HD_DD_Plugin::settings();
		if ( ! empty( $settings['recipient_email'] ) ) {
			$first = sanitize_email( trim( preg_split( '/[\s,]+/', trim( $settings['recipient_email'] ) )[0] ) );
			if ( $first ) {
				$headers[] = 'Reply-To: ' . $first;
			}
		}
		return $headers;
	}

	private static function rows( array $payload ) {
		$rows = '';
		foreach ( ( isset( $payload['design'] ) && is_array( $payload['design'] ) ) ? $payload['design'] : array() as $heading => $choice ) {
			$label = ( is_array( $choice ) && isset( $choice['label'] ) ) ? trim( (string) $choice['label'] ) : '';
			if ( '' === $label ) {
				continue;
			}
			$rows .= '<tr><td style="padding:2px 12px 2px 0;color:#8a8e96;font-size:13px;vertical-align:top;">' . esc_html( $heading ) . '</td>'
				. '<td style="padding:2px 0;color:#161616;font-size:13px;font-weight:600;vertical-align:top;">' . esc_html( $label ) . '</td></tr>';
		}
		return $rows;
	}

	private static function button( $url ) {
		return '<a href="' . esc_url( $url ) . '" style="display:inline-block;background:#1d4f3f;color:#ffffff;border:1px solid #1d4f3f;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:6px;">' . esc_html__( 'Open my designs', 'hd-door-designer' ) . '</a>';
	}

	private static function link_html( array $payload, $designs_url, $name ) {
		$image = isset( $payload['image'] ) ? esc_url( $payload['image'] ) : '';
		$price = HD_DD_Trust_Settings::guide_price();
		$p     = 'margin:0;font-size:14px;line-height:1.5;color:#5a5f68;';
		return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;"><tr><td align="center">'
			. '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6e6e6;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">'
			. '<tr><td style="padding:28px 28px 6px;"><h1 style="margin:0 0 10px;font-size:20px;color:#161616;">' . esc_html__( 'Here is the door you designed', 'hd-door-designer' ) . '</h1>'
			. '<p style="' . $p . '">' . esc_html__( "Your price is on its way. We'll email it within 1 working day.", 'hd-door-designer' ) . '</p></td></tr>'
			. '<tr><td style="padding:18px 28px 0;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>'
			. ( $image ? '<td valign="top" width="160" style="width:160px;padding:0 18px 0 0;"><img src="' . $image . '" alt="' . esc_attr__( 'Your door design', 'hd-door-designer' ) . '" width="160" style="display:block;width:160px;height:auto;border:1px solid #e6e6e6;border-radius:6px;background:#f3f3f1;" /></td>' : '' )
			. '<td valign="top"><div style="font-size:13px;font-weight:700;color:#161616;margin-bottom:6px;">' . esc_html( '' !== $name ? $name : __( 'Your design', 'hd-door-designer' ) ) . '</div>'
			. '<table role="presentation" cellpadding="0" cellspacing="0">' . self::rows( $payload ) . '</table></td>'
			. '</tr></table></td></tr>'
			. ( '' !== $designs_url ? '<tr><td style="padding:20px 28px 0;">' . self::button( $designs_url ) . '</td></tr>'
				. '<tr><td style="padding:12px 28px 0;"><p style="' . $p . '">' . esc_html__( 'Answer two quick questions on that page for a closer estimate.', 'hd-door-designer' ) . '</p></td></tr>' : '' )
			. ( '' !== $price ? '<tr><td style="padding:20px 28px 0;"><p style="margin:0;padding:12px 14px;background:#f3f3f1;border:1px solid #e6e6e6;border-radius:6px;font-size:13px;line-height:1.5;color:#161616;">' . esc_html( $price ) . '</p></td></tr>' : '' )
			. '<tr><td style="padding:18px 28px 28px;"><p style="margin:0;font-size:13px;color:#8a8e96;">Hertfordshire Doors</p></td></tr>'
			. '</table></td></tr></table></body></html>';
	}
}
