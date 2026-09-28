<?php
/**
 * Clean uninstall. Removes the enquiries table and all plugin options.
 * NOTE: this deletes stored customer enquiries (PII). Deactivation does NOT —
 * only an explicit Delete from the Plugins screen triggers this.
 *
 * @package HD_Door_Designer
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

$table = $wpdb->prefix . 'hd_enquiries';
// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery -- one-off teardown.
$wpdb->query( "DROP TABLE IF EXISTS {$table}" );

$experiments = $wpdb->prefix . 'hd_dd_experiment_visitors';
// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery -- one-off teardown.
$wpdb->query( "DROP TABLE IF EXISTS {$experiments}" );

delete_option( 'hd_dd_settings' );
delete_option( 'hd_dd_db_version' );
delete_option( 'hd_dd_ref_seq' );
delete_option( 'hd_dd_experiment' );
delete_option( 'hd_dd_experiment_history' );
delete_option( 'hd_dd_experiments_db_version' );
wp_clear_scheduled_hook( 'hd_dd_experiment_evaluate' );
