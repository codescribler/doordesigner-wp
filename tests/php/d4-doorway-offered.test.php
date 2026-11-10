<?php
/**
 * Designer 4 My designs: each door says whether its type has a doorway to ask about (side or top
 * lights), decided from the plugin's own catalogue, so a Double Door is never asked.
 * Run: php tests/php/d4-doorway-offered.test.php
 */
require __DIR__ . '/d4-helpers.php';

function hd_do_designs( array $auth ) {
	$repo = new HD_DD_Repository();
	$d4   = new HD_DD_D4( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
	return $d4->doors->rest_designs( hd_test_request( 'POST', '/hd-door-designer/v1/d4/designs', array( 'auth' => $auth ) ) )->get_data();
}
function hd_do_catalogue() {
	@mkdir( HD_DD_DATA_DIR, 0777, true );
	$frame = function ( array $ids ) { return array( 'choices' => array_map( function ( $id ) { return array( 'label' => 'Frame ' . $id, 'id' => $id ); }, $ids ) ); };
	file_put_contents(
		HD_DD_DATA_DIR . HD_DD_Catalogue::FILENAME,
		json_encode( array(
			'Single Door' => array( 'fields' => array( 'Frame Design' => $frame( array( 1, 5, 30 ) ) ) ),
			'Double Door' => array( 'fields' => array( 'Frame Design' => $frame( array( 1 ) ) ) ),
		) )
	);
}

hd_d4_reset();
$single = hd_d4_lead()->get_data();
$double = hd_d4_lead( array( 'design' => array( 'Door Type' => array( 'label' => 'Double Door', 'id' => null ) ) + hd_d4_design() ) )->get_data();
$odd    = hd_d4_lead( array( 'design' => array( 'Door Type' => array( 'label' => 'Garage Door', 'id' => null ) ) + hd_d4_design() ) )->get_data();
hd_do_catalogue();   // written after the leads, so resolve_design kept the test labels.

$list = hd_do_designs( array( 'tokens' => array( $single['token'], $double['token'], $odd['token'] ) ) );
$by   = array();
foreach ( $list['doors'] as $d ) { $by[ $d['token'] ] = $d; }
check( 3 === count( $by ), 'all three doors are listed' );
check( true === $by[ $single['token'] ]['doorway'], 'a Single Door (side and top lights offered) has doorway: true' );
check( false === $by[ $double['token'] ]['doorway'], 'a Double Door (only No Sidelights) has doorway: false' );
check( true === $by[ $odd['token'] ]['doorway'], 'a type the catalogue does not know keeps the prompt (doorway: true)' );

// Without a catalogue on the server nothing is hidden.
unlink( HD_DD_DATA_DIR . HD_DD_Catalogue::FILENAME );
$list = hd_do_designs( array( 'tokens' => array( $double['token'] ) ) );
check( true === $list['doors'][0]['doorway'], 'no catalogue: doorway stays true' );

check( array() === $GLOBALS['hd_d4_php_errors'], 'no PHP notices (' . implode( '; ', $GLOBALS['hd_d4_php_errors'] ) . ')' );
hd_test_done( 'd4-doorway-offered' );
