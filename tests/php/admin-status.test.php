<?php
/**
 * The enquiries list must make a flagged or failed row impossible to mistake for a
 * normal one.  Run: php tests/php/admin-status.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-admin.php';

check( '' === HD_DD_Admin::status_label( 'new', array() ), 'a normal enquiry has no label' );
check( '' === HD_DD_Admin::status_label( '', null ), 'a legacy/empty status has no label' );

check( 'Possible bot (hidden field filled — usually just autofill; treat as real)' === HD_DD_Admin::status_label( 'flagged', array( 'flags' => array( 'honeypot' ) ) ), 'flagged rows explain the honeypot' );

$failed = array( 'failure' => array( 'code' => 'hd_dd_validation', 'message' => 'Please check the highlighted fields.', 'fields' => array( 'postcode' => 'Please enter a valid UK postcode.' ) ) );
check( 'FAILED — Please check the highlighted fields. postcode: Please enter a valid UK postcode.' === HD_DD_Admin::status_label( 'failed', $failed ), 'failed rows show the reason and field errors (got "' . HD_DD_Admin::status_label( 'failed', $failed ) . '")' );
check( 'FAILED — Cookie check failed' === HD_DD_Admin::status_label( 'failed', array( 'failure' => array( 'code' => 'rest_cookie_invalid_nonce', 'message' => 'Cookie check failed' ) ) ), 'failed rows without field errors show just the message' );
check( 'FAILED' === HD_DD_Admin::status_label( 'failed', null ), 'failed rows with no payload still say FAILED' );

hd_test_done( 'admin-status.test.php' );
