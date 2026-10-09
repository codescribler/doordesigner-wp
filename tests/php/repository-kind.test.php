<?php
/**
 * A save and its later quote request are one row: `kind` moves from save to enquiry.
 * Run: php tests/php/repository-kind.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_row( array $extra = array() ) {
	return array_merge( array(
		'name' => '', 'email' => 'jo@example.com', 'telephone' => '', 'postcode' => '',
		'design_name' => 'Ketu in Sage', 'design' => array( 'Door Design' => array( 'label' => 'Ketu', 'id' => 1 ) ),
		'payload' => array(), 'source_ip' => '203.0.113.5',
	), $extra );
}

hd_test_reset();
global $wpdb;
$repo = new HD_DD_Repository();

$a = $repo->insert( hd_row() );
check( 'enquiry' === $wpdb->rows[0]['kind'], 'kind defaults to enquiry' );
check( '' === $wpdb->rows[0]['flow'], 'flow defaults to empty' );

$b = $repo->insert( hd_row( array( 'kind' => 'save', 'flow' => 'swipe2' ) ) );
check( 'save' === $wpdb->rows[1]['kind'] && 'swipe2' === $wpdb->rows[1]['flow'], 'a save row stores kind and flow' );

$repo->insert( hd_row( array( 'kind' => 'nonsense' ) ) );
check( 'enquiry' === $wpdb->rows[2]['kind'], 'an unknown kind is stored as enquiry' );

$found = $repo->get_by_token( $b['token'] );
check( $found && (int) $found->id === $b['id'], 'the row is found by its token' );
check( null === $repo->get_by_token( 'nope' ), 'an unknown token finds nothing' );

$n = $repo->update_row( $b['id'], array(
	'customer_name' => 'Jo', 'customer_postcode' => 'AL1 1AA', 'kind' => 'enquiry',
	'payload' => array( 'reference' => $b['reference'] ), 'reference' => 'HACK', 'token' => 'HACK',
) );
check( 1 === $n, 'update_row reports the row it changed' );
check( 'Jo' === $wpdb->rows[1]['customer_name'] && 'enquiry' === $wpdb->rows[1]['kind'], 'fields are written' );
check( $b['reference'] === $wpdb->rows[1]['reference'] && $b['token'] === $wpdb->rows[1]['token'], 'reference and token cannot be overwritten' );
check( is_string( $wpdb->rows[1]['payload'] ) && false !== strpos( $wpdb->rows[1]['payload'], $b['reference'] ), 'arrays are stored as JSON' );
check( 0 === $repo->update_row( $b['id'], array( 'reference' => 'HACK' ) ), 'nothing writable: nothing done' );

check( array( 'enquiry' => 0, 'save' => 0 ) === $repo->count_by_kind(), 'count_by_kind always has both keys' );
check( '4' === HD_DD_Repository::DB_VERSION, 'schema version bumped so the columns are added on update' );

hd_test_done( 'repository-kind.test.php' );
