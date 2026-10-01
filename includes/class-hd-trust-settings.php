<?php
/**
 * Review-step social proof: the Checkatrade rating line and real customer quotes shown
 * above "Save my design & get my price". Owns its four settings (stored in the shared
 * hd_dd_settings option), their sanitising, and the shape handed to the browser.
 * Nothing here is invented: with no quotes entered, no quote is shown.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Trust_Settings {

	const QUOTE_MAX = 6;

	/** @return array Setting key => default. */
	public static function defaults() {
		return array(
			'proof_rating' => '4.9',
			'proof_count'  => '321',
			'proof_url'    => '',
			'proof_quotes' => '',
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
				$n           = str_replace( ',', '.', trim( $raw ) );
				$out[ $key ] = ( is_numeric( $n ) && (float) $n > 0 && (float) $n <= 5 ) ? number_format( (float) $n, 1, '.', '' ) : '';
			} elseif ( 'proof_count' === $key ) {
				$n           = (int) preg_replace( '/\D+/', '', $raw );
				$out[ $key ] = $n > 0 ? (string) $n : '';
			} elseif ( 'proof_url' === $key ) {
				$url         = esc_url_raw( trim( $raw ) );
				$out[ $key ] = preg_match( '#^https?://#i', $url ) ? $url : '';
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
			$quote = preg_replace( '/^[\s"\'“”‘’]+|[\s"\'“”‘’]+$/u', '', $quote );
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
		<p class="description"><?php esc_html_e( 'Shown above the "Save my design & get my price" button. Only use your real rating and real customer words.', 'hd-door-designer' ); ?></p>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><label for="hd_proof_rating"><?php esc_html_e( 'Checkatrade rating', 'hd-door-designer' ); ?></label></th>
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
		</table>
		<?php
	}
}
