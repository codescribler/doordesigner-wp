<?php
/**
 * Designer 3 is registered and enqueued: boot depends on the Designer 3 app, the app's own
 * modules load before it, its stylesheet is enqueued, HD_DD_CONFIG carries d3Defaults and
 * pluginUrl, and the JS version moves when any assets/js file changes.
 * Run: php tests/php/assets-designer3.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-stats.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-notifier.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-export.php';
require_once HD_DD_DIR . 'includes/class-hd-experiments.php';
require_once HD_DD_DIR . 'includes/class-hd-assets.php';

// --- WP script/style stand-ins (only this test needs them) -------------------------------
function hd_test_assets_reset() {
	$GLOBALS['hd_test_scripts']  = array();
	$GLOBALS['hd_test_styles']   = array();
	$GLOBALS['hd_test_enq_js']   = array();
	$GLOBALS['hd_test_enq_css']  = array();
	$GLOBALS['hd_test_localize'] = array();
}
function wp_register_script( $h, $src, $deps = array(), $ver = false, $footer = false ) { $GLOBALS['hd_test_scripts'][ $h ] = compact( 'src', 'deps', 'ver' ); return true; }
function wp_register_style( $h, $src, $deps = array(), $ver = false ) { $GLOBALS['hd_test_styles'][ $h ] = compact( 'src', 'deps', 'ver' ); return true; }
function wp_enqueue_script( $h ) { $GLOBALS['hd_test_enq_js'][] = $h; }
function wp_enqueue_style( $h ) { $GLOBALS['hd_test_enq_css'][] = $h; }
function wp_localize_script( $h, $name, $data ) { $GLOBALS['hd_test_localize'][ $name ] = array( 'handle' => $h, 'data' => $data ); return true; }
function rest_url( $path = '' ) { return 'https://example.test/wp-json/' . ltrim( (string) $path, '/' ); }

/** Runs enqueue() on a fresh instance and returns the localised HD_DD_CONFIG. */
function hd_test_enqueue() {
	hd_test_assets_reset();
	$assets = new HD_DD_Assets( new HD_DD_Catalogue() );
	$assets->enqueue();
	return $GLOBALS['hd_test_localize']['HD_DD_CONFIG']['data'];
}

/** WordPress's load order for one handle: deps first, depth-first. Missing deps are reported. */
function hd_test_order( $handle, array &$out, array &$missing ) {
	if ( in_array( $handle, $out, true ) ) {
		return;
	}
	if ( ! isset( $GLOBALS['hd_test_scripts'][ $handle ] ) ) {
		$missing[] = $handle;
		return;
	}
	foreach ( $GLOBALS['hd_test_scripts'][ $handle ]['deps'] as $dep ) {
		hd_test_order( $dep, $out, $missing );
	}
	$out[] = $handle;
}

$defaults_src  = HD_DD_DIR . 'data/designer3-defaults.json';
$defaults_dest = HD_DD_DATA_DIR . 'designer3-defaults.json';
@mkdir( HD_DD_DATA_DIR, 0777, true );
copy( $defaults_src, $defaults_dest );

// --- 1) Boot needs the Designer 3 app; every module it uses loads first ------------------
$cfg     = hd_test_enqueue();
$scripts = $GLOBALS['hd_test_scripts'];
$H       = HD_DD_Assets::HANDLE;
check( isset( $scripts[ $H . '-boot' ] ) && in_array( $H . '-d3app', $scripts[ $H . '-boot' ]['deps'], true ), 'boot depends on hd-door-designer-d3app' );
check( isset( $scripts[ $H . '-d3app' ] ) && $H === 'hd-door-designer' && HD_DD_URL . 'assets/js/designer3/d3-app.js' === $scripts[ $H . '-d3app' ]['src'], 'd3app is assets/js/designer3/d3-app.js' );

$order   = array();
$missing = array();
hd_test_order( $H . '-boot', $order, $missing );
check( array() === $missing, 'every dependency of boot is registered (missing: ' . implode( ', ', $missing ) . ')' );
$pos = array_flip( $order );
$d3  = array( 'd3defaults', 'd3frame', 'd3hotspots', 'd3nudge', 'd3save', 'd3typeart', 'd3screens', 'd3toolbox', 'd3framestep', 'd3callback', 'd3aftersave' );
$use = array( 'trust', 'enquiry', 'reviewsave', 'swipeparts', 'shared', 'wizard', 'stepcfg', 'rendermodel', 'preview', 'funnel', 'apiclient' );
foreach ( array_merge( $d3, $use ) as $k ) {
	check( isset( $pos[ $H . '-' . $k ] ) && $pos[ $H . '-' . $k ] < $pos[ $H . '-d3app' ], "$k loads before d3app" );
}
foreach ( $d3 as $k ) {
	check( isset( $scripts[ $H . '-' . $k ] ) && 0 === strpos( $scripts[ $H . '-' . $k ]['src'], HD_DD_URL . 'assets/js/designer3/d3-' ), "$k comes from assets/js/designer3/" );
}
// Load-time needs: the hotspots read the render model, the save box reads review-save + enquiry.
check( isset( $pos[ $H . '-rendermodel' ], $pos[ $H . '-d3hotspots' ] ) && $pos[ $H . '-rendermodel' ] < $pos[ $H . '-d3hotspots' ], 'render model before the hotspots' );
check( isset( $pos[ $H . '-reviewsave' ], $pos[ $H . '-d3save' ] ) && $pos[ $H . '-reviewsave' ] < $pos[ $H . '-d3save' ], 'review-save before the save box' );
check( isset( $pos[ $H . '-d3typeart' ], $pos[ $H . '-d3screens' ] ) && $pos[ $H . '-d3typeart' ] < $pos[ $H . '-d3screens' ], 'type art before the screens' );
// The other flows still boot.
foreach ( array( $H, $H . '-swipeapp', $H . '-experiment' ) as $h ) {
	check( in_array( $h, $scripts[ $H . '-boot' ]['deps'], true ), "boot still depends on $h" );
}
check( array( $H . '-boot' ) === $GLOBALS['hd_test_enq_js'], 'only boot is enqueued (it pulls the rest)' );

