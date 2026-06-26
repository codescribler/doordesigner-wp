<?php
/**
 * GitHub-based update mechanism. Uses YahnisElsts/plugin-update-checker so a
 * tagged GitHub release surfaces as an available update in wp-admin.
 *
 * The library is vendored at vendor/plugin-update-checker/. If it isn't present
 * yet this class no-ops (and nudges admins once), so the plugin always activates.
 *
 * Release flow (see README.md):
 *   1. Bump the Version header in hd-door-designer.php (and HD_DD_VERSION).
 *   2. git tag vX.Y.Z && push the tag; create a GitHub release.
 *   3. The update appears in wp-admin → Plugins within the check interval.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Updater {

	const LIB = 'vendor/plugin-update-checker/plugin-update-checker.php';

	public function register() {
		add_action( 'init', array( $this, 'boot' ) );
		add_action( 'admin_notices', array( $this, 'maybe_notice' ) );
	}

	/** Resolve the repo URL: setting overrides the header URI fallback. */
	private function repo_url() {
		$settings = HD_DD_Plugin::settings();
		if ( ! empty( $settings['github_repo'] ) ) {
			return $settings['github_repo'];
		}
		// Fall back to the Plugin URI header if it points at a real repo.
		$data = get_file_data( HD_DD_FILE, array( 'uri' => 'Plugin URI' ) );
		$uri  = isset( $data['uri'] ) ? $data['uri'] : '';
		return ( $uri && false === strpos( $uri, 'PLACEHOLDER' ) ) ? $uri : '';
	}

	public function boot() {
		$lib_path = HD_DD_DIR . self::LIB;
		$repo     = $this->repo_url();

		if ( ! is_readable( $lib_path ) || '' === $repo ) {
			return; // Not wired yet — handled gracefully.
		}

		require_once $lib_path;

		if ( ! class_exists( '\\YahnisElsts\\PluginUpdateChecker\\v5\\PucFactory' ) ) {
			return;
		}

		$checker = \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
			$repo,
			HD_DD_FILE,
			HD_DD_SLUG
		);

		// Pull updates from GitHub releases (assets), not raw branch source.
		if ( method_exists( $checker, 'getVcsApi' ) ) {
			$checker->getVcsApi()->enableReleaseAssets();
		}

		/** Let advanced setups tweak the checker (e.g. set a stable branch or token). */
		do_action( 'hd_dd_update_checker', $checker );
	}

	/** Gentle one-time hint when the updater can't run yet. */
	public function maybe_notice() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || 'plugins' !== $screen->id ) {
			return;
		}

		$lib_missing  = ! is_readable( HD_DD_DIR . self::LIB );
		$repo_missing = '' === $this->repo_url();

		if ( ! $lib_missing && ! $repo_missing ) {
			return;
		}

		$msg = $lib_missing
			? __( 'Door Designer: auto-updates are not active yet — run “composer require yahnis-elsts/plugin-update-checker” (or vendor the library) to enable GitHub updates.', 'hd-door-designer' )
			: __( 'Door Designer: set the GitHub repo URL under Door Enquiries → Settings to enable auto-updates.', 'hd-door-designer' );

		printf( '<div class="notice notice-info is-dismissible"><p>%s</p></div>', esc_html( $msg ) );
	}
}
