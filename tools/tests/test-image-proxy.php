<?php
/**
 * Unit test for the image-proxy PATH VALIDATOR — the security-critical gate that
 * stops the endpoint being used as an open proxy or to read arbitrary files.
 * Pure/static, so it runs without WordPress.  Run:  php tools/tests/test-image-proxy.php
 */
define( 'ABSPATH', __DIR__ ); // so the class file's ABSPATH guard doesn't exit().
require __DIR__ . '/../../includes/class-hd-image-proxy.php';

$fails = 0;
function check( $cond, $msg ) {
	global $fails;
	if ( ! $cond ) { fwrite( STDERR, "FAIL: $msg\n" ); $fails++; }
}
$V = 'HD_DD_Image_Proxy';

// --- valid: real Endurance image paths (spaces, parens, hyphens, both extensions) ---
check( false !== $V::validate_path( 'Assets/CompositeDoors/Images/DoorBlanks/Door Mould 10/Thumbnails/White.jpg' ), 'valid jpg with spaces' );
check( false !== $V::validate_path( 'Assets/CompositeDoors/Images/Handles/1200mm with Heritage.jpg' ), 'valid jpg spaces 2' );
check( false !== $V::validate_path( 'Assets/CompositeDoors/Images/DoorCassettes/K1/Thumbnails/White.png' ), 'valid png' );
check( false !== $V::validate_path( 'Assets/CompositeDoors/Images/DoorBlanks/Avantal/Thumbnails/AnTeak (with tick).jpg' ), 'valid parens' );
check( 'Assets/CompositeDoors/Images/Handles/x.png' === $V::validate_path( '/Assets/CompositeDoors/Images/Handles/x.png' ), 'leading slash tolerated + stripped' );

// --- invalid: traversal / arbitrary files / wrong location / wrong type / encoded ---
check( false === $V::validate_path( 'Assets/CompositeDoors/Images/../../../wp-config.php' ), 'blocks ../ traversal' );
check( false === $V::validate_path( 'Assets/CompositeDoors/Images/x.php' ), 'blocks .php' );
check( false === $V::validate_path( 'Assets/CompositeDoors/Images/x.svg' ), 'blocks .svg' );
check( false === $V::validate_path( 'Assets/CompositeDoors/Images/shell.jpg.php' ), 'blocks double-ext' );
check( false === $V::validate_path( 'Assets/Other/x.png' ), 'blocks outside Images dir' );
check( false === $V::validate_path( 'wp-config.php' ), 'blocks arbitrary file' );
check( false === $V::validate_path( 'http://evil.example/x.png' ), 'blocks absolute url' );
check( false === $V::validate_path( 'Assets/CompositeDoors/Images/..%2f..%2fwp-config.php' ), 'blocks encoded traversal (has %)' );
check( false === $V::validate_path( '' ), 'blocks empty' );
check( false === $V::validate_path( "Assets/CompositeDoors/Images/x\0.png" ), 'blocks null byte' );

if ( $fails ) { exit( 1 ); }
echo "image-proxy OK\n";
