<?php
/**
 * Registers the [hd_door_designer] shortcode. The configurator is a JS app that
 * mounts into this container; the heavy lifting happens client-side against the
 * catalogue served over REST.
 *
 * Attributes:
 *   door_type="Single Door"   Pre-seed the starting door type (also accepts ?door_type= in the URL).
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Shortcode {

	const TAG = 'hd_door_designer';

	/** @var HD_DD_Assets */
	private $assets;

	public function __construct( HD_DD_Assets $assets ) {
		$this->assets = $assets;
	}

	public function register() {
		add_shortcode( self::TAG, array( $this, 'render' ) );
	}

	/**
	 * @param array $atts
	 * @return string
	 */
	public function render( $atts ) {
		$atts = shortcode_atts(
			array(
				'door_type' => '',
			),
			$atts,
			self::TAG
		);

		// Deep-link wins over the attribute default if present.
		$door_type = $atts['door_type'];
		if ( isset( $_GET['door_type'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only pre-seed, no state change.
			$door_type = sanitize_text_field( wp_unslash( $_GET['door_type'] ) );
		}

		// Safety net: ensure assets are loaded even when rendered outside the_content.
		$this->assets->enqueue();

		$mount_id = 'hd-dd-app';

		ob_start();
		?>
		<div class="hd-dd"
			id="<?php echo esc_attr( $mount_id ); ?>"
			data-hd-door-designer
			data-door-type="<?php echo esc_attr( $door_type ); ?>">
			<noscript>
				<p><?php esc_html_e( 'The door designer needs JavaScript enabled. Please contact us and we will be glad to help you design your door.', 'hd-door-designer' ); ?></p>
			</noscript>
			<div class="hd-dd__loading" role="status" aria-live="polite">
				<?php esc_html_e( 'Loading the door designer…', 'hd-door-designer' ); ?>
			</div>
		</div>
		<?php
		return ob_get_clean();
	}
}
