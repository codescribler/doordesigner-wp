<?php
/**
 * Minimal WordPress stand-ins so the enquiry pipeline (REST handler → repository →
 * mailer → failure log) runs under plain PHP: `php tests/php/<name>.test.php`.
 *
 * Everything the plugin touches is recorded in globals the tests assert against:
 *   $wpdb->rows                – every inserted row (id auto-assigned)
 *   $GLOBALS['hd_test_mail']   – every wp_mail() call
 *   $GLOBALS['hd_test_routes'] – every register_rest_route() call, keyed by route
 * Test-only code lives here, never in the plugin.
 */

define( 'ABSPATH', __DIR__ . '/' );
define( 'HD_DD_DIR', dirname( __DIR__, 2 ) . '/' );
define( 'HD_DD_FILE', HD_DD_DIR . 'hd-door-designer.php' );
define( 'HD_DD_URL', 'https://example.test/wp-content/plugins/hd-door-designer/' );
define( 'HD_DD_BASENAME', 'hd-door-designer/hd-door-designer.php' );
define( 'HD_DD_SLUG', 'hd-door-designer' );
define( 'HD_DD_VERSION', 'test' );
define( 'HD_DD_REST_NS', 'hd-door-designer/v1' );

$hd_test_tmp = sys_get_temp_dir() . '/hd-dd-tests-' . getmypid();
@mkdir( $hd_test_tmp, 0777, true );
define( 'HD_DD_DATA_DIR', $hd_test_tmp . '/data/' ); // no catalogue file → labels fall back to client-sent.
define( 'HD_TEST_ERROR_LOG', $hd_test_tmp . '/php-error.log' );
ini_set( 'error_log', HD_TEST_ERROR_LOG );

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
$hd_test_fails = 0;
function check( $cond, $msg ) {
	global $hd_test_fails;
	if ( ! $cond ) {
		fwrite( STDERR, "FAIL: $msg\n" );
		$hd_test_fails++;
	}
}
function hd_test_done( $name ) {
	global $hd_test_fails;
	if ( $hd_test_fails ) {
		fwrite( STDERR, "$name: $hd_test_fails failure(s)\n" );
		exit( 1 );
	}
	echo "$name: all assertions passed\n";
}

// ---------------------------------------------------------------------------
// State + reset
// ---------------------------------------------------------------------------
function hd_test_reset() {
	global $wpdb;
	$wpdb                          = new HD_Test_WPDB();
	$GLOBALS['hd_test_mail']       = array();
	$GLOBALS['hd_test_options']    = array();
	$GLOBALS['hd_test_transients'] = array();
	$GLOBALS['hd_test_routes']     = array();
	$GLOBALS['hd_test_hooks']      = array();
	$GLOBALS['hd_test_user_id']    = 0;
	$GLOBALS['hd_test_cookie_uid'] = false;
	$_SERVER['REMOTE_ADDR']        = '203.0.113.5';
	if ( is_file( HD_TEST_ERROR_LOG ) ) {
		unlink( HD_TEST_ERROR_LOG );
	}
}
function hd_test_error_log() {
	return is_file( HD_TEST_ERROR_LOG ) ? file_get_contents( HD_TEST_ERROR_LOG ) : '';
}

/** Build a REST request the way WP does for a JSON POST from the designer. */
function hd_test_request( $method, $route, $json = null, array $headers = array() ) {
	$r = new WP_REST_Request( $method, $route );
	if ( null !== $json ) {
		$r->set_header( 'Content-Type', 'application/json' );
		$r->set_body( is_string( $json ) ? $json : json_encode( $json ) );
	}
	foreach ( $headers as $k => $v ) {
		$r->set_header( $k, $v );
	}
	return $r;
}

/** What WP_REST_Server::error_to_response() produces for a WP_Error. */
function hd_test_error_to_response( WP_Error $e ) {
	$data   = $e->get_error_data();
	$status = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 500;
	return new WP_REST_Response( array( 'code' => $e->get_error_code(), 'message' => $e->get_error_message(), 'data' => $data ), $status );
}

// ---------------------------------------------------------------------------
// WP classes
// ---------------------------------------------------------------------------
class WP_REST_Server {
	const READABLE  = 'GET';
	const CREATABLE = 'POST';
}

class WP_Error {
	private $code; private $message; private $data;
	public function __construct( $code = '', $message = '', $data = '' ) { $this->code = $code; $this->message = $message; $this->data = $data; }
	public function get_error_code() { return $this->code; }
	public function get_error_message() { return $this->message; }
	public function get_error_data() { return $this->data; }
}

class WP_REST_Response {
	private $data; private $status; private $headers = array();
	public function __construct( $data = null, $status = 200, $headers = array() ) { $this->data = $data; $this->status = (int) $status; $this->headers = $headers; }
	public function header( $k, $v ) { $this->headers[ $k ] = $v; }
	public function get_headers() { return $this->headers; }
	public function get_status() { return $this->status; }
	public function get_data() { return $this->data; }
}

