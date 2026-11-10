<?php
/**
 * Designer 4 is registered: every d4 module has its file, the app loads after them and Designer 3's
 * app, boot depends on the app, and the stylesheet is enqueued after Designer 3's.
 * Run: php tests/php/assets-designer4.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-stats.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-notifier.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-export.php';
require_once HD_DD_DIR . 'includes/class-hd-experiments.php';
require_once HD_DD_DIR . 'includes/class-hd-assets.php';

$GLOBALS['hd_test_scripts'] = array();
$GLOBALS['hd_test_styles']  = array();
$GLOBALS['hd_test_enq_css'] = array();
function wp_register_script( $h, $src, $deps = array(), $ver = false, $footer = false ) { $GLOBALS['hd_test_scripts'][ $h ] = compact( 'src', 'deps', 'ver' ); return true; }
function wp_register_style( $h, $src, $deps = array(), $ver = false ) { $GLOBALS['hd_test_styles'][ $h ] = compact( 'src', 'deps', 'ver' ); return true; }
function wp_enqueue_script( $h ) {}
function wp_enqueue_style( $h ) { $GLOBALS['hd_test_enq_css'][] = $h; }
function wp_localize_script( $h, $name, $data ) { return true; }
function rest_url( $path = '' ) { return 'https://example.test/wp-json/' . ltrim( (string) $path, '/' ); }

$assets = new HD_DD_Assets( new HD_DD_Catalogue() );
$assets->enqueue();
$scripts = $GLOBALS['hd_test_scripts'];
$styles  = $GLOBALS['hd_test_styles'];
$H       = HD_DD_Assets::HANDLE;

$files = array(
	'd4handle'    => 'd4-handle.js',
	'd4doorway'   => 'd4-doorway.js',
	'd4store'     => 'd4-store.js',
	'd4ask'       => 'd4-ask.js',
	'd4door'      => 'd4-door.js',
	'd4sideglass' => 'd4-sideglass.js',
	'd4steps'     => 'd4-steps.js',
	'd4mydesigns' => 'd4-mydesigns.js',
	'd4app'       => 'd4-app.js',
);
foreach ( $files as $key => $file ) {
	check( isset( $scripts[ $H . '-' . $key ] ) && HD_DD_URL . 'assets/js/designer4/' . $file === $scripts[ $H . '-' . $key ]['src'], "$key is assets/js/designer4/$file" );
	check( file_exists( HD_DD_DIR . 'assets/js/designer4/' . $file ), "$file exists" );
}
check( isset( $scripts[ $H . '-boot' ] ) && in_array( $H . '-d4app', $scripts[ $H . '-boot' ]['deps'], true ), 'boot depends on d4app' );
$app_deps = isset( $scripts[ $H . '-d4app' ] ) ? $scripts[ $H . '-d4app' ]['deps'] : array();
check( in_array( $H . '-d3app', $app_deps, true ), 'd4app depends on d3app' );
foreach ( $files as $key => $file ) {
	if ( 'd4app' !== $key ) {
		check( in_array( $H . '-' . $key, $app_deps, true ), "d4app depends on $key" );
	}
}
check( isset( $styles[ $H . '-d4' ] ) && HD_DD_URL . 'assets/css/hd-designer4.css' === $styles[ $H . '-d4' ]['src'], 'd4 stylesheet is assets/css/hd-designer4.css' );
check( isset( $styles[ $H . '-d4' ] ) && in_array( $H . '-d3', $styles[ $H . '-d4' ]['deps'], true ), 'd4 stylesheet loads after d3' );
check( in_array( $H . '-d4', $GLOBALS['hd_test_enq_css'], true ), 'd4 stylesheet is enqueued' );
check( file_exists( HD_DD_DIR . 'assets/css/hd-designer4.css' ), 'hd-designer4.css exists' );

hd_test_done( 'assets-designer4' );
