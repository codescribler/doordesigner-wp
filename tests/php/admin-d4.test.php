<?php
/**
 * Designer 4 in wp-admin: its badges and state, the scoreboard note, and the manager backlog.
 * Run: php tests/php/admin-d4.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-admin.php';
hd_test_reset();

function d4a_row( $flow, array $more = array() ) {
	return (object) ( $more + array( 'kind' => 'enquiry', 'flow' => $flow ) );
}
$D = 'HD_DD_D4_Admin';

$plain = $D::badges( d4a_row( 'designer4' ) );
check( false !== strpos( $plain, 'Designer 4' ) && 0 === strpos( $plain, '<br><span' ), 'a Designer 4 row has a Designer 4 badge (got ' . $plain . ')' );
check( false === strpos( $plain, 'Removed' ) && false === strpos( $plain, 'Doorway' ) && false === strpos( $plain, 'Details' ), 'and no state badges before anything happens' );
check( false !== strpos( $D::badges( d4a_row( 'designer4', array( 'removed_at' => '2026-11-10 10:00:00' ) ) ), 'Removed by customer' ), 'removed_at shows Removed by customer' );
check( false !== strpos( $D::badges( d4a_row( 'designer4', array( 'doorway_at' => '2026-11-10 10:00:00' ) ) ), 'Doorway ✓' ), 'doorway_at shows Doorway ✓' );
check( false !== strpos( $D::badges( d4a_row( 'designer4', array( 'details_at' => '2026-11-10 10:00:00' ) ) ), 'Details ✓' ), 'details_at shows Details ✓' );
check( false === strpos( $D::badges( d4a_row( 'designer4', array( 'removed_at' => null, 'doorway_at' => null, 'details_at' => null ) ) ), 'Doorway' ), 'null times are not set' );

foreach ( array( 'classic', 'swipe2', 'designer3', '' ) as $flow ) {
	$html = $D::badges( d4a_row( $flow, array( 'removed_at' => 'x', 'doorway_at' => 'x', 'details_at' => 'x' ) ) );
	check( '' === $html, "a $flow row gets nothing from Designer 4 (got $html)" );
}
check( '' === $D::badges( d4a_row( 'designer4', array( 'kind' => 'save' ) ) ), 'a saved design that is not a Designer 4 enquiry gets nothing' );

check( false !== strpos( $D::leads_note( 'designer4' ), 'Leads (email sent)' ), 'the Designer 4 arm is annotated Leads (email sent)' );
check( '' === $D::leads_note( 'classic' ) && '' === $D::leads_note( 'designer3' ), 'other arms are not annotated' );

class HD_Test_Backlog_WPDB extends HD_Test_WPDB { public function get_var( $q ) { return 7; } }
$GLOBALS['wpdb'] = new HD_Test_Backlog_WPDB();
$note = $D::waiting_note();
check( false !== strpos( $note, 'Manager events waiting' ) && false !== strpos( $note, '7' ), 'the manager backlog is shown (got ' . $note . ')' );

hd_test_done( 'admin-d4.test.php' );
