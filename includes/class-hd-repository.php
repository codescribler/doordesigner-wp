<?php
/**
 * Persistence for enquiries. Owns the custom table and all reads/writes.
 * A custom table (not a CPT) keeps the structured design payload queryable and
 * the admin list cheap, while isolating customer PII from the posts table.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Repository {

	const DB_VERSION = '1';

	/** @return string Fully-prefixed table name. */
	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'hd_enquiries';
	}

	/**
	 * Create / migrate the table via dbDelta.
	 * design + customer + payload are stored as JSON longtext so the schema
	 * never needs to change when Endurance adds options.
	 */
	public static function create_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table           = self::table();
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			reference VARCHAR(32) NOT NULL,
			created_at DATETIME NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'new',
			customer_name VARCHAR(190) NOT NULL DEFAULT '',
			customer_email VARCHAR(190) NOT NULL DEFAULT '',
			customer_phone VARCHAR(40) NOT NULL DEFAULT '',
			customer_postcode VARCHAR(16) NOT NULL DEFAULT '',
			design LONGTEXT NULL,
			payload LONGTEXT NULL,
			source_ip VARCHAR(45) NOT NULL DEFAULT '',
			PRIMARY KEY  (id),
			UNIQUE KEY reference (reference),
			KEY created_at (created_at),
			KEY status (status)
		) {$charset_collate};";

		dbDelta( $sql );
	}

	/**
	 * Insert an enquiry.
	 *
	 * @param array $data Pre-sanitised fields plus 'design' (array) and 'payload' (array).
	 * @return array{id:int,reference:string}|WP_Error
	 */
	public function insert( array $data ) {
		global $wpdb;

		$reference = $this->generate_reference();
		$now       = current_time( 'mysql' );

		$ok = $wpdb->insert(
			self::table(),
			array(
				'reference'         => $reference,
				'created_at'        => $now,
				'status'            => 'new',
				'customer_name'     => $data['name'],
				'customer_email'    => $data['email'],
				'customer_phone'    => $data['telephone'],
				'customer_postcode' => $data['postcode'],
				'design'            => wp_json_encode( $data['design'] ),
				'payload'           => wp_json_encode( $data['payload'] ),
				'source_ip'         => $data['source_ip'],
			),
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);

		if ( false === $ok ) {
			return new WP_Error( 'hd_dd_db_insert_failed', __( 'Could not save the enquiry.', 'hd-door-designer' ) );
		}

		return array(
			'id'        => (int) $wpdb->insert_id,
			'reference' => $reference,
		);
	}

	/**
	 * Reference like HD-2026-000123 (year + zero-padded id).
	 * Uses a placeholder while inserting, then a deterministic value derived
	 * from the auto-increment id is applied by callers if they prefer; for v1
	 * we generate up front from a counter option to stay collision-free.
	 */
	private function generate_reference() {
		$year = (int) current_time( 'Y' );
		$seq  = (int) get_option( 'hd_dd_ref_seq', 0 ) + 1;
		update_option( 'hd_dd_ref_seq', $seq, false );
		return sprintf( 'HD-%d-%06d', $year, $seq );
	}

	/** Store the canonical payload once it's been built (needs the reference from insert). */
	public function update_payload( $id, array $payload ) {
		global $wpdb;
		return $wpdb->update(
			self::table(),
			array( 'payload' => wp_json_encode( $payload ) ),
			array( 'id' => (int) $id ),
			array( '%s' ),
			array( '%d' )
		);
	}

	/** @return array Row objects, newest first. */
	public function list( $limit = 100, $offset = 0 ) {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		return $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$table} ORDER BY created_at DESC LIMIT %d OFFSET %d", $limit, $offset )
		);
	}

	/** @return object|null */
	public function get( $id ) {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", (int) $id ) );
	}

	/** @return int */
	public function count() {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	}
}
