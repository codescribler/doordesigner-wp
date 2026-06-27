<?php
/**
 * On-demand image cache (proxy). The preview's asset base points at this endpoint, so
 * the browser requests every door image from THIS site. Each image is fetched once from
 * the upstream Endurance host, stored under uploads/, and served locally thereafter —
 * no runtime dependency on the upstream once cached, and only what's actually used is
 * stored (no thousands-of-files pre-mirror).
 *
 *   GET /wp-json/hd-door-designer/v1/img/Assets/CompositeDoors/Images/...
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Image_Proxy {

	const CACHE_SUBDIR = 'hd-door-designer/img';

	/** @var HD_DD_Catalogue */
	private $catalogue;

	public function __construct( HD_DD_Catalogue $catalogue ) {
		$this->catalogue = $catalogue;
	}

	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'admin_post_hd_dd_clear_img_cache', array( $this, 'handle_clear_cache' ) );
	}

	public function register_routes() {
		register_rest_route(
			HD_DD_REST_NS,
			'/img/(?P<path>.+)',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'serve' ),
				'permission_callback' => '__return_true', // Public: same images the live designer serves.
				'args'                => array( 'path' => array( 'required' => true ) ),
			)
		);
	}

	/**
	 * Validate the requested image path. SECURITY-CRITICAL: this is what stops the
	 * endpoint being used as an open proxy or to read arbitrary files. Pure + static so
	 * it can be unit-tested without WordPress.
	 *
	 * @param string $path relative path (already URL-decoded).
	 * @return string|false the clean relative path, or false if disallowed.
	 */
	public static function validate_path( $path ) {
		$path = ltrim( (string) $path, '/' );
		if ( '' === $path || false !== strpos( $path, '..' ) || false !== strpos( $path, "\0" ) ) {
			return false;
		}
		// Only Endurance composite-door image assets; only image extensions (anchored end).
		if ( ! preg_match( '#^Assets/CompositeDoors/Images/[A-Za-z0-9 _()\-./]+\.(?:jpe?g|png)$#i', $path ) ) {
			return false;
		}
		return $path;
	}

	public function serve( WP_REST_Request $request ) {
		$raw = (string) $request['path'];
		if ( '' === $raw ) {
			// Some setups don't populate a slash-containing named param — recover the path
			// from the matched route (everything after ".../img/").
			$raw = (string) preg_replace( '#^.*/img/#', '', (string) $request->get_route() );
		}
		$raw = rawurldecode( $raw );             // handle %20 / %28 etc.
		if ( false !== strpos( $raw, '%' ) ) {   // and any accidental double-encoding.
			$raw = rawurldecode( $raw );
		}

		$path = self::validate_path( $raw );
		if ( false === $path ) {
			return new WP_REST_Response( array( 'error' => 'bad path', 'received' => $raw ), 400 );
		}

		$file = $this->cache_file( $path );
		if ( ! file_exists( $file ) && ! $this->fetch_and_store( $path, $file ) ) {
			// Couldn't cache it (uploads not writable, transient upstream issue, …) — redirect
			// to the upstream image so the preview never breaks worse than direct loading.
			$host = $this->source_host();
			if ( $host ) {
				$encoded = implode( '/', array_map( 'rawurlencode', explode( '/', $path ) ) );
				wp_redirect( $host . '/' . $encoded, 302 ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- fixed trusted upstream host.
				exit;
			}
			return new WP_REST_Response( array( 'error' => 'not found upstream' ), 404 );
		}

		$this->stream( $file, $path );
		exit; // streamed raw above; bypass REST's JSON encoding.
	}

	/** Absolute path to the local cache file for a (validated) relative path. */
	private function cache_file( $path ) {
		$up = wp_upload_dir();
		return trailingslashit( $up['basedir'] ) . self::CACHE_SUBDIR . '/' . $path;
	}

	/** Upstream host to fetch from = the render model's captured origin. Cached. */
	private function source_host() {
		$host = get_transient( 'hd_dd_source_host' );
		if ( $host ) {
			return $host;
		}
		$model = $this->catalogue->render_model();
		$host  = ( is_array( $model ) && ! empty( $model['_assetBase'] ) ) ? rtrim( $model['_assetBase'], '/' ) : '';
		if ( $host ) {
			set_transient( 'hd_dd_source_host', $host, DAY_IN_SECONDS );
		}
		return $host;
	}

	/** Fetch the upstream image and store it atomically. Returns true on success. */
	private function fetch_and_store( $path, $file ) {
		$host = $this->source_host();
		if ( ! $host || 0 !== strpos( $host, 'https://' ) ) {
			return false;
		}
		$encoded = implode( '/', array_map( 'rawurlencode', explode( '/', $path ) ) );
		$resp    = wp_remote_get( $host . '/' . $encoded, array( 'timeout' => 15 ) );
		if ( is_wp_error( $resp ) || 200 !== (int) wp_remote_retrieve_response_code( $resp ) ) {
			return false;
		}
		$body = wp_remote_retrieve_body( $resp );
		if ( '' === $body ) {
			return false;
		}
		if ( ! wp_mkdir_p( dirname( $file ) ) ) {
			return false;
		}
		$tmp = $file . '.tmp.' . wp_generate_password( 8, false );
		if ( false === file_put_contents( $tmp, $body ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return false;
		}
		if ( ! @rename( $tmp, $file ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			@unlink( $tmp ); // phpcs:ignore
			return false;
		}
		return true;
	}

	/** Send the cached file with a long browser cache so it's one hit per visitor. */
	private function stream( $file, $path ) {
		$ext  = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		$mime = ( 'png' === $ext ) ? 'image/png' : 'image/jpeg';
		if ( ! headers_sent() ) {
			header_remove( 'Content-Type' );
			header( 'Content-Type: ' . $mime );
			header( 'Content-Length: ' . filesize( $file ) );
			header( 'Cache-Control: public, max-age=31536000, immutable' );
		}
		readfile( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
	}

	// -------------------------------------------------------------------
	// Cache management (Settings → Clear cached preview images)
	// -------------------------------------------------------------------
	public function clear_cache() {
		$up = wp_upload_dir();
		$this->rrmdir( trailingslashit( $up['basedir'] ) . self::CACHE_SUBDIR );
		delete_transient( 'hd_dd_source_host' );
	}

	private function rrmdir( $dir ) {
		if ( ! is_dir( $dir ) ) {
			return;
		}
		foreach ( array_diff( (array) scandir( $dir ), array( '.', '..' ) ) as $item ) {
			$p = $dir . '/' . $item;
			if ( is_dir( $p ) ) {
				$this->rrmdir( $p );
			} else {
				@unlink( $p ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			}
		}
		@rmdir( $dir ); // phpcs:ignore
	}

	public function handle_clear_cache() {
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'hd_dd_clear_img_cache' ) ) {
			wp_die( esc_html__( 'Not allowed.', 'hd-door-designer' ) );
		}
		$this->clear_cache();
		$back = wp_get_referer() ? wp_get_referer() : admin_url( 'admin.php?page=' . HD_DD_Admin::SETTINGS_SLUG );
		wp_safe_redirect( add_query_arg( 'hd_dd_cache_cleared', '1', $back ) );
		exit;
	}
}
