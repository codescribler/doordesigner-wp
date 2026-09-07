<?php
/**
 * GET /nonce hands the browser a fresh REST nonce so a designer tab left open past
 * the nonce lifetime can heal itself instead of failing with "Cookie check failed".
 * Run: php tests/php/nonce-endpoint.test.php
 */
require __DIR__ . '/wp-stubs.php';

hd_test_reset();
$enq = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
$enq->register_routes();

// --- Registered as a public GET ---------------------------------------------------------
$routes = $GLOBALS['hd_test_routes'];
check( isset( $routes['/nonce'] ), '/nonce route registered' );
$r = isset( $routes['/nonce'] ) ? $routes['/nonce'] : array();
check( isset( $r['methods'] ) && 'GET' === $r['methods'], 'nonce route is GET' );
check( isset( $r['permission_callback'] ) && '__return_true' === $r['permission_callback'], 'nonce route is public (the nonce is already in the public page HTML)' );
check( isset( $r['callback'] ) && is_callable( $r['callback'] ), 'nonce route has a callable' );

// --- Logged-out visitor (the customer): nonce for user 0, never cached ------------------
$res = $enq->rest_get_nonce( hd_test_request( 'GET', '/hd-door-designer/v1/nonce' ) );
check( $res instanceof WP_REST_Response && 200 === $res->get_status(), 'returns 200' );
$data = $res instanceof WP_REST_Response ? $res->get_data() : array();
check( isset( $data['nonce'] ) && 'test-nonce-uid0' === $data['nonce'], 'returns the wp_rest nonce for the anonymous user' );
$headers = $res instanceof WP_REST_Response ? $res->get_headers() : array();
check( isset( $headers['Cache-Control'] ) && false !== strpos( $headers['Cache-Control'], 'no-store' ), 'response is marked no-store' );

// --- Logged-in visitor (e.g. an admin testing): core resets the user to 0 on nonce-less
//     REST calls, so the endpoint restores the cookie user first — otherwise the nonce
//     it hands back would never verify for them.
$GLOBALS['hd_test_cookie_uid'] = 5;
$GLOBALS['hd_test_user_id']    = 0;
$res  = $enq->rest_get_nonce( hd_test_request( 'GET', '/hd-door-designer/v1/nonce' ) );
$data = $res instanceof WP_REST_Response ? $res->get_data() : array();
check( isset( $data['nonce'] ) && 'test-nonce-uid5' === $data['nonce'], 'a logged-in visitor gets a nonce bound to their own session' );

hd_test_done( 'nonce-endpoint.test.php' );
