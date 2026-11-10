<?php
/**
 * POST d4/details: the visitor's name, postcode and phone, written to every door the caller may
 * see. The owner (the emailed link) overwrites; a session only fills blanks, so typing someone
 * else's email can never replace what is already on file.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4_Details {

	/** @var HD_DD_D4 */
	private $d4;

	/** @var HD_DD_D4_Doors */
	private $doors;

	/** @var HD_DD_Repository */
	private $repository;

	/** @var HD_DD_Enquiry */
	private $enquiry;

	public function __construct( HD_DD_D4 $d4, HD_DD_D4_Doors $doors, HD_DD_Repository $repository, HD_DD_Enquiry $enquiry ) {
		$this->d4         = $d4;
		$this->doors      = $doors;
		$this->repository = $repository;
		$this->enquiry    = $enquiry;
	}

	public function rest_details( WP_REST_Request $request ) {
		$down = $this->d4->unavailable();
		if ( $down ) {
			return $down;
		}
		$p   = $this->d4->params( $request );
		$who = $this->doors->resolve( ( isset( $p['auth'] ) && is_array( $p['auth'] ) ) ? $p['auth'] : array() );
		if ( is_wp_error( $who ) ) {
			return $who;
		}
		$name     = trim( sanitize_text_field( wp_unslash( $this->d4->text( $p, 'name' ) ) ) );
		$phone    = $this->enquiry->sanitize_phone( $this->d4->text( $p, 'telephone' ) );
		$postcode = $this->enquiry->sanitize_postcode( $this->d4->text( $p, 'postcode' ) );
		$name     = function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 80 ) : substr( $name, 0, 80 );
		if ( '' !== $postcode && ! $this->enquiry->is_valid_uk_postcode( $postcode ) ) {
			return $this->d4->invalid( array( 'postcode' => __( 'Please enter a valid UK postcode.', 'hd-door-designer' ) ) );
		}
		if ( ! $who['rows'] ) {
			return new WP_Error( 'removed', __( 'That door has been removed.', 'hd-door-designer' ), array( 'status' => 409 ) );
		}
		$given = array_filter( array( 'customer_name' => $name, 'customer_phone' => $phone, 'customer_postcode' => $postcode ), 'strlen' );
		if ( ! $given ) {
			return new WP_REST_Response( array( 'ok' => true ), 200 );
		}
		foreach ( $who['rows'] as $row ) {
			if ( ! $this->write_row( $row, $given, $who['owner'] ) ) {
				return $this->d4->write_failed();
			}
		}
		$first = $this->repository->get( $who['rows'][0]->id );
		HD_DD_D4_Events::send( 'details', $first, array( 'name' => $name, 'phone' => $phone, 'postcode' => $postcode, 'overwrite' => $who['owner'] ) );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/** Write the given fields to one row (blanks only unless $overwrite) and mark the step. */
	private function write_row( $row, array $given, $overwrite ) {
		$fields = array();
		foreach ( $given as $col => $value ) {
			if ( $overwrite || '' === trim( (string) $row->$col ) ) {
				$fields[ $col ] = $value;
			}
		}
		if ( $fields ) {
			$payload = json_decode( (string) $row->payload, true );
			$payload = is_array( $payload ) ? $payload : array();
			$map     = array( 'customer_name' => 'name', 'customer_phone' => 'telephone', 'customer_postcode' => 'postcode' );
			foreach ( $fields as $col => $value ) {
				$payload['customer'][ $map[ $col ] ] = $value;
			}
			$fields['payload'] = $payload;
			if ( false === $this->repository->update_row( $row->id, $fields, 'enquiry' ) ) {
				return false;
			}
		}
		return false !== $this->repository->mark_step( $row->id, 'details_at' );
	}
}
