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
		HD_DD_Experiments::create_table();
		update_option( HD_DD_Experiments::DB_OPTION, HD_DD_Experiments::DB_VERSION, false );

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

		// Store the schema version (only once the columns it needs exist) so later loads can
		// run migrations.
		HD_DD_Repository::maybe_upgrade();

		flush_rewrite_rules();
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( 'hd_dd_experiment_evaluate' ); // HD_DD_Experiments::CRON; re-scheduled on init.
		flush_rewrite_rules();
	}
}
