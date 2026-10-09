<?php
/**
 * Stand-in for WordPress's wp-admin/includes/upgrade.php (ABSPATH is tests/php/ under test),
 * so the schema upgrades can run. dbDelta() only records the SQL it was given, in
 * $GLOBALS['hd_test_dbdelta']; which columns "exist" afterwards is set by the test through
 * $wpdb->columns (see HD_Test_WPDB in wp-stubs.php).
 */
if ( ! function_exists( 'dbDelta' ) ) {
	function dbDelta( $sql ) {
		$GLOBALS['hd_test_dbdelta'][] = $sql;
		return array();
	}
}
