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

// The list shows the latest 200 rows; say so when there are more.
check( 200 === HD_DD_Admin::LIST_LIMIT, 'the list shows 200 rows' );
check( '' === HD_DD_Admin::limit_note( 0 ) && '' === HD_DD_Admin::limit_note( 200 ), 'no note while everything fits' );
$note = HD_DD_Admin::limit_note( 201 );
check( false !== strpos( $note, 'Showing the latest 200.' ), 'a note when the total is above 200 (got ' . $note . ')' );
$counts = array( 'enquiry' => 250, 'save' => 30 );
check( 280 === HD_DD_Admin::list_total( $counts, '' ) && 250 === HD_DD_Admin::list_total( $counts, 'enquiry' ) && 30 === HD_DD_Admin::list_total( $counts, 'save' ), 'the total follows the filter' );
check( '' === HD_DD_Admin::limit_note( HD_DD_Admin::list_total( $counts, 'save' ) ), 'so a short filtered list has no note' );

// --- Call backs (Designer 3) ----------------------------------------------------------------
$cb = HD_DD_Admin::kind_badge( 'callback' );
check( false !== strpos( $cb, 'Call back requested' ) && 0 === strpos( $cb, '<br><span' ), 'a callback is labelled (got ' . $cb . ')' );
check( 'callback' === HD_DD_Admin::list_kind( 'Callback' ), 'filter: call backs' );
$counts = array( 'enquiry' => 5, 'save' => 3, 'callback' => 2 );
check( 2 === HD_DD_Admin::list_total( $counts, 'callback' ) && 5 === HD_DD_Admin::list_total( $counts, 'enquiry' ), 'callback total is separate from enquiries' );
check( 10 === HD_DD_Admin::list_total( $counts, '' ), 'All includes call backs' );
$links = HD_DD_Admin::filter_links( '/admin', '', $counts );
check( false !== strpos( $links, 'Call backs' ) && false !== strpos( $links, '(2)' ) && false !== strpos( $links, 'kind=callback' ), 'the list shows a Call backs (2) filter' );
check( false !== strpos( $links, 'Enquiries <span class="count">(5)</span>' ) && false !== strpos( $links, 'All <span class="count">(10)</span>' ), 'Enquiries excludes call backs, All includes them' );

hd_test_done( 'admin-kind.test.php' );
