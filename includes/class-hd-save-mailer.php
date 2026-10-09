<?php
/**
 * Emails for an email-only save: the saver's copy of their design (with the way back and
 * the way to ask for a price), and a short note to the business. A save is not an enquiry,
 * so the owner note never uses the enquiry subject line.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Save_Mailer {

	/**
	 * @param array  $payload    Save payload (reference, designName, customer.email, design, image).
	 * @param string $reload_url The "open my design" link ('' = no buttons).
	 * @return bool wp_mail result.
	 */
	public static function send_saver( array $payload, $reload_url ) {
		$to = isset( $payload['customer']['email'] ) ? sanitize_email( $payload['customer']['email'] ) : '';
		if ( ! is_email( $to ) ) {
			return false;
		}
		$name = isset( $payload['designName'] ) ? (string) $payload['designName'] : '';
		/* translators: %s: design name */
		$subject = '' !== $name ? sprintf( __( 'Your door design: %s', 'hd-door-designer' ), $name ) : __( 'Your door design', 'hd-door-designer' );

		$host     = preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		$headers  = array( 'Content-Type: text/html; charset=UTF-8', 'From: ' . ( $host ? 'Hertfordshire Doors <noreply@' . $host . '>' : 'Hertfordshire Doors' ) );
		$settings = HD_DD_Plugin::settings();
		if ( ! empty( $settings['recipient_email'] ) ) {
			$first = sanitize_email( trim( preg_split( '/[\s,]+/', trim( $settings['recipient_email'] ) )[0] ) );
			if ( $first ) {
				$headers[] = 'Reply-To: ' . $first;
			}
		}
		return wp_mail( $to, $subject, self::saver_html( $payload, (string) $reload_url, $name ), $headers );
	}

	private static function button( $url, $label, $dark ) {
		return '<a href="' . esc_url( $url ) . '" style="display:inline-block;margin:0 8px 8px 0;background:' . ( $dark ? '#1d4f3f' : '#ffffff' ) . ';color:' . ( $dark ? '#ffffff' : '#161616' ) . ';border:1px solid ' . ( $dark ? '#1d4f3f' : '#161616' ) . ';text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:6px;">' . esc_html( $label ) . '</a>';
	}

	private static function saver_html( array $payload, $reload_url, $name ) {
		$image = isset( $payload['image'] ) ? esc_url( $payload['image'] ) : '';
		$rows  = '';
		foreach ( ( isset( $payload['design'] ) && is_array( $payload['design'] ) ) ? $payload['design'] : array() as $heading => $choice ) {
			$label = ( is_array( $choice ) && isset( $choice['label'] ) ) ? trim( (string) $choice['label'] ) : '';
			if ( '' === $label ) {
				continue;
			}
			$rows .= '<tr><td style="padding:2px 12px 2px 0;color:#8a8e96;font-size:13px;vertical-align:top;">' . esc_html( $heading ) . '</td>'
				. '<td style="padding:2px 0;color:#161616;font-size:13px;font-weight:600;vertical-align:top;">' . esc_html( $label ) . '</td></tr>';
		}
		$price   = HD_DD_Trust_Settings::guide_price();
		$buttons = '';
		if ( '' !== $reload_url ) {
			$buttons = '<tr><td style="padding:20px 28px 0;">'
				. self::button( add_query_arg( 'price', '1', $reload_url ), __( 'Get my exact price', 'hd-door-designer' ), true )
				. self::button( $reload_url, __( 'Open my design', 'hd-door-designer' ), false )
				. '</td></tr>';
		}
		return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;"><tr><td align="center">'
			. '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6e6e6;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">'
			. '<tr><td style="padding:28px 28px 6px;">'
			. '<h1 style="margin:0 0 10px;font-size:20px;color:#161616;">' . esc_html__( 'Here is the door you designed', 'hd-door-designer' ) . '</h1>'
			. '<p style="margin:0;font-size:14px;line-height:1.5;color:#5a5f68;">' . esc_html__( 'It is saved. Come back to it any time, change anything you like, and ask us for an exact fitted price when you are ready.', 'hd-door-designer' ) . '</p>'
			. '</td></tr>'
			. '<tr><td style="padding:18px 28px 0;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>'
			. ( $image ? '<td valign="top" width="160" style="width:160px;padding:0 18px 0 0;"><img src="' . $image . '" alt="' . esc_attr__( 'Your door design', 'hd-door-designer' ) . '" width="160" style="display:block;width:160px;height:auto;border:1px solid #e6e6e6;border-radius:6px;background:#f3f3f1;" /></td>' : '' )
			. '<td valign="top"><div style="font-size:13px;font-weight:700;color:#161616;margin-bottom:6px;">' . esc_html( '' !== $name ? $name : __( 'Your design', 'hd-door-designer' ) ) . '</div>'
			. '<table role="presentation" cellpadding="0" cellspacing="0">' . $rows . '</table></td>'
			. '</tr></table></td></tr>'
			. ( '' !== $price ? '<tr><td style="padding:20px 28px 0;"><p style="margin:0;padding:12px 14px;background:#f3f3f1;border:1px solid #e6e6e6;border-radius:6px;font-size:13px;line-height:1.5;color:#161616;">' . esc_html( $price ) . '</p></td></tr>' : '' )
			. $buttons
			. '<tr><td style="padding:18px 28px 28px;"><p style="margin:0;font-size:13px;color:#8a8e96;">Hertfordshire Doors</p></td></tr>'
			. '</table></td></tr></table></body></html>';
	}

	/**
	 * Tell the business a design was saved by email with no price requested yet.
	 *
	 * @return bool wp_mail result.
	 */
	public static function send_owner_saved( array $payload, $recipient, array $attachments = array() ) {
		$email = isset( $payload['customer']['email'] ) ? (string) $payload['customer']['email'] : '';
		/* translators: %s: the saver's email address */
		$subject = sprintf( __( 'New saved design — %s', 'hd-door-designer' ), $email );
		if ( ! empty( $payload['flags'] ) ) {
			$subject = __( '[Possible bot] ', 'hd-door-designer' ) . $subject;
		}
		$lines   = array();
		$lines[] = __( 'Someone saved a door design from the website designer and has not asked for a price yet, so only their email address is known.', 'hd-door-designer' );
		$lines[] = __( 'If they ask for a price you will get the usual "New door enquiry" email for the same reference.', 'hd-door-designer' );
		$lines[] = '';
		$lines[] = __( 'REFERENCE: ', 'hd-door-designer' ) . ( isset( $payload['reference'] ) ? $payload['reference'] : '' );
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
}
