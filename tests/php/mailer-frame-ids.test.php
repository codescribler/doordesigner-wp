<?php
/**
 * Designer 3's repeated Frame Design labels (ids 14/17/20 vs 31/32/33) are told apart in the
 * business email and in wp-admin, on Designer 3 rows only. Run: php tests/php/mailer-frame-ids.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-admin.php';

function hd_frame_payload( $id, $flow ) {
	$p = array(
		'reference' => 'HD-2026-000070',
		'customer'  => array( 'name' => 'Jo', 'telephone' => '01234 567890', 'email' => 'jo@example.com', 'postcode' => 'AL1 1AA' ),
		'design'    => array( 'Door Design' => array( 'label' => 'Ketu', 'id' => 12 ), 'Frame Design' => array( 'label' => 'Toplight with Half Flag Left ', 'id' => $id ) ),
	);
	if ( $flow ) {
		$p['flow'] = $flow;
	}
	return $p;
}
function hd_frame_line( $id, $flow ) {
	hd_test_reset();
	HD_DD_Mailer::send( hd_frame_payload( $id, $flow ), 'owner@example.com' );
	$msg = $GLOBALS['hd_test_mail'][0]['message'];
	preg_match( '/^Frame Design:\s+(.*)$/m', $msg, $m );
	return isset( $m[1] ) ? $m[1] : '';
}

// --- Business email ---------------------------------------------------------------------
$l = hd_frame_line( 31, 'designer3' );
check( 'Toplight with Half Flag Left — id 31 (glass runs to the top, no side transom)' === $l, 'id 31 says glass to the top (got "' . $l . '")' );
foreach ( array( 32, 33 ) as $id ) {
	check( false !== strpos( hd_frame_line( $id, 'designer3' ), "id $id (glass runs to the top, no side transom)" ), "id $id says glass to the top" );
}
foreach ( array( 14, 17, 20 ) as $id ) {
	$l = hd_frame_line( $id, 'designer3' );
	check( false !== strpos( $l, "— id $id (bar level with the top of the door)" ), "id $id says bar level (got \"$l\")" );
}
$l = hd_frame_line( 2, 'designer3' );
check( 'Toplight with Half Flag Left — id 2' === $l, 'other frames show the id with no note (got "' . $l . '")' );
// Not Designer 3 (Classic, Swipe 2): the line is exactly as before.
check( 'Toplight with Half Flag Left ' === hd_frame_line( 31, '' ), 'no flow: label only, unchanged' );
check( 'Toplight with Half Flag Left ' === hd_frame_line( 14, 'swipe2' ), 'swipe2: label only, unchanged' );

// --- wp-admin design specification ---------------------------------------------------------
$c31 = array( 'label' => 'Toplight with Half Flag Left', 'id' => 31 );
$c14 = array( 'label' => 'Toplight with Half Flag Left', 'id' => 14 );
$a = HD_DD_Admin::choice_cell( 'designer3', 'Frame Design', $c31 );
check( false !== strpos( $a, '(#31)' ) && false !== strpos( $a, '(glass runs to the top, no side transom)' ), 'admin: id 31 on a Designer 3 row (got ' . $a . ')' );
$a = HD_DD_Admin::choice_cell( 'designer3', 'Frame Design', $c14 );
check( false !== strpos( $a, '(#14)' ) && false !== strpos( $a, '(bar level with the top of the door)' ), 'admin: id 14 on a Designer 3 row' );
$a = HD_DD_Admin::choice_cell( 'classic', 'Frame Design', $c31 );
check( 'Toplight with Half Flag Left <small style="color:#8a8e96;">(#31)</small>' === $a, 'admin: other flows unchanged (got ' . $a . ')' );
check( 'A &amp; B' === HD_DD_Admin::choice_cell( 'designer3', 'Door Design', array( 'label' => 'A & B', 'id' => null ) ), 'admin: escaped, no id' );

hd_test_done( 'mailer-frame-ids.test.php' );
