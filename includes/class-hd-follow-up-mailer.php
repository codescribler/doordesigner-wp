<?php
/**
 * The three follow-up emails to someone who saved a design and has not asked for a price.
 * Written as short personal notes from Daniel; each shows their door, the "Get my exact
 * price" button and the reply-with-name-and-postcode route, and ends with a one-click way
 * to stop. The customer-copy rule in tests/js/copy-rule.test.js applies here too.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Follow_Up_Mailer {

	const FROM_NAME = 'Daniel at Hertfordshire Doors';

	/**
	 * Send email $step (1–3) for a saved design.
	 *
	 * @param int    $step  1, 2 or 3.
	 * @param object $row   The enquiries-table row (customer_email, design_name, design, payload).
	 * @param array  $links { open, price, stop } URLs.
	 * @return bool wp_mail result.
	 */
	public static function send( $step, $row, array $links ) {
		$to = sanitize_email( (string) $row->customer_email );
		if ( ! is_email( $to ) ) {
			return false;
		}
		$mail    = self::build( $step, $row, $links );
		$host    = preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		$headers = array(
			'Content-Type: text/html; charset=UTF-8',
			'From: ' . self::FROM_NAME . ( $host ? ' <noreply@' . $host . '>' : '' ),
			'List-Unsubscribe: <' . esc_url_raw( $links['stop'] ) . '>',
			'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
		);
		$reply = self::reply_to();
		if ( $reply ) {
			$headers[] = 'Reply-To: ' . self::FROM_NAME . ' <' . $reply . '>';
		}
		return wp_mail( $to, $mail['subject'], $mail['html'], $headers );
	}

	/** First address in the enquiry-notification setting: where replies are read. */
	public static function reply_to() {
		$list  = trim( (string) HD_DD_Plugin::settings()['recipient_email'] );
		$first = '' !== $list ? sanitize_email( trim( preg_split( '/[\s,]+/', $list )[0] ) ) : '';
		return is_email( $first ) ? $first : '';
	}

	/** @return array{subject:string, html:string} */
	public static function build( $step, $row, array $links ) {
		$payload = json_decode( (string) ( isset( $row->payload ) ? $row->payload : '' ), true );
		$payload = is_array( $payload ) ? $payload : array();
		$design  = json_decode( (string) ( isset( $row->design ) ? $row->design : '' ), true );
		$design  = is_array( $design ) ? $design : ( isset( $payload['design'] ) && is_array( $payload['design'] ) ? $payload['design'] : array() );

		$reply = esc_html__( 'Or, if you’re happy with it, just reply to this email with your name and postcode and I’ll send your exact fitted price within one working day.', 'hd-door-designer' );
		switch ( (int) $step ) {
			case 1:
				$colour  = isset( $design['Door Colour (External)']['label'] ) ? trim( (string) $design['Door Colour (External)']['label'] ) : '';
				$subject = __( 'Your door design, in daylight', 'hd-door-designer' );
				$body    = self::p( __( 'Colours on a screen never look quite the same outside. A quick tip: stand across the road from your front door and picture it in', 'hd-door-designer' ) . ' ' . ( '' !== $colour ? $colour : __( 'your colour', 'hd-door-designer' ) ) . ' ' . __( 'against your brickwork and window frames. Most people find it settles things one way or the other.', 'hd-door-designer' ) )
					. self::p( __( 'If you’d like to try a different colour or handle, your design is saved and you can change anything.', 'hd-door-designer' ) )
					. '<p style="margin:0 0 14px;">' . $reply . '</p>';
				break;
			case 2:
				$subject = __( 'What’s in your fitted price', 'hd-door-designer' );
				$price   = HD_DD_Trust_Settings::guide_price();
				$body    = self::p( __( 'A few quick answers to the questions people often don’t like to ask:', 'hd-door-designer' ) )
					. '<ul style="margin:0 0 14px;padding-left:20px;">'
					. self::li( __( 'I don’t know my door size.', 'hd-door-designer' ), __( 'You don’t need to. We come and measure before anything is made.', 'hd-door-designer' ) )
					. self::li( __( 'What does the price include?', 'hd-door-designer' ), __( 'Your door, fully fitted. For a small extra cost we can also take your old door away.', 'hd-door-designer' ) )
					. self::li( __( 'Is asking for a price a commitment?', 'hd-door-designer' ), __( 'No. It’s free, with no obligation.', 'hd-door-designer' ) )
					. ( '' !== $price ? self::li( __( 'Roughly what will it cost?', 'hd-door-designer' ), $price . ' ' . __( 'Your exact price depends on your size and the options you chose.', 'hd-door-designer' ) ) : '' )
					. '</ul>'
					. self::p( __( 'When you are ready, tap the button below, or reply with your name and postcode, and I’ll send your exact price within one working day.', 'hd-door-designer' ) );
				break;
			default:
				$subject = __( 'Still thinking about your door?', 'hd-door-designer' );
				$s       = HD_DD_Plugin::settings();
				$rating  = ( '' !== (string) $s['proof_rating'] && '' !== (string) $s['proof_count'] )
					/* translators: 1: rating out of 10, 2: number of reviews */
					? self::p( sprintf( __( 'If it helps, we’re rated %1$s/10 on Checkatrade from %2$s reviews.', 'hd-door-designer' ), $s['proof_rating'], $s['proof_count'] ) ) : '';
				$body    = self::p( __( 'No rush at all. Your design stays saved, and the link below will always open it.', 'hd-door-designer' ) )
					. $rating
					. self::p( __( 'And if something’s holding you back, just reply with one word (price, colour, timing or just looking) and I’ll help with whichever it is.', 'hd-door-designer' ) )
					. self::p( __( 'This is the last email I’ll send about this design.', 'hd-door-designer' ) );
		}
		return array( 'subject' => $subject, 'html' => self::wrap( $body, $row, $payload, $links ) );
	}

	private static function p( $text ) {
		return '<p style="margin:0 0 14px;">' . esc_html( $text ) . '</p>';
	}

	private static function li( $q, $a ) {
		return '<li style="margin:0 0 8px;"><strong>' . esc_html( $q ) . '</strong> ' . esc_html( $a ) . '</li>';
	}

	private static function button( $url, $label, $dark ) {
		return '<a href="' . esc_url( $url ) . '" style="display:inline-block;margin:0 8px 8px 0;background:' . ( $dark ? '#1d4f3f' : '#ffffff' ) . ';color:' . ( $dark ? '#ffffff' : '#161616' ) . ';border:1px solid ' . ( $dark ? '#1d4f3f' : '#161616' ) . ';text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:6px;">' . esc_html( $label ) . '</a>';
	}

	private static function wrap( $body, $row, array $payload, array $links ) {
		$image = ! empty( $payload['image'] ) ? esc_url( $payload['image'] ) : '';
		$name  = trim( (string) ( isset( $row->design_name ) ? $row->design_name : '' ) );
		$door  = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;"><tr>'
			. ( $image ? '<td valign="top" style="padding:0 16px 0 0;"><a href="' . esc_url( $links['open'] ) . '"><img src="' . $image . '" alt="' . esc_attr__( 'Your door design', 'hd-door-designer' ) . '" width="120" style="display:block;width:120px;height:auto;border:1px solid #e6e6e6;border-radius:6px;background:#f3f3f1;" /></a></td>' : '' )
			. '<td valign="middle" style="font-size:14px;font-weight:700;color:#161616;">' . esc_html( '' !== $name ? $name : __( 'Your door design', 'hd-door-designer' ) ) . '</td>'
			. '</tr></table>';
		return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;"><tr><td align="center">'
			. '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6e6e6;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#262a30;">'
			. '<tr><td style="padding:28px 28px 8px;">'
			. self::p( __( 'Hello,', 'hd-door-designer' ) )
			. $body
			. $door
			. self::button( $links['price'], __( 'Get my exact price', 'hd-door-designer' ), true )
			. self::button( $links['open'], __( 'Open my design', 'hd-door-designer' ), false )
			. '<p style="margin:18px 0 0;">Daniel<br>Hertfordshire Doors</p>'
			. '</td></tr>'
			. '<tr><td style="padding:16px 28px 24px;font-size:12px;line-height:1.5;color:#8a8e96;">'
			. esc_html__( 'You’re getting this because you saved a door design on our website.', 'hd-door-designer' ) . ' '
			. '<a href="' . esc_url( $links['stop'] ) . '" style="color:#8a8e96;">' . esc_html__( 'No more emails about this design', 'hd-door-designer' ) . '</a>'
			. '</td></tr>'
			. '</table></td></tr></table></body></html>';
	}
}
