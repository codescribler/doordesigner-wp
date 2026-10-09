<?php
/**
 * Review-step social proof: the Checkatrade rating line and real customer quotes shown
 * above "Save my design & get my price". Owns the Review-step settings (stored in the shared
 * hd_dd_settings option), their sanitising, and the shape handed to the browser.
 * Nothing here is invented: with no quotes entered, no quote is shown.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Trust_Settings {

	const QUOTE_MAX = 6;

	const GUIDE_PRICE = 'Fitted doors typically cost £1,500 to £4,000. Most of our customers pay around £2,000.';

	/** @return array Setting key => default. */
	public static function defaults() {
		return array(
			'proof_rating' => '10',
			'proof_count'  => '79',
			'proof_url'    => '',
			'proof_quotes' => '',
			'guide_price'  => self::GUIDE_PRICE,
		);
	}

	/**
	 * Clean the four settings from a submitted form. A key missing from $input keeps its
	 * current value; a key present but invalid becomes '' (which hides that element).
	 *
	 * @param array $input   Raw submitted settings.
	 * @param array $current Current settings.
	 * @return array The four trust keys.
	 */
	public static function sanitize( array $input, array $current ) {
		$out = array();
		foreach ( self::defaults() as $key => $default ) {
			if ( ! array_key_exists( $key, $input ) ) {
				$out[ $key ] = isset( $current[ $key ] ) ? (string) $current[ $key ] : $default;
				continue;
			}
			$raw = (string) $input[ $key ];
			if ( 'proof_rating' === $key ) {
				$n = str_replace( ',', '.', trim( $raw ) );
				$v = '';
				if ( is_numeric( $n ) && (float) $n > 0 && (float) $n <= 10 ) {
					$cut = floor( round( (float) $n * 100, 6 ) ) / 100; // Truncate to 2dp (round() only tames float noise).
					if ( $cut > 0 ) {
						$v = rtrim( rtrim( number_format( $cut, 2, '.', '' ), '0' ), '.' );
					}
				}
				$out[ $key ] = $v;
			} elseif ( 'proof_count' === $key ) {
				$n           = (int) preg_replace( '/\D+/', '', $raw );
				$out[ $key ] = $n > 0 ? (string) $n : '';
			} elseif ( 'proof_url' === $key ) {
				$url         = esc_url_raw( trim( $raw ) );
				$out[ $key ] = preg_match( '#^https?://#i', $url ) ? $url : '';
			} elseif ( 'guide_price' === $key ) {
				$v           = sanitize_text_field( $raw );
				$out[ $key ] = function_exists( 'mb_substr' ) ? mb_substr( $v, 0, 200 ) : substr( $v, 0, 200 );
			} else {
				$lines = array();
				foreach ( preg_split( '/\r\n|\r|\n/', $raw ) as $line ) {
					$line = sanitize_text_field( $line );
					if ( '' !== $line ) {
						$lines[] = $line;
					}
				}
				$out[ $key ] = implode( "\n", $lines );
			}
		}
		return $out;
	}

	/**
	 * "Quote text | Name, Town" lines → quotes. The LAST bar separates the attribution, so
	 * a bar inside the quote survives. Lines without a bar have no attribution.
	 *
	 * @param string $text The proof_quotes setting.
	 * @return array[] Each array( 'text' => string, 'by' => string ).
	 */
	public static function parse_quotes( $text ) {
		$quotes = array();
		foreach ( preg_split( '/\r\n|\r|\n/', (string) $text ) as $line ) {
			$line = trim( $line );
			if ( '' === $line ) {
				continue;
			}
			$pos   = strrpos( $line, '|' );
			$quote = false === $pos ? $line : substr( $line, 0, $pos );
			$by    = false === $pos ? '' : substr( $line, $pos + 1 );
			$quote = (string) preg_replace( '/^[\s"\'“”‘’]+|[\s"\'“”‘’]+$/u', '', $quote );
			if ( '' === $quote ) {
				continue;
			}
			$quotes[] = array(
				'text' => $quote,
				'by'   => trim( $by ),
			);
			if ( count( $quotes ) >= self::QUOTE_MAX ) {
				break;
			}
		}
		return $quotes;
	}

	/** The guide price sentence shown on Review and in the customer emails ('' = hidden). */
	public static function guide_price() {
		$s = HD_DD_Plugin::settings();
		return isset( $s['guide_price'] ) ? (string) $s['guide_price'] : self::GUIDE_PRICE;
	}

	/** The `trust` object for HD_DD_CONFIG (read by assets/js/trust.js). */
	public static function front_config() {
		$s      = HD_DD_Plugin::settings();
		$rating = (string) $s['proof_rating'];
		$count  = (string) $s['proof_count'];
		$show   = '' !== $rating && '' !== $count;
		return array(
			'rating' => $show ? $rating : '',
			'count'  => $show ? number_format( (int) $count ) : '',
			'url'    => esc_url_raw( (string) $s['proof_url'] ),
			'quotes' => self::parse_quotes( (string) $s['proof_quotes'] ),
			'guidePrice' => self::guide_price(),
		);
	}

	/**
	 * The "Review step" block on the settings screen.
	 *
	 * @param array  $s      Current settings.
	 * @param string $option Option name the fields post into.
	 */
	public static function render_fields( array $s, $option ) {
		?>
		<h2><?php esc_html_e( 'Review step', 'hd-door-designer' ); ?></h2>
		<p class="description"><?php esc_html_e( 'Shown on the Review step of the new designer. Only use your real rating and real customer words.', 'hd-door-designer' ); ?></p>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><label for="hd_proof_rating"><?php esc_html_e( 'Checkatrade rating (out of 10)', 'hd-door-designer' ); ?></label></th>
				<td>
					<input name="<?php echo esc_attr( $option ); ?>[proof_rating]" id="hd_proof_rating" type="text" class="small-text" value="<?php echo esc_attr( $s['proof_rating'] ); ?>" />
					<?php esc_html_e( 'from', 'hd-door-designer' ); ?>
					<input name="<?php echo esc_attr( $option ); ?>[proof_count]" id="hd_proof_count" type="text" class="small-text" value="<?php echo esc_attr( $s['proof_count'] ); ?>" aria-label="<?php esc_attr_e( 'Number of reviews', 'hd-door-designer' ); ?>" />
					<?php esc_html_e( 'reviews', 'hd-door-designer' ); ?>
					<p class="description"><?php esc_html_e( 'Leave either box empty to hide the rating line.', 'hd-door-designer' ); ?></p>
				</td>
			</tr>
			<tr>
				<th scope="row"><label for="hd_proof_url"><?php esc_html_e( 'Checkatrade profile link', 'hd-door-designer' ); ?></label></th>
				<td><input name="<?php echo esc_attr( $option ); ?>[proof_url]" id="hd_proof_url" type="url" class="regular-text" value="<?php echo esc_attr( $s['proof_url'] ); ?>" /></td>
			</tr>
			<tr>
				<th scope="row"><label for="hd_proof_quotes"><?php esc_html_e( 'Customer quotes', 'hd-door-designer' ); ?></label></th>
				<td>
					<textarea name="<?php echo esc_attr( $option ); ?>[proof_quotes]" id="hd_proof_quotes" class="large-text" rows="5"><?php echo esc_textarea( $s['proof_quotes'] ); ?></textarea>
					<p class="description"><?php esc_html_e( 'One per line: Quote text | Name, Town. Up to six; one is shown at random. Leave empty to show none.', 'hd-door-designer' ); ?></p>
				</td>
			</tr>
			<tr>
				<th scope="row"><label for="hd_guide_price"><?php esc_html_e( 'Guide price', 'hd-door-designer' ); ?></label></th>
				<td>
					<input name="<?php echo esc_attr( $option ); ?>[guide_price]" id="hd_guide_price" type="text" class="large-text" value="<?php echo esc_attr( $s['guide_price'] ); ?>" />
					<p class="description"><?php esc_html_e( 'Shown above the email box and in the email we send. Leave empty to show no price.', 'hd-door-designer' ); ?></p>
				</td>
			</tr>
		</table>
		<?php
	}
}