// --- 2) The stylesheet ---------------------------------------------------------------------
$styles = $GLOBALS['hd_test_styles'];
check( in_array( $H . '-d3', $GLOBALS['hd_test_enq_css'], true ), 'the hd-door-designer-d3 stylesheet is enqueued' );
check( isset( $styles[ $H . '-d3' ] ) && HD_DD_URL . 'assets/css/hd-designer3.css' === $styles[ $H . '-d3' ]['src'], 'it is assets/css/hd-designer3.css' );
check( isset( $styles[ $H . '-d3' ] ) && (string) filemtime( HD_DD_DIR . 'assets/css/hd-designer3.css' ) === $styles[ $H . '-d3' ]['ver'], 'it has its own mtime version' );
check( isset( $styles[ $H . '-d3' ] ) && in_array( $H, $styles[ $H . '-d3' ]['deps'], true ), 'it loads after the classic tokens' );

// --- 3) Config -----------------------------------------------------------------------------
check( isset( $cfg['d3Defaults']['fallback']['handle'] ) && '' !== $cfg['d3Defaults']['fallback']['handle'], 'HD_DD_CONFIG.d3Defaults.fallback.handle is set' );
check( isset( $cfg['d3Defaults']['Single Door'] ), 'd3Defaults carries the per-style table' );
check( isset( $cfg['pluginUrl'] ) && HD_DD_URL === $cfg['pluginUrl'], 'HD_DD_CONFIG.pluginUrl is the plugin folder URL' );
check( $H . '-rendermodel' === $GLOBALS['hd_test_localize']['HD_DD_CONFIG']['handle'], 'config still localised on the render model' );
foreach ( array( 'restUrl', 'catalogueUrl', 'renderModelUrl', 'categoriesUrl', 'nonce', 'version', 'flow', 'catalogueReady', 'renderReady', 'assetBase', 'heroImage', 'trust', 'i18n' ) as $k ) {
	check( array_key_exists( $k, $cfg ), "config still has $k" );
}

// A missing or broken defaults file is left out rather than breaking the page.
file_put_contents( $defaults_dest, '{ not json' );
clearstatcache();
$cfg = hd_test_enqueue();
check( ! array_key_exists( 'd3Defaults', $cfg ), 'invalid defaults JSON → no d3Defaults key' );
unlink( $defaults_dest );
clearstatcache();
$cfg = hd_test_enqueue();
check( ! array_key_exists( 'd3Defaults', $cfg ), 'missing defaults file → no d3Defaults key' );
check( isset( $cfg['pluginUrl'] ), 'pluginUrl is there regardless' );

// --- 4) The JS version follows every file under assets/js ----------------------------------
$newest = 0;
foreach ( new RecursiveIteratorIterator( new RecursiveDirectoryIterator( HD_DD_DIR . 'assets/js', FilesystemIterator::SKIP_DOTS ) ) as $f ) {
	if ( 'js' === strtolower( $f->getExtension() ) ) {
		$newest = max( $newest, $f->getMTime() );
	}
}
hd_test_enqueue();
$ver = $GLOBALS['hd_test_scripts'][ $H . '-boot' ]['ver'];
check( (string) $newest === $ver, "JS version is the newest assets/js mtime (got $ver, want $newest)" );

$probe = HD_DD_DIR . 'assets/js/designer3/d3-nudge.js';
$was   = filemtime( $probe );
touch( $probe, $newest + 1000 );
clearstatcache();
hd_test_enqueue();
$moved = $GLOBALS['hd_test_scripts'][ $H . '-d3nudge' ]['ver'];
touch( $probe, $was );
clearstatcache();
check( (string) ( $newest + 1000 ) === $moved, 'editing a designer3 file changes the JS version' );

// --- 5) A folder that can't be read falls back to the plugin version (no fatal) -------------
// A stream wrapper that says "a folder" but refuses to open it: the directory iterator throws.
class HD_Test_Unreadable_Dir {
	public $context;
	public function url_stat( $path, $flags ) { return array( 'mode' => 040755 ); }
	public function dir_opendir( $path, $options ) { return false; }
}
stream_wrapper_register( 'hdunreadable', 'HD_Test_Unreadable_Dir' );
check( is_dir( 'hdunreadable://assets/js' ), 'the test folder looks like a folder' );
$fallback = null;
try {
	$fallback = HD_DD_Assets::js_version_of( 'hdunreadable://assets/js' );
} catch ( Throwable $e ) {
	$fallback = 'threw ' . get_class( $e );
}
check( HD_DD_VERSION === $fallback, 'an unreadable assets/js gives HD_DD_VERSION (got ' . var_export( $fallback, true ) . ')' );

hd_test_done( 'assets-designer3' );
