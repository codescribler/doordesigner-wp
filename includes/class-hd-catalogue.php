<?php
/**
 * Loads the Endurance catalogue (the extractor output) and serves it to the
 * front-end over REST. Logic is fully decoupled from the data: dropping a new
 * data/endurance-catalogue-full.json in is all it takes to update options and the
 * per-style glazing matrix.
 *
 * The front-end is served a COMPACT "customer view" — only the 12 customer-facing
 * fields, glazing-by-style, sidelights and per-type flags — so the page payload
 * stays small (the full file carries every trade field + full image stacks).
 * The full file is still used server-side for authoritative label resolution.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Catalogue {

	const FILENAME = 'endurance-catalogue-full.json';
	const RENDER_MODEL = 'render-model.json';

	/** The actual Endurance headings that are customer-facing (sidelights handled separately). */
	const CUSTOMER_HEADINGS = array(
		'Door Type',
		'Frame Design',
		'Frame Colour',
		'Door Design',
		'Door Colour (External)',
		'Door Colour (Internal)',
		'Door Glass',
		'Door Hinged On',
		'Master Leaf',
		'Hardware Type',
		'Handle',
		'Letterplate',
		'Knocker',
	);

	/** @var array|null Lazily-loaded, decoded full catalogue. */
	private $data = null;

	/** @var bool */
	private $loaded = false;

	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function file_path() {
		return HD_DD_DATA_DIR . self::FILENAME;
	}

	public function is_available() {
		return is_readable( $this->file_path() );
	}

	/** Decoded FULL catalogue, or null if absent/invalid. */
	public function get() {
		if ( $this->loaded ) {
			return $this->data;
		}
		$this->loaded = true;

		if ( ! $this->is_available() ) {
			return null;
		}

		$raw     = file_get_contents( $this->file_path() ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local bundled asset.
		$decoded = json_decode( $raw, true );
		$this->data = ( JSON_ERROR_NONE === json_last_error() && is_array( $decoded ) ) ? $decoded : null;

		return $this->data;
	}

	public function version() {
		return $this->is_available() ? (string) filemtime( $this->file_path() ) : HD_DD_VERSION;
	}

	// -------------------------------------------------------------------
	// Render model (compiled by tools/build-render-model.js) — drives the preview.
	// -------------------------------------------------------------------
	public function render_model_path() {
		return HD_DD_DATA_DIR . self::RENDER_MODEL;
	}

	public function render_model_available() {
		return is_readable( $this->render_model_path() );
	}

	/** Decoded render model, or null. */
	public function render_model() {
		if ( ! $this->render_model_available() ) {
			return null;
		}
		$raw     = file_get_contents( $this->render_model_path() ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local bundled asset.
		$decoded = json_decode( $raw, true );
		return ( JSON_ERROR_NONE === json_last_error() && is_array( $decoded ) ) ? $decoded : null;
	}

	/**
	 * Build the compact, customer-facing projection used by the configurator UI.
	 * Keyed by the real Endurance headings so the captured payload stays exact.
	 *
	 * @return array|null
	 */
	public function customer_view() {
		// Cache the projection — the full file can be several MB; rebuilding it on
		// every page load is wasteful. Keyed by the file's mtime so a re-sync busts it.
		$ver    = $this->version();
		$cached = get_transient( 'hd_dd_customer_view' );
		if ( is_array( $cached ) && isset( $cached['ver'], $cached['data'] ) && $cached['ver'] === $ver ) {
			return $cached['data'];
		}

		$full = $this->get();
		if ( null === $full ) {
			return null;
		}

		$types  = array();
		$by_type = array();

		foreach ( $full as $type_name => $node ) {
			if ( ! is_array( $node ) || empty( $node['fields'] ) ) {
				continue;
			}
			$types[] = $type_name;
			$fields  = array();

			foreach ( self::CUSTOMER_HEADINGS as $heading ) {
				if ( ! isset( $node['fields'][ $heading ]['choices'] ) ) {
					continue;
				}
				$fields[ $heading ] = $this->slim_choices( $node['fields'][ $heading ]['choices'] );
			}

			$by_type[ $type_name ] = array(
				'hingeSideField'    => isset( $node['fields']['Door Hinged On'] ) ? 'Door Hinged On' : ( isset( $node['fields']['Master Leaf'] ) ? 'Master Leaf' : '' ),
				'hasInternalColour' => isset( $node['fields']['Door Colour (Internal)'] ),
				'hasKnocker'        => isset( $node['fields']['Knocker'] ),
				'hasFrameShape'     => isset( $node['fields']['Frame Design'] ) && count( $node['fields']['Frame Design']['choices'] ) > 1,
				'fields'            => $fields,
				'glazingByStyle'    => $this->slim_glazing( isset( $node['glazingByStyle'] ) ? $node['glazingByStyle'] : array() ),
				'knockerByStyle'    => $this->slim_glazing( isset( $node['knockerByStyle'] ) ? $node['knockerByStyle'] : array() ),
				'sidelights'        => $this->slim_sidelights( isset( $node['sidelights'] ) ? $node['sidelights'] : null ),
			);
		}

		$result = array(
			'types'  => $types,
			'byType' => $by_type,
		);
		set_transient( 'hd_dd_customer_view', array( 'ver' => $ver, 'data' => $result ), DAY_IN_SECONDS );
		return $result;
	}

	/** Reduce choices to { label, id } (drop the heavy image stacks for the UI list). */
	private function slim_choices( array $choices ) {
		$out = array();
		foreach ( $choices as $c ) {
			$out[] = array(
				'label' => isset( $c['label'] ) ? $c['label'] : '',
				'id'    => isset( $c['id'] ) ? $c['id'] : null,
			);
		}
		return $out;
	}

	private function slim_glazing( array $by_style ) {
		$out = array();
		foreach ( $by_style as $style => $list ) {
			$out[ $style ] = is_array( $list ) ? $this->slim_choices( $list ) : array();
		}
		return $out;
	}

	private function slim_sidelights( $node ) {
		if ( ! is_array( $node ) ) {
			return null;
		}
		$pick = function ( $key ) use ( $node ) {
			return ( isset( $node[ $key ]['choices'] ) && is_array( $node[ $key ]['choices'] ) )
				? $this->slim_choices( $node[ $key ]['choices'] )
				: array();
		};
		return array(
			'sidelightType'  => $pick( 'sidelightType' ),
			'sidelightGlass' => $pick( 'sidelightGlass' ),
		);
	}

	// -------------------------------------------------------------------
	// REST
	// -------------------------------------------------------------------
	public function register_routes() {
		register_rest_route(
			HD_DD_REST_NS,
			'/catalogue',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'rest_get_catalogue' ),
				'permission_callback' => '__return_true', // Public read: same data the live designer exposes client-side.
				'args'                => array(
					'view' => array(
						'default'           => 'customer',
						'sanitize_callback' => 'sanitize_key',
					),
				),
			)
		);

		register_rest_route(
			HD_DD_REST_NS,
			'/render-model',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'rest_get_render_model' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	public function rest_get_render_model( WP_REST_Request $request ) {
		$model = $this->render_model();
		if ( null === $model ) {
			return new WP_REST_Response( array( 'available' => false ), 200 );
		}
		$response = new WP_REST_Response( array( 'available' => true, 'model' => $model ), 200 );
		// Never cache the catalogue/render-model in browsers or CDNs: it changes with the
		// data, and a stale copy silently breaks the preview. The payload is small + gzips
		// well, and the actual door images are cached separately (long-lived, immutable).
		$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
		return $response;
	}

	public function rest_get_catalogue( WP_REST_Request $request ) {
		if ( ! $this->is_available() ) {
			return new WP_REST_Response(
				array(
					'available' => false,
					'message'   => __( 'The door catalogue has not been loaded yet.', 'hd-door-designer' ),
				),
				200
			);
		}

		$view      = $request->get_param( 'view' );
		$catalogue = ( 'full' === $view ) ? $this->get() : $this->customer_view();

		$response = new WP_REST_Response(
			array(
				'available' => true,
				'view'      => ( 'full' === $view ) ? 'full' : 'customer',
				'version'   => $this->version(),
				'catalogue' => $catalogue,
			),
			200
		);
		// Never cache the catalogue/render-model in browsers or CDNs: it changes with the
		// data, and a stale copy silently breaks the preview. The payload is small + gzips
		// well, and the actual door images are cached separately (long-lived, immutable).
		$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
		return $response;
	}
}
