<?php
/**
 * Saved designs are told apart from enquiries in wp-admin.  Run: php tests/php/admin-kind.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-admin.php';
hd_test_reset();

check( '' === HD_DD_Admin::kind_badge( 'enquiry' ), 'an enquiry has no badge' );
check( '' === HD_DD_Admin::kind_badge( null ), 'a row from before the column existed has no badge' );
$badge = HD_DD_Admin::kind_badge( 'save' );
check( false !== strpos( $badge, 'Saved, no price requested' ), 'a save is labelled (got ' . $badge . ')' );
check( 0 === strpos( $badge, '<br><span' ), 'the badge is markup the list can print as is' );

check( 'save' === HD_DD_Admin::list_kind( 'save' ), 'filter: saves' );
check( 'enquiry' === HD_DD_Admin::list_kind( 'ENQUIRY' ), 'filter: enquiries, any case' );
check( '' === HD_DD_Admin::list_kind( 'drop table' ), 'anything else means everything' );
check( '' === HD_DD_Admin::list_kind( array( 'save' ) ), 'an array means everything' );

hd_test_done( 'admin-kind.test.php' );
