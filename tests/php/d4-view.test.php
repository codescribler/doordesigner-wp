<?php
/**
 * How a stored Designer 4 door is described: side glass only for an answered doorway whose frame
 * has side lights (the browser's `sidelit` rule).
 * Run: php tests/php/d4-view.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-d4-view.php';

function hd_dv( $frame ) {
	return array(
		'Door Type'       => array( 'label' => 'Single Door' ),
		'Frame Design'    => array( 'label' => $frame, 'id' => 9 ),
		'Sidelight Type'  => array( 'label' => 'Left' ),
		'Sidelight Glass' => array( 'label' => 'Obscure' ),
	);
}
$V = 'HD_DD_D4_View';

check( 'Left · Obscure' === $V::side_glass_of( hd_dv( 'Sidelight Left' ), true ), 'a side-lit frame with an answered doorway gives its side glass' );
check( 'Left · Obscure' === $V::side_glass_of( hd_dv( 'Half Flag Left with Toplight' ), true ), 'a half flag frame counts as side-lit' );
check( '' === $V::side_glass_of( hd_dv( 'No Sidelights' ), true ), '"Just the door" (No Sidelights) gives ""' );
check( '' === $V::side_glass_of( hd_dv( 'Toplight' ), true ), 'a top-light-only frame gives ""' );
check( '' === $V::side_glass_of( hd_dv( 'Sidelight Left' ), false ), 'a doorway not answered yet gives ""' );
check( '' === $V::side_glass_of( array( 'Frame Design' => array( 'label' => 'Sidelight Left' ) ), true ), 'no sidelight type or glass gives ""' );

// The list item uses the row's own doorway answer.
$row = (object) array( 'token' => 't', 'reference' => 'HD-1', 'design_name' => 'x', 'created_at' => '', 'payload' => '{}', 'design' => json_encode( hd_dv( 'Toplight' ) ), 'doorway_at' => '2026-11-10 10:00:00' );
check( '' === $V::item( $row, 'pending' )['sideGlass'], 'a top-light door lists no side glass' );
$row->design = json_encode( hd_dv( 'Sidelight Left' ) );
check( 'Left · Obscure' === $V::item( $row, 'pending' )['sideGlass'], 'a side-lit answered door lists its side glass' );
$row->doorway_at = null;
check( '' === $V::item( $row, 'pending' )['sideGlass'], 'an unanswered doorway lists none' );

hd_test_done( 'd4-view' );
