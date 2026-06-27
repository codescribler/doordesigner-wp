<?php
/**
 * Scoped asset loading. CSS/JS only load on pages that actually contain the
 * shortcode (or that opt in via the [data-hd-designer] launch hook), never
 * site-wide. All front-end config is handed to JS via a single localized object.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Assets {

	const HANDLE = 'hd-door-designer';

	/** @var HD_DD_Catalogue */
	private $catalogue;

	/** @var bool Guard so we only enqueue once per request. */
	private $enqueued = false;

	public function __construct( HD_DD_Catalogue $catalogue ) {
		$this->catalogue = $catalogue;
	}

	public function register() {
		add_action( 'wp_enqueue_scripts', array( $this, 'maybe_enqueue' ) );
	}

	/** Auto-detect the shortcode on the current singular view and enqueue if present. */
	public function maybe_enqueue() {
		if ( ! is_singular() ) {
			return;
		}
		$post = get_post();
		if ( $post && has_shortcode( $post->post_content, HD_DD_Shortcode::TAG ) ) {
			$this->enqueue();
		}
	}

	/** Register + enqueue the scoped assets. Idempotent. */
	public function enqueue() {
		if ( $this->enqueued ) {
			return;
		}
		$this->enqueued = true;

		$ver_css = $this->asset_version( 'assets/css/hd-door-designer.css' );
		$ver_js  = $this->asset_version( 'assets/js/hd-door-designer.js' );

		wp_register_style( self::HANDLE, HD_DD_URL . 'assets/css/hd-door-designer.css', array(), $ver_css );

		// Shared layer assembler (UMD) → canvas compositor.
		wp_register_script( self::HANDLE . '-rendermodel', HD_DD_URL . 'assets/js/render-model.js', array(), $ver_js, true );
		wp_register_script( self::HANDLE . '-preview', HD_DD_URL . 'assets/js/preview.js', array( self::HANDLE . '-rendermodel' ), $ver_js, true );

		// Guided wizard modules. Only the controller has an inter-dep (it needs the
		// step config); the renderer + review are standalone UMD modules.
		wp_register_script( self::HANDLE . '-stepcfg', HD_DD_URL . 'assets/js/wizard/step-config.js', array(), $ver_js, true );
		wp_register_script( self::HANDLE . '-wizard', HD_DD_URL . 'assets/js/wizard/wizard-controller.js', array( self::HANDLE . '-stepcfg' ), $ver_js, true );
		wp_register_script( self::HANDLE . '-steprender', HD_DD_URL . 'assets/js/wizard/step-renderer.js', array(), $ver_js, true );
		wp_register_script( self::HANDLE . '-review', HD_DD_URL . 'assets/js/wizard/review.js', array(), $ver_js, true );

		// App bootstrap depends on the compositor + every wizard module.
		wp_register_script(
			self::HANDLE,
			HD_DD_URL . 'assets/js/hd-door-designer.js',
			array(
				self::HANDLE . '-preview',
				self::HANDLE . '-wizard',
				self::HANDLE . '-steprender',
				self::HANDLE . '-review',
			),
			$ver_js,
			true
		);

		wp_enqueue_style( self::HANDLE );
		wp_enqueue_script( self::HANDLE );

		wp_localize_script(
			self::HANDLE,
			'HD_DD_CONFIG',
			array(
				'restUrl'        => esc_url_raw( rest_url( HD_DD_REST_NS . '/' ) ),
				// Cache-bust the data fetches with the plugin version: the REST responses set a
				// 1-hour Cache-Control, so without this the browser keeps serving the OLD
				// catalogue/render-model for up to an hour after a plugin update.
				'catalogueUrl'   => esc_url_raw( add_query_arg( 'v', HD_DD_VERSION, rest_url( HD_DD_REST_NS . '/catalogue' ) ) ),
				'renderModelUrl' => esc_url_raw( add_query_arg( 'v', HD_DD_VERSION, rest_url( HD_DD_REST_NS . '/render-model' ) ) ),
				'categoriesUrl'  => esc_url_raw( HD_DD_URL . 'data/style-categories.json' ),
				'nonce'          => wp_create_nonce( 'wp_rest' ),
				'catalogueReady' => $this->catalogue->is_available(),
				'renderReady'    => $this->catalogue->render_model_available(),
				// Asset base for preview images: a setting override, else the model's own
				// captured origin (Endurance host). Empty during dev = use model._assetBase.
				'assetBase'      => $this->get_asset_base(),
				// Hero image for the opening screen (before a door type is chosen). Override
				// with the `hd_dd_hero_image` filter or set it empty to show nothing.
				'heroImage'      => esc_url_raw( apply_filters( 'hd_dd_hero_image', 'https://hertfordshiredoors.co.uk/wp-content/uploads/2024/02/AVANTAL.jpg' ) ),
				'i18n'           => $this->i18n_strings(),
			)
		);
	}

	/** File-mtime-based cache busting; falls back to plugin version. */
	private function asset_version( $relative ) {
		$path = HD_DD_DIR . $relative;
		return is_readable( $path ) ? (string) filemtime( $path ) : HD_DD_VERSION;
	}

	/** Get the asset base URL: setting override (e.g. a CDN), else the on-demand image
	 *  cache endpoint, which serves images from this site (fetched + cached from upstream). */
	private function get_asset_base() {
		$setting = HD_DD_Plugin::settings()['asset_base'];
		if ( $setting ) {
			return $setting;
		}
		return esc_url_raw( rest_url( HD_DD_REST_NS . '/img' ) );
	}

	/** Strings the JS app needs (kept here so they're translatable). */
	private function i18n_strings() {
		return array(
			'next'         => __( 'Continue', 'hd-door-designer' ),
			'back'         => __( 'Back', 'hd-door-designer' ),
			'chooseType'   => __( 'What kind of door?', 'hd-door-designer' ),
			'intro'        => __( 'Design your door and get a free, no-obligation quote — it takes about two minutes.', 'hd-door-designer' ),
			'formTitle'    => __( 'Get your free quote', 'hd-door-designer' ),
			'reassure'     => __( 'Free and no-obligation — no payment now. We just need a few details to send your tailored quote.', 'hd-door-designer' ),
			'submit'       => __( 'Send my free quote request', 'hd-door-designer' ),
			'trust'        => __( 'No spam, ever — your details are only used to prepare your quote.', 'hd-door-designer' ),
			'enquire'      => __( 'Enquire about this door', 'hd-door-designer' ),
			'previewOnly'  => __( 'Preview mode — enquiry not sent.', 'hd-door-designer' ),
			'notLoaded'    => __( 'The door designer is being set up. Please check back shortly.', 'hd-door-designer' ),
			'genericError' => __( 'Something went wrong. Please try again.', 'hd-door-designer' ),
			'consent'      => __( 'I agree to Hertfordshire Doors contacting me about this enquiry.', 'hd-door-designer' ),
		);
	}
}