class WP_REST_Request implements ArrayAccess {
	private $method; private $route; private $headers = array(); private $body = ''; private $params = array();
	public function __construct( $method = 'GET', $route = '' ) { $this->method = strtoupper( $method ); $this->route = $route; }
	private static function canon( $k ) { return strtolower( str_replace( '-', '_', $k ) ); }
	public function set_header( $k, $v ) { $this->headers[ self::canon( $k ) ] = $v; }
	public function get_header( $k ) { $k = self::canon( $k ); return isset( $this->headers[ $k ] ) ? $this->headers[ $k ] : null; }
	public function set_body( $b ) { $this->body = (string) $b; }
	public function get_body() { return $this->body; }
	public function get_json_params() { $d = json_decode( $this->body, true ); return is_array( $d ) ? $d : null; }
	public function set_param( $k, $v ) { $this->params[ $k ] = $v; }
	public function get_params() { $j = $this->get_json_params(); return array_merge( $this->params, is_array( $j ) ? $j : array() ); }
	public function get_route() { return $this->route; }
	public function get_method() { return $this->method; }
	#[\ReturnTypeWillChange] public function offsetExists( $k ) { $p = $this->get_params(); return isset( $p[ $k ] ); }
	#[\ReturnTypeWillChange] public function offsetGet( $k ) { $p = $this->get_params(); return isset( $p[ $k ] ) ? $p[ $k ] : null; }
	#[\ReturnTypeWillChange] public function offsetSet( $k, $v ) { $this->params[ $k ] = $v; }
	#[\ReturnTypeWillChange] public function offsetUnset( $k ) { unset( $this->params[ $k ] ); }
}

class HD_Test_WPDB {
	public $prefix = 'wp_'; public $insert_id = 0; public $rows = array(); public $last_error = '';
	public function insert( $table, $data, $format = null ) {
		$this->insert_id = count( $this->rows ) + 1;
		$data['id']      = $this->insert_id;
		$this->rows[]    = $data;
		return 1;
	}
	public function update( $table, $data, $where, $f = null, $wf = null ) {
		foreach ( $this->rows as &$r ) {
			if ( isset( $where['id'] ) && $r['id'] == $where['id'] ) { $r = array_merge( $r, $data ); return 1; }
		}
		return 0;
	}
	public function prepare( $q ) { return $q; }
	public function get_row( $q ) { return null; }
	public function get_results( $q ) { return array(); }
	public function get_var( $q ) { return count( $this->rows ); }
	public function query( $q ) { return 0; }
	public function get_charset_collate() { return ''; }
}

