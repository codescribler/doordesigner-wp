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

delete_option( 'hd_dd_settings' );
delete_option( 'hd_dd_db_version' );
delete_option( 'hd_dd_ref_seq' );
