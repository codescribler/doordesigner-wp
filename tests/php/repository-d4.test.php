<?php
/**
 * Designer 4 doors are stored by email: listed per person, soft-removed, and step times written once.
 * Run: php tests/php/repository-d4.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_d4_row( array $extra = array() ) {
	return array_merge( array(
		'name' => '', 'email' => 'nicola@example.com', 'telephone' => '', 'postcode' => '',
		'design_name' => 'Etna in French Navy', 'design' => array( 'Door Design' => array( 'label' => 'Etna', 'id' => 1 ) ),
		'payload' => array(), 'source_ip' => '203.0.113.5', 'kind' => 'save', 'flow' => 'designer4',
	), $extra );
}
/** Give a stored row a creation time so "newest first" is not decided by the clock. */
function hd_d4_age( $id, $at ) {
	global $wpdb;
	$wpdb->rows[ $id - 1 ]['created_at'] = $at;
}
function hd_d4_ids( array $rows ) {
	return array_map( function ( $r ) { return (int) $r->id; }, $rows );
}

hd_test_reset();
global $wpdb;
$repo = new HD_DD_Repository();

check( '5' === HD_DD_Repository::DB_VERSION, 'schema version bumped so the new columns are added on update' );

$a = $repo->insert( hd_d4_row() );
$b = $repo->insert( hd_d4_row( array( 'design_name' => 'Ketu in Sage' ) ) );
$c = $repo->insert( hd_d4_row( array( 'flow' => 'swipe2' ) ) );          // a Designer 3 save, same email
$d = $repo->insert( hd_d4_row( array( 'email' => 'other@example.com' ) ) ); // someone else's door
hd_d4_age( $a['id'], '2026-11-01 10:00:00' );
hd_d4_age( $b['id'], '2026-11-02 10:00:00' );
hd_d4_age( $c['id'], '2026-11-03 10:00:00' );
hd_d4_age( $d['id'], '2026-11-04 10:00:00' );

check( array( $b['id'], $a['id'] ) === hd_d4_ids( $repo->list_by_email( 'nicola@example.com' ) ), 'lists only designer4 rows for the email, newest first' );
check( array( $c['id'] ) === hd_d4_ids( $repo->list_by_email( 'nicola@example.com', 'swipe2' ) ), 'another flow can be asked for' );
check( array() === $repo->list_by_email( '' ), 'no email lists nothing' );
check( array() === $repo->list_by_email( 'nobody@example.com' ), 'an unknown email lists nothing' );
check( array( $b['id'], $a['id'] ) === hd_d4_ids( $repo->list_by_email( '  Nicola@Example.COM ' ) ), 'email match ignores case' );

check( true === $repo->mark_removed( $a['id'] ), 'mark_removed reports success' );
check( array( $b['id'] ) === hd_d4_ids( $repo->list_by_email( 'nicola@example.com' ) ), 'a removed row is hidden' );
check( array( $b['id'], $a['id'] ) === hd_d4_ids( $repo->list_by_email( 'nicola@example.com', 'designer4', true ) ), 'a removed row is shown with include_removed' );
$first = $wpdb->rows[ $a['id'] - 1 ]['removed_at'];
check( ! empty( $first ), 'removed_at is set' );
$wpdb->rows[ $a['id'] - 1 ]['removed_at'] = '2026-11-05 09:00:00';
check( true === $repo->mark_removed( $a['id'] ) && '2026-11-05 09:00:00' === $wpdb->rows[ $a['id'] - 1 ]['removed_at'], 'removing twice keeps the first time' );
check( false === $repo->mark_removed( 999 ), 'removing a row that does not exist fails' );

check( true === $repo->mark_step( $b['id'], 'doorway_at' ), 'mark_step reports success' );
check( ! empty( $wpdb->rows[ $b['id'] - 1 ]['doorway_at'] ), 'the step time is written' );
$wpdb->rows[ $b['id'] - 1 ]['doorway_at'] = '2026-11-05 09:00:00';
check( true === $repo->mark_step( $b['id'], 'doorway_at' ) && '2026-11-05 09:00:00' === $wpdb->rows[ $b['id'] - 1 ]['doorway_at'], 'mark_step writes once' );
check( true === $repo->mark_step( $b['id'], 'details_at' ) && ! empty( $wpdb->rows[ $b['id'] - 1 ]['details_at'] ), 'details_at is a step too' );
check( false === $repo->mark_step( $b['id'], 'removed_at' ) && empty( $wpdb->rows[ $b['id'] - 1 ]['removed_at'] ), 'only the two step columns can be written' );
check( false === $repo->mark_step( $b['id'], 'status' ) && 'new' === $wpdb->rows[ $b['id'] - 1 ]['status'], 'no other column can be written' );
check( false === $repo->mark_step( 999, 'doorway_at' ), 'a step on a row that does not exist fails' );

check( 1 === $repo->update_row( $b['id'], array( 'design' => array( 'x' => 1 ), 'payload' => array( 'y' => 2 ), 'design_name' => 'Etna', 'customer_name' => 'Nicola', 'customer_phone' => '0777', 'customer_postcode' => 'AL1 1AA' ) ), 'update_row writes design, payload, name and customer fields' );

// --- Old schema: the new columns are missing -----------------------------------------------
hd_test_reset();
$repo = new HD_DD_Repository();
update_option( 'hd_dd_db_version', '4' );
$wpdb->columns = array( 'id', 'reference', 'token', 'kind', 'flow' );
$r = $repo->insert( hd_d4_row() );
check( ! is_wp_error( $r ) && 1 === count( $wpdb->rows ), 'insert keeps working while the new columns are missing' );
check( ! array_key_exists( 'kind', $wpdb->rows[0] ) && ! array_key_exists( 'flow', $wpdb->rows[0] ), 'and leaves out kind and flow' );
HD_DD_Repository::maybe_upgrade();
check( '4' === get_option( 'hd_dd_db_version' ), 'kind and flow alone no longer complete the upgrade' );
$wpdb->columns = array( 'id', 'reference', 'token', 'kind', 'flow', 'removed_at', 'doorway_at' );
HD_DD_Repository::maybe_upgrade();
check( '4' === get_option( 'hd_dd_db_version' ), 'two of the three new columns are not enough' );
$wpdb->columns = array( 'id', 'reference', 'token', 'kind', 'flow', 'removed_at', 'doorway_at', 'details_at' );
HD_DD_Repository::maybe_upgrade();
check( '5' === get_option( 'hd_dd_db_version' ), 'all new columns present: the version is stored' );
check( false !== strpos( end( $GLOBALS['hd_test_dbdelta'] ), 'KEY customer_email (customer_email)' ), 'the schema indexes customer_email' );

hd_test_done( 'repository-d4.test.php' );
