<?php
/**
 * Activation / deactivation lifecycle. Creates the enquiries table and seeds
 * default settings on activate. Deactivation is a no-op for data (uninstall.php
 * handles destructive cleanup so deactivating never loses enquiries).
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Activator {

	public static function activate() {
		require_once HD_DD_DIR . 'includes/class-hd-repository.php';
		HD_DD_Repository::create_table();

		// Seed settings without clobbering anything an admin already set.
		if ( false === get_option( 'hd_dd_settings', false ) ) {
			add_option(
				'hd_dd_settings',
				array(
					'recipient_email' => 'daniel@dreamfree.co.uk, hello@hertfordshiredoors.co.uk',
					'page_id'         => 0,
					'retention_days'  => 0,
					'github_repo'     => '',
				)
			);
		}

		// Store the schema version so future activations can run migrations.
		update_option( 'hd_dd_db_version', HD_DD_Repository::DB_VERSION );

		flush_rewrite_rules();
	}

	public static function deactivate() {
		flush_rewrite_rules();
	}
}
