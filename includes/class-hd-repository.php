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

	const DB_VERSION = '4';

	/** @return string Fully-prefixed table name. */
	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'hd_enquiries';
	}

	/**
	 * Run pending migrations on plugin UPDATE (the activation hook only fires on activate,
	 * not on update). dbDelta is idempotent, so we only call it when the stored schema
	 * version differs — cheap on every other load.
	 *
	 * The version is stored only once the columns this version adds are really there. If
	 * dbDelta could not add them, the version stays behind: the next load tries again, and
	 * insert() keeps to the old columns meanwhile so enquiries are still saved.
	 */
	public static function maybe_upgrade() {
		if ( ! self::schema_current() ) {
			self::create_table();
			if ( self::has_columns( array( 'kind', 'flow' ) ) ) {
				update_option( 'hd_dd_db_version', self::DB_VERSION, false );
			}
		}
	}

	/** True when the stored schema version is this code's version (the new columns exist). */
	public static function schema_current() {
		return get_option( 'hd_dd_db_version' ) === self::DB_VERSION;
	}

	/** True when every named column exists on the enquiries table. */
	private static function has_columns( array $columns ) {
		global $wpdb;
		$table = self::table();
		foreach ( $columns as $column ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
			if ( ! $wpdb->get_var( $wpdb->prepare( "SHOW COLUMNS FROM {$table} LIKE %s", $column ) ) ) {
				return false;
			}
		}
		return true;
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

		// token: a random, unguessable retrieval key for the "revisit your design" link.
		// NULL-able so existing rows (pre-migration) stay valid under the UNIQUE index
		// (which permits multiple NULLs, but not multiple empty strings).
		$sql = "CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			reference VARCHAR(32) NOT NULL,
			token VARCHAR(32) NULL DEFAULT NULL,
			created_at DATETIME NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'new',
			customer_name VARCHAR(190) NOT NULL DEFAULT '',
			customer_email VARCHAR(190) NOT NULL DEFAULT '',
			customer_phone VARCHAR(40) NOT NULL DEFAULT '',
			customer_postcode VARCHAR(16) NOT NULL DEFAULT '',
			design_name VARCHAR(120) NOT NULL DEFAULT '',
			kind VARCHAR(10) NOT NULL DEFAULT 'enquiry',
			flow VARCHAR(20) NOT NULL DEFAULT '',
			design LONGTEXT NULL,
			payload LONGTEXT NULL,
			source_ip VARCHAR(45) NOT NULL DEFAULT '',
			PRIMARY KEY  (id),
			UNIQUE KEY reference (reference),
			UNIQUE KEY token (token),
			KEY created_at (created_at),
			KEY status (status),
			KEY kind (kind)
		) {$charset_collate};";

		dbDelta( $sql );
	}

	/**
	 * Insert an enquiry.
	 *
	 * @param array $data Pre-sanitised fields plus 'design' (array), 'payload' (array) and an
	 *                    optional 'status' ('new' by default; 'flagged' for a honeypot hit),
	 *                    plus optional 'kind' and 'flow'.
	 * @return array{id:int,reference:string,token:string}|WP_Error
	 */
	public function insert( array $data ) {
		global $wpdb;

		$reference = $this->generate_reference();
		$token     = $this->generate_token();
		$now       = current_time( 'mysql' );

		$row = array(
			'reference'         => $reference,
			'token'             => $token,
			'created_at'        => $now,
			'status'            => ( isset( $data['status'] ) && '' !== $data['status'] ) ? $data['status'] : 'new',
			'customer_name'     => $data['name'],
			'customer_email'    => $data['email'],
			'customer_phone'    => $data['telephone'],
			'customer_postcode' => $data['postcode'],
			'design_name'       => isset( $data['design_name'] ) ? (string) $data['design_name'] : '',
			'kind'              => ( isset( $data['kind'] ) && 'save' === $data['kind'] ) ? 'save' : 'enquiry',
			'flow'              => isset( $data['flow'] ) ? (string) $data['flow'] : '',
			'design'            => wp_json_encode( $data['design'] ),
			'payload'           => wp_json_encode( $data['payload'] ),
			'source_ip'         => $data['source_ip'],
		);
		// The schema upgrade has not completed (see maybe_upgrade): keep to the columns that exist.
		if ( ! self::schema_current() ) {
			unset( $row['kind'], $row['flow'] );
		}

		$ok = $wpdb->insert( self::table(), $row, array_fill( 0, count( $row ), '%s' ) );

		if ( false === $ok ) {
			return new WP_Error( 'hd_dd_db_insert_failed', __( 'Could not save the enquiry.', 'hd-door-designer' ) );
		}

		return array(
			'id'        => (int) $wpdb->insert_id,
			'reference' => $reference,
			'token'     => $token,
		);
	}

	/**
	 * Record a submission that did NOT become an enquiry (validation, nonce or save
	 * failure) so the customer can still be called back. Reference HD-F-…, no reload
	 * token, status 'failed'. Values are cut to their column widths: this must not fail.
	 *
	 * @param array $data name/email/telephone/postcode (as typed), 'design' (array), 'payload' (array), 'source_ip'.
	 * @return array{id:int,reference:string}|WP_Error
	 */
	public function insert_failure( array $data ) {
		global $wpdb;

		$reference = 'HD-F-' . gmdate( 'YmdHis' ) . '-' . strtolower( wp_generate_password( 4, false ) );
		$cut       = function ( $key, $len ) use ( $data ) {
			$v = isset( $data[ $key ] ) ? (string) $data[ $key ] : '';
			return function_exists( 'mb_substr' ) ? mb_substr( $v, 0, $len ) : substr( $v, 0, $len );
		};

		$ok = $wpdb->insert(
			self::table(),
			array(
				'reference'         => $reference,
				'token'             => null,
				'created_at'        => current_time( 'mysql' ),
				'status'            => 'failed',
				'customer_name'     => $cut( 'name', 190 ),
				'customer_email'    => $cut( 'email', 190 ),
				'customer_phone'    => $cut( 'telephone', 40 ),
				'customer_postcode' => $cut( 'postcode', 16 ),
				'design'            => wp_json_encode( isset( $data['design'] ) ? $data['design'] : array() ),
				'payload'           => wp_json_encode( isset( $data['payload'] ) ? $data['payload'] : array() ),
				'source_ip'         => $cut( 'source_ip', 45 ),
			),
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);

		if ( false === $ok ) {
			return new WP_Error( 'hd_dd_db_insert_failed', __( 'Could not record the failed submission.', 'hd-door-designer' ) );
		}

		return array(
			'id'        => (int) $wpdb->insert_id,
			'reference' => $reference,
		);
	}

	/** A random, unguessable retrieval key (URL-safe alphanumerics) for the reload link. */
	private function generate_token() {
		return wp_generate_password( 32, false );
	}

	/** Fetch a row by its reload token, or null. */
	public function get_by_token( $token ) {
		global $wpdb;
		$token = (string) $token;
		if ( '' === $token ) {
			return null;
		}
		$table = self::table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE token = %s", $token ) );
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

	/** Columns update_row() may write. reference and token are never changed after insert. */
	const UPDATABLE = array( 'customer_name', 'customer_phone', 'customer_postcode', 'design_name', 'design', 'payload', 'kind' );

	/**
	 * Update a row in place (a save changing its design, or becoming an enquiry).
	 *
	 * @param int         $id        Row id.
	 * @param array       $fields    Column => value; arrays are stored as JSON; other columns are ignored.
	 * @param string|null $only_kind When set, only a row of this kind is written.
	 * @return int|false Rows updated (0 when nothing changed or the kind did not match).
	 */
	public function update_row( $id, array $fields, $only_kind = null ) {
		global $wpdb;
		$data = array();
		foreach ( self::UPDATABLE as $col ) {
			if ( array_key_exists( $col, $fields ) ) {
				$data[ $col ] = is_array( $fields[ $col ] ) ? wp_json_encode( $fields[ $col ] ) : (string) $fields[ $col ];
			}
		}
		if ( ! $data ) {
			return 0;
		}
		$where  = array( 'id' => (int) $id );
		$wfmt   = array( '%d' );
		if ( null !== $only_kind ) {
			$where['kind'] = (string) $only_kind;
			$wfmt[]        = '%s';
		}
		return $wpdb->update( self::table(), $data, $where, array_fill( 0, count( $data ), '%s' ), $wfmt );
	}

	/**
	 * Turn a save into an enquiry atomically: writes the fields and sets kind = enquiry only
	 * while the row is still a save, so of two simultaneous requests exactly one wins.
	 *
	 * @return int|false 1 when claimed, 0 when it was already an enquiry, false on a database error.
	 */
	public function claim_as_enquiry( $id, array $fields ) {
		$fields['kind'] = 'enquiry';
		return $this->update_row( $id, $fields, 'save' );
	}

	/** @return array{enquiry:int,save:int} Row counts by kind (failed submissions count as enquiries). */
	public function count_by_kind() {
		global $wpdb;
		$table = self::table();
		$out   = array( 'enquiry' => 0, 'save' => 0 );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		foreach ( (array) $wpdb->get_results( "SELECT kind, COUNT(*) AS n FROM {$table} GROUP BY kind" ) as $r ) {
			if ( isset( $out[ $r->kind ] ) ) {
				$out[ $r->kind ] = (int) $r->n;
			}
		}
		return $out;
	}

	/** @return array Row objects, newest first; $kind 'save' or 'enquiry' narrows the list. */
	public function list( $limit = 100, $offset = 0, $kind = '' ) {
		global $wpdb;
		$table = self::table();
		if ( 'save' === $kind || 'enquiry' === $kind ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
			return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE kind = %s ORDER BY created_at DESC LIMIT %d OFFSET %d", $kind, $limit, $offset ) );
		}
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} ORDER BY created_at DESC LIMIT %d OFFSET %d", $limit, $offset ) );
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

	/**
	 * Permanently delete enquiries by id, plus their stored preview images.
	 *
	 * @param int[] $ids
	 * @return int Rows deleted.
	 */
	public function delete( array $ids ) {
		global $wpdb;
		$ids = array_values( array_unique( array_filter( array_map( 'absint', $ids ) ) ) );
		if ( ! $ids ) {
			return 0;
		}
		$table        = self::table();
		$placeholders = implode( ', ', array_fill( 0, count( $ids ), '%d' ) );

		// Grab the references first so the matching image files can be removed after the rows go.
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- placeholders are %d; table name is internal.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT reference FROM {$table} WHERE id IN ($placeholders)", $ids ) );

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- placeholders are %d; table name is internal.
		$deleted = $wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE id IN ($placeholders)", $ids ) );

		foreach ( (array) $rows as $r ) {
			self::delete_image_file( $r->reference );
		}
		return (int) $deleted;
	}

	/** Remove the stored preview PNG for a reference (best-effort; matches store_design_image). */
	private static function delete_image_file( $reference ) {
		$uploads = wp_upload_dir();
		if ( ! empty( $uploads['error'] ) ) {
			return;
		}
		$file = trailingslashit( $uploads['basedir'] ) . 'hd-door-designer/enquiries/' . sanitize_file_name( $reference ) . '.png';
		if ( is_file( $file ) ) {
			wp_delete_file( $file );
		}
	}
}
