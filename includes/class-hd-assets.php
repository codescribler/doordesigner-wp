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
		wp_register_script( self::HANDLE . '-funnel', HD_DD_URL . 'assets/js/wizard/funnel.js', array(), $ver_js, true );

		// REST client: JSON headers, the nonce, and the stale-nonce self-heal.
		wp_register_script( self::HANDLE . '-apiclient', HD_DD_URL . 'assets/js/api-client.js', array(), $ver_js, true );

		// A/B test assignment + exposure beacon (HD_DD_Experiment); reads HD_DD_CONFIG.flow.
		wp_register_script( self::HANDLE . '-experiment', HD_DD_URL . 'assets/js/experiment.js', array(), $ver_js, true );

		// Furniture/finish rules shared by both flows, and the swipe flow's save form.
		wp_register_script( self::HANDLE . '-shared', HD_DD_URL . 'assets/js/design-shared.js', array( self::HANDLE . '-rendermodel' ), $ver_js, true );
		wp_register_script( self::HANDLE . '-enquiry', HD_DD_URL . 'assets/js/enquiry.js', array( self::HANDLE . '-apiclient' ), $ver_js, true );
		// The original quote form, kept for the classic flow (the A/B control).
		wp_register_script( self::HANDLE . '-quoteenquiry', HD_DD_URL . 'assets/js/enquiry-quote.js', array( self::HANDLE . '-apiclient' ), $ver_js, true );

		// Review-step social proof, benefits block and top save bar (swipe flow).
		wp_register_script( self::HANDLE . '-trust', HD_DD_URL . 'assets/js/trust.js', array(), $ver_js, true );

		// Classic flow: depends on the compositor + every wizard module.
		wp_register_script(
			self::HANDLE,
			HD_DD_URL . 'assets/js/hd-door-designer.js',
			array(
				self::HANDLE . '-preview',
				self::HANDLE . '-wizard',
				self::HANDLE . '-steprender',
				self::HANDLE . '-review',
				self::HANDLE . '-funnel',
				self::HANDLE . '-apiclient',
				self::HANDLE . '-shared',
				self::HANDLE . '-quoteenquiry',
			),
			$ver_js,
			true
		);

		// Swipe flow modules (assets/js/swipe/). Both flows always load so an A/B arm, the
		// ?flow= override or a shortcode flow="" can start either without a second request.
		$swipe = array(
			'designindex' => array( 'design-index.js', array() ),
			'flowsteps'   => array( 'flow-steps.js', array() ),
			'carousel'    => array( 'carousel.js', array() ),
			'doorcard'    => array( 'door-card.js', array( self::HANDLE . '-preview' ) ),
			'swipeparts'  => array( 'swipe-parts.js', array() ),
			'swipehint'   => array( 'swipe-hint.js', array() ),
		);
		foreach ( $swipe as $key => $def ) {
			wp_register_script( self::HANDLE . '-' . $key, HD_DD_URL . 'assets/js/swipe/' . $def[0], $def[1], $ver_js, true );
		}
		wp_register_script(
			self::HANDLE . '-swipeview',
			HD_DD_URL . 'assets/js/swipe/swipe-view.js',
			array( self::HANDLE . '-designindex', self::HANDLE . '-flowsteps', self::HANDLE . '-carousel', self::HANDLE . '-doorcard', self::HANDLE . '-swipeparts', self::HANDLE . '-swipehint', self::HANDLE . '-shared', self::HANDLE . '-enquiry', self::HANDLE . '-trust' ),
			$ver_js,
			true
		);
		wp_register_script( self::HANDLE . '-swipeapp', HD_DD_URL . 'assets/js/swipe/swipe-app.js', array( self::HANDLE . '-swipeview', self::HANDLE . '-wizard' ), $ver_js, true );

		// Entry point: picks the flow (forced / A/B arm / default) and starts it.
		wp_register_script(
			self::HANDLE . '-boot',
			HD_DD_URL . 'assets/js/boot.js',
			array( self::HANDLE, self::HANDLE . '-swipeapp', self::HANDLE . '-experiment', self::HANDLE . '-funnel', self::HANDLE . '-apiclient' ),
			$ver_js,
			true
		);
		wp_register_style( self::HANDLE . '-swipe', HD_DD_URL . 'assets/css/hd-swipe.css', array( self::HANDLE ), $this->asset_version( 'assets/css/hd-swipe.css' ) );

		wp_enqueue_style( self::HANDLE );
		wp_enqueue_style( self::HANDLE . '-swipe' );
		wp_enqueue_script( self::HANDLE . '-boot' );

		// Localised onto the render model — the first script in every flow's dependency chain —
		// so HD_DD_CONFIG exists before any module that reads it at load time.
		wp_localize_script(
			self::HANDLE . '-rendermodel',
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
				// Stamped on every funnel event (see wizard/funnel.js) so the manager
				// dashboard can compare completion per release.
				'version'        => HD_DD_VERSION,
				// Which designer flow to boot: { default, experiment: null | { id, control, challenger, percent } }.
				'flow'           => HD_DD_Experiments::front_config(),
				'catalogueReady' => $this->catalogue->is_available(),
				'renderReady'    => $this->catalogue->render_model_available(),
				// Asset base for preview images: a setting override, else the model's own
				// captured origin (Endurance host). Empty during dev = use model._assetBase.
				'assetBase'      => $this->get_asset_base(),
				// Hero image for the opening screen (before a door type is chosen). Override
				// with the `hd_dd_hero_image` filter or set it empty to show nothing.
				'heroImage'      => esc_url_raw( apply_filters( 'hd_dd_hero_image', 'https://hertfordshiredoors.co.uk/wp-content/uploads/2024/02/AVANTAL.jpg' ) ),
				// Review-step social proof: { rating, count, url, quotes: [{ text, by }] } (assets/js/trust.js).
				'trust'          => HD_DD_Trust_Settings::front_config(),
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
			'skip'         => __( 'Skip', 'hd-door-designer' ),
			'back'         => __( 'Back', 'hd-door-designer' ),
			'chooseType'   => __( 'What kind of door?', 'hd-door-designer' ),
			// Classic flow (the A/B control): the original quote form's wording, as in v0.2.64.
			'intro'        => __( 'Design your door and get a free, no-obligation quote — it takes about two minutes.', 'hd-door-designer' ),
			'formTitle'    => __( 'Get your free quote', 'hd-door-designer' ),
			'reassure'     => __( 'Free and no-obligation — no payment now. We just need a few details to send your tailored quote.', 'hd-door-designer' ),
			'submit'       => __( 'Send my free quote request', 'hd-door-designer' ),
			'trust'        => __( 'No spam, ever — your details are only used to prepare your quote.', 'hd-door-designer' ),
			'consent'      => __( 'I agree to Hertfordshire Doors contacting me about this enquiry.', 'hd-door-designer' ),
			// Swipe flow: the save form (assets/js/enquiry.js).
			'saveFormTitle' => __( 'Where shall we send your link and price?', 'hd-door-designer' ),
			'saveSubmit'   => __( 'Save my design & get my price', 'hd-door-designer' ),
			'saveTrust'    => __( 'No spam, ever.', 'hd-door-designer' ),
			'enquire'      => __( 'Enquire about this door', 'hd-door-designer' ),
			'previewOnly'  => __( 'Preview mode — enquiry not sent.', 'hd-door-designer' ),
			'notLoaded'    => __( 'The door designer is being set up. Please check back shortly.', 'hd-door-designer' ),
			'genericError' => __( 'Something went wrong. Please try again.', 'hd-door-designer' ),
			'sessionExpired' => __( 'Your session had expired. Please reload the page and send your design again.', 'hd-door-designer' ),
			'consentLine'  => __( 'By saving you’re asking us for a price. We’ll use your details to send it and may get in touch about your door.', 'hd-door-designer' ),
		);
	}
}
