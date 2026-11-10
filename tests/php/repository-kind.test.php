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

check( array( 'enquiry' => 0, 'save' => 0, 'callback' => 0 ) === $repo->count_by_kind(), 'count_by_kind always has all three keys' );
check( '5' === HD_DD_Repository::DB_VERSION, 'schema version bumped so the columns are added on update' );

// --- Schema upgrade: the version only moves once the new columns really exist (A4) ----------
hd_test_reset();
$repo = new HD_DD_Repository();
update_option( 'hd_dd_db_version', '3' );
$wpdb->columns = array( 'id', 'reference', 'token' ); // dbDelta ran but did not add kind / flow.
HD_DD_Repository::maybe_upgrade();
check( 1 === count( $GLOBALS['hd_test_dbdelta'] ), 'the upgrade runs dbDelta' );
check( '3' === get_option( 'hd_dd_db_version' ), 'columns missing: the version is left alone' );
$r = $repo->insert( hd_row( array( 'kind' => 'save', 'flow' => 'swipe2' ) ) );
check( ! is_wp_error( $r ) && 1 === count( $wpdb->rows ) && 'jo@example.com' === $wpdb->rows[0]['customer_email'], 'an insert still succeeds on the old schema' );
check( ! array_key_exists( 'kind', $wpdb->rows[0] ) && ! array_key_exists( 'flow', $wpdb->rows[0] ), 'and leaves out the columns that are not there' );
check( count( $wpdb->last_insert_format ) === count( $wpdb->rows[0] ) - 1, 'one format per column written' );
HD_DD_Repository::maybe_upgrade();
check( 2 === count( $GLOBALS['hd_test_dbdelta'] ) && '3' === get_option( 'hd_dd_db_version' ), 'it tries again on the next load' );
$wpdb->columns = array( 'id', 'reference', 'token', 'kind' );
HD_DD_Repository::maybe_upgrade();
check( '3' === get_option( 'hd_dd_db_version' ), 'one of the two columns is not enough' );
$wpdb->columns = array( 'id', 'reference', 'token', 'kind', 'flow', 'removed_at', 'doorway_at', 'details_at' );
HD_DD_Repository::maybe_upgrade();
check( HD_DD_Repository::DB_VERSION === get_option( 'hd_dd_db_version' ), 'columns present: the version is stored' );
$repo->insert( hd_row( array( 'kind' => 'save', 'flow' => 'swipe2' ) ) );
check( 'save' === $wpdb->rows[1]['kind'] && 'swipe2' === $wpdb->rows[1]['flow'], 'and inserts write kind and flow again' );
check( count( $wpdb->last_insert_format ) === count( $wpdb->rows[1] ) - 1, 'one format per column written' );
$calls = count( $GLOBALS['hd_test_dbdelta'] );
HD_DD_Repository::maybe_upgrade();
check( $calls === count( $GLOBALS['hd_test_dbdelta'] ), 'once current, nothing runs' );

// --- The callback kind (Designer 3) ---------------------------------------------------------
hd_test_reset();
$repo = new HD_DD_Repository();
check( array( 'save', 'enquiry', 'callback' ) === HD_DD_Repository::KINDS, 'KINDS lists the three kinds' );
$c = $repo->insert( hd_row( array( 'kind' => 'callback' ) ) );
check( 'callback' === $wpdb->rows[0]['kind'], 'a callback row stores kind callback' );
$repo->insert( hd_row( array( 'kind' => 'nonsense' ) ) );
check( 'enquiry' === $wpdb->rows[1]['kind'], 'an unknown kind is still stored as enquiry' );
$s = $repo->insert( hd_row( array( 'kind' => 'save' ) ) );
check( 1 === $repo->claim_as_kind( $s['id'], 'callback', array( 'customer_phone' => '01727 000000' ) ), 'claim_as_kind claims a save as a callback' );
check( 'callback' === $wpdb->rows[2]['kind'] && '01727 000000' === $wpdb->rows[2]['customer_phone'], 'and writes kind and fields' );
check( 0 === $repo->claim_as_kind( $s['id'], 'callback', array() ), 'a second claim returns 0' );
$s2 = $repo->insert( hd_row( array( 'kind' => 'save' ) ) );
check( 1 === $repo->claim_as_enquiry( $s2['id'], array( 'customer_name' => 'Jo' ) ) && 'enquiry' === $wpdb->rows[3]['kind'], 'claim_as_enquiry still works' );
check( 0 === $repo->claim_as_kind( $s2['id'], 'callback', array() ) && 'enquiry' === $wpdb->rows[3]['kind'], 'an enquiry cannot be claimed as a callback' );
check( 0 === $repo->claim_as_enquiry( $s['id'], array() ) && 'callback' === $wpdb->rows[2]['kind'], 'a callback cannot be claimed as an enquiry' );
check( false === $repo->claim_as_kind( $s['id'], 'save', array() ) || 0 === $repo->claim_as_kind( $s['id'], 'save', array() ), 'cannot claim as save' );
check( 'callback' === $wpdb->rows[2]['kind'], 'and the row is unchanged' );

hd_test_done( 'repository-kind.test.php' );
