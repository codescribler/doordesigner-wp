<?php
/**
 * The Manager URL setting: https only (anything else keeps the old value and shows a settings
 * error), a trailing slash trimmed, and the field says it is the API base ending in /api/v1.
 * Run: php tests/php/admin-manager-url.test.php
 */
require __DIR__ . '/queue-helpers.php';
require_once HD_DD_DIR . 'includes/class-hd-admin.php';

$GLOBALS['hd_test_settings_errors'] = array();
function add_settings_error( $setting, $code, $message, $type = 'error' ) { $GLOBALS['hd_test_settings_errors'][] = compact( 'setting', 'code', 'message', 'type' ); }

hd_test_q_reset( 'k', 'https://old.test/api/v1' );
$admin = new HD_DD_Admin( new HD_DD_Repository() );

$out = $admin->sanitize_settings( array( 'manager_url' => 'http://new.test/api/v1' ) );
check( 'https://old.test/api/v1' === $out['manager_url'], 'an http URL is refused: the previous value is kept (got ' . $out['manager_url'] . ')' );
check( 1 === count( $GLOBALS['hd_test_settings_errors'] ) && 'error' === $GLOBALS['hd_test_settings_errors'][0]['type'], 'and a settings error is shown' );

$GLOBALS['hd_test_settings_errors'] = array();
$out = $admin->sanitize_settings( array( 'manager_url' => 'not a url' ) );
check( 'https://old.test/api/v1' === $out['manager_url'] && 1 === count( $GLOBALS['hd_test_settings_errors'] ), 'something that is not a URL is refused too' );

$GLOBALS['hd_test_settings_errors'] = array();
$out = $admin->sanitize_settings( array( 'manager_url' => ' https://new.test/api/v1/ ' ) );
check( 'https://new.test/api/v1' === $out['manager_url'], 'a trailing slash is trimmed (got ' . $out['manager_url'] . ')' );
check( array() === $GLOBALS['hd_test_settings_errors'], 'no error for an https URL' );

$out = $admin->sanitize_settings( array( 'manager_url' => '' ) );
check( '' === $out['manager_url'] && array() === $GLOBALS['hd_test_settings_errors'], 'a blank URL is allowed (it switches sending off)' );

// The field's description gives the shape (read from the settings page source: rendering it needs
// most of wp-admin).
$src = file_get_contents( HD_DD_DIR . 'includes/class-hd-admin.php' );
check( false !== strpos( $src, 'end in /api/v1, for example https://your-manager.example/api/v1' ), 'the description says the URL must end in /api/v1, with an example shape' );

hd_test_done( 'admin-manager-url' );