// ---------------------------------------------------------------------------
// WP functions (only what the plugin calls)
// ---------------------------------------------------------------------------
function __return_true() { return true; }
function __( $t, $d = null ) { return $t; }
function esc_html__( $t, $d = null ) { return $t; }
function esc_attr__( $t, $d = null ) { return $t; }
function esc_html( $t ) { return htmlspecialchars( (string) $t, ENT_QUOTES, 'UTF-8' ); }
function esc_attr( $t ) { return htmlspecialchars( (string) $t, ENT_QUOTES, 'UTF-8' ); }
function esc_url( $u ) { return (string) $u; }
function esc_url_raw( $u ) { return trim( (string) $u ); }
function wp_kses( $s, $allowed ) { return strip_tags( (string) $s ); }
function sanitize_text_field( $s ) { return trim( preg_replace( '/[\r\n\t ]+/', ' ', strip_tags( (string) $s ) ) ); }
function sanitize_email( $e ) { return (string) filter_var( (string) $e, FILTER_SANITIZE_EMAIL ); }
function is_email( $e ) { return false !== filter_var( (string) $e, FILTER_VALIDATE_EMAIL ); }
function sanitize_file_name( $n ) { return preg_replace( '/[^A-Za-z0-9._-]/', '-', (string) $n ); }
function sanitize_key( $k ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $k ) ); }
function wp_unslash( $v ) { return is_array( $v ) ? array_map( 'wp_unslash', $v ) : stripslashes( (string) $v ); }
function wp_json_encode( $v, $flags = 0 ) { return json_encode( $v, $flags ); }
function wp_parse_args( $args, $defaults = array() ) { return array_merge( $defaults, (array) $args ); }
function trailingslashit( $s ) { return rtrim( (string) $s, '/\\' ) . '/'; }
function absint( $n ) { return abs( (int) $n ); }
function is_wp_error( $t ) { return $t instanceof WP_Error; }
function current_time( $type ) { return 'mysql' === $type ? gmdate( 'Y-m-d H:i:s' ) : ( 'Y' === $type ? gmdate( 'Y' ) : time() ); }
function wp_generate_password( $len = 12, $special = true, $extra = false ) { $c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; $o = ''; for ( $i = 0; $i < $len; $i++ ) { $o .= $c[ random_int( 0, strlen( $c ) - 1 ) ]; } return $o; }
function home_url( $path = '' ) { return 'https://example.test' . $path; }
function get_permalink( $id ) { return 'https://example.test/door-designer/'; }
function wp_parse_url( $url, $component = -1 ) { return parse_url( (string) $url, $component ); }
function add_query_arg() { $a = func_get_args(); if ( is_array( $a[0] ) ) { $params = $a[0]; $url = isset( $a[1] ) ? $a[1] : ''; } else { $params = array( $a[0] => $a[1] ); $url = isset( $a[2] ) ? $a[2] : ''; } return $url . ( false === strpos( $url, '?' ) ? '?' : '&' ) . http_build_query( $params ); }
function wp_upload_dir() { global $hd_test_tmp; return array( 'basedir' => $hd_test_tmp . '/uploads', 'baseurl' => 'https://example.test/wp-content/uploads', 'error' => false ); }
function wp_mkdir_p( $d ) { return is_dir( $d ) || mkdir( $d, 0777, true ); }
function wp_delete_file( $f ) { @unlink( $f ); }
function get_option( $k, $default = false ) { return array_key_exists( $k, $GLOBALS['hd_test_options'] ) ? $GLOBALS['hd_test_options'][ $k ] : $default; }
function update_option( $k, $v, $autoload = null ) { $GLOBALS['hd_test_options'][ $k ] = $v; return true; }
function add_option( $k, $v, $d = '', $autoload = 'yes' ) { if ( ! array_key_exists( $k, $GLOBALS['hd_test_options'] ) ) { $GLOBALS['hd_test_options'][ $k ] = $v; } return true; }
function get_transient( $k ) { $t = $GLOBALS['hd_test_transients']; if ( ! isset( $t[ $k ] ) ) { return false; } if ( $t[ $k ]['expires'] && $t[ $k ]['expires'] < time() ) { return false; } return $t[ $k ]['value']; }
function set_transient( $k, $v, $exp = 0 ) { $GLOBALS['hd_test_transients'][ $k ] = array( 'value' => $v, 'expires' => $exp ? time() + $exp : 0 ); return true; }
function delete_transient( $k ) { unset( $GLOBALS['hd_test_transients'][ $k ] ); return true; }
function wp_mail( $to, $subject, $message, $headers = '', $attachments = array() ) { $GLOBALS['hd_test_mail'][] = compact( 'to', 'subject', 'message', 'headers', 'attachments' ); return true; }
function wp_create_nonce( $action = -1 ) { return 'test-nonce-uid' . (int) $GLOBALS['hd_test_user_id']; }
function wp_verify_nonce( $nonce, $action = -1 ) { return $nonce === wp_create_nonce( $action ) ? 1 : false; }
function wp_validate_auth_cookie( $cookie = '', $scheme = '' ) { return $GLOBALS['hd_test_cookie_uid']; }
function wp_set_current_user( $id ) { $GLOBALS['hd_test_user_id'] = (int) $id; }
function get_current_user_id() { return (int) $GLOBALS['hd_test_user_id']; }
function register_rest_route( $ns, $route, $args ) { $GLOBALS['hd_test_routes'][ $route ] = $args; return true; }
function add_action( $hook, $cb, $prio = 10, $n = 1 ) { return add_filter( $hook, $cb, $prio, $n ); }
function add_filter( $hook, $cb, $prio = 10, $n = 1 ) { $GLOBALS['hd_test_hooks'][ $hook ][] = array( 'cb' => $cb, 'n' => $n ); return true; }
function do_action( $hook ) { $args = array_slice( func_get_args(), 1 ); foreach ( isset( $GLOBALS['hd_test_hooks'][ $hook ] ) ? $GLOBALS['hd_test_hooks'][ $hook ] : array() as $h ) { call_user_func_array( $h['cb'], array_slice( $args, 0, $h['n'] ) ); } }
function apply_filters( $hook, $value ) { $args = array_slice( func_get_args(), 1 ); foreach ( isset( $GLOBALS['hd_test_hooks'][ $hook ] ) ? $GLOBALS['hd_test_hooks'][ $hook ] : array() as $h ) { $args[0] = call_user_func_array( $h['cb'], array_slice( $args, 0, $h['n'] ) ); } return $args[0]; }

// ---------------------------------------------------------------------------
// Plugin classes shared by every test (a test requires anything extra itself)
// ---------------------------------------------------------------------------
require_once HD_DD_DIR . 'includes/class-hd-repository.php';
require_once HD_DD_DIR . 'includes/class-hd-catalogue.php';
require_once HD_DD_DIR . 'includes/class-hd-lock-deriver.php';
require_once HD_DD_DIR . 'includes/class-hd-mailer.php';
require_once HD_DD_DIR . 'includes/class-hd-enquiry.php';
require_once HD_DD_DIR . 'includes/class-hd-plugin.php';

hd_test_reset();
