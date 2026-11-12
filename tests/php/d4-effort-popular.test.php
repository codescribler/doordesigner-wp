<?php
/**
 * The design effort kept with a Designer 4 door (HD_DD_D4_Effort) and the styles the style screen
 * shows first (HD_DD_D4_Popular: a starting list that real designs outrank over time).
 * Run: php tests/php/d4-effort-popular.test.php
 */
require __DIR__ . '/wp-stubs.php';

$E = 'HD_DD_D4_Effort';
check( null === $E::clean( null ) && null === $E::clean( 'x' ) && null === $E::clean( array( 'changes' => 'lots', 'seconds' => 3 ) ), 'nothing usable gives null' );
$c = $E::clean( array( 'changes' => '7', 'seconds' => 372.6, 'parts' => array( 'Colour', 'handle', 'handle', '<b>', 9 ) ) );
check( 7 === $c['changes'] && 372 === $c['seconds'], 'numbers are whole' );
check( array( 'colour', 'handle', 'b' ) === $c['parts'], 'parts are lower-case words, once each' );
$big = $E::clean( array( 'changes' => 100000, 'seconds' => -5 ) );
check( 999 === $big['changes'] && 0 === $big['seconds'], 'numbers are kept within bounds' );
check( '7 changes over 6 min' === $E::describe( $c ), 'described in changes and minutes' );
check( '1 change over 40 sec' === $E::describe( array( 'changes' => 1, 'seconds' => 40 ) ), 'one change, under a minute' );
check( '' === $E::describe( null ), 'no effort describes as nothing' );
$m = $E::merge( array( 'changes' => 7, 'seconds' => 372, 'parts' => array( 'colour' ) ), array( 'changes' => 2, 'seconds' => 500, 'parts' => array( 'handle' ) ) );
check( 7 === $m['changes'] && 500 === $m['seconds'] && array( 'colour', 'handle' ) === $m['parts'], 'a later visit never lowers what is kept' );
check( $c === $E::merge( $c, null ), 'nothing new keeps what is stored' );
check( null === $E::merge( null, null ), 'nothing at all stays nothing' );

// The manager sees the effort beside the door's choices; a door without one is unchanged.
$design = array( 'Door Type' => array( 'label' => 'Single Door' ), 'Door Design' => array( 'label' => 'Etna' ) );
$row    = (object) array( 'reference' => 'HD-1', 'design_name' => 'Etna', 'token' => 't', 'customer_email' => 'a@b.co', 'design' => json_encode( $design ), 'payload' => json_encode( array( 'effort' => array( 'changes' => 7, 'seconds' => 372, 'parts' => array() ) ) ) );
$door   = HD_DD_D4_Events::door( $row );
$last   = end( $door['choices'] );
check( 'Time designing' === $last['heading'] && '7 changes over 6 min' === $last['label'], 'the effort is the last line of the door\'s choices' );
$row->payload = '{}';
check( 2 === count( HD_DD_D4_Events::door( $row )['choices'] ), 'no effort, no extra line' );

// Popular styles.
$P    = 'HD_DD_D4_Popular';
$seed = array( 'Single Door' => array( 'Etna', 'Eiger', 'Fuji' ) );
check( array( 'Single Door' => array( 'Etna', 'Eiger', 'Fuji' ) ) === $P::rank( array(), $seed ), 'with no designs the starting list leads, in its order' );
function hd_pr( $style, $kind = 'enquiry', $extra = array() ) {
	return (object) array_merge( array( 'kind' => $kind, 'status' => 'new', 'design' => json_encode( array( 'Door Type' => array( 'label' => 'Single Door' ), 'Door Design' => array( 'label' => $style . ' ' ) ) ) ), $extra );
}
$rows = array( hd_pr( 'Snowdon' ), hd_pr( 'Snowdon' ), hd_pr( 'Fuji', 'save' ) );
$r    = $P::rank( $rows, $seed );
check( array( 'Snowdon', 'Fuji', 'Etna', 'Eiger' ) === $r['Single Door'], 'styles people really choose rise above the starting list (a lead counts double a save)' );
$r = $P::rank( array( hd_pr( 'Snowdon', 'enquiry', array( 'status' => 'failed' ) ), hd_pr( 'Snowdon', 'enquiry', array( 'removed_at' => '2026-11-12' ) ), (object) array( 'design' => 'nope' ) ), $seed );
check( array( 'Etna', 'Eiger', 'Fuji' ) === $r['Single Door'], 'failed, removed and unreadable rows count for nothing' );
$many = array();
foreach ( range( 1, 12 ) as $i ) {
	$many[] = hd_pr( 'Style' . $i );
}
check( $P::TOP === count( $P::rank( $many, array() )['Single Door'] ), 'at most TOP styles per door type' );
check( is_array( $P::seed() ) && ! empty( $P::seed()['Single Door'] ), 'the starting list file is readable and lists single doors' );
$cfg = $P::front_config();
check( is_array( $cfg ) && $cfg === get_transient( $P::TRANSIENT ), 'the list is worked out once and cached' );

hd_test_done( 'd4-effort-popular' );
