<?php
/**
 * Builds the manager's door and lead events for Designer 4 doors and puts them on the queue.
 * The shape is the contract in the plan ("Shared contract with the manager").
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4_Events {

	const TYPES = array( 'door_added', 'door_changed', 'doorway_set', 'door_removed', 'details' );

	/** "Single Door · Etna · French Navy", as the wp-admin list shows it. */
	public static function summary( array $design ) {
		$pick = array();
		foreach ( array( 'Door Type', 'Door Design', 'Door Style', 'Door Colour (External)', 'Door Colour' ) as $heading ) {
			if ( isset( $design[ $heading ]['label'] ) && '' !== $design[ $heading ]['label'] ) {
				$pick[] = $design[ $heading ]['label'];
			}
		}
		return implode( ' · ', array_unique( $pick ) );
	}

	/** Every heading and label in the stored design, in order. */
	public static function choices( array $design ) {
		$out = array();
		foreach ( $design as $heading => $choice ) {
			$label = ( is_array( $choice ) && isset( $choice['label'] ) ) ? trim( (string) $choice['label'] ) : '';
			if ( '' !== $label ) {
				$out[] = array( 'heading' => (string) $heading, 'label' => $label );
			}
		}
		return $out;
	}

	/** The contract's `door` object for a stored row. */
	public static function door( $row ) {
		$design  = json_decode( (string) $row->design, true );
		$design  = is_array( $design ) ? $design : array();
		$payload = json_decode( (string) $row->payload, true );
		$payload = is_array( $payload ) ? $payload : array();
		$page    = HD_DD_D4_Access::page_base( isset( $payload['pageUrl'] ) ? $payload['pageUrl'] : '' );
		return array(
			'reference' => (string) $row->reference,
			'name'      => (string) $row->design_name,
			'summary'   => self::summary( $design ),
			'imageUrl'  => isset( $payload['image'] ) ? (string) $payload['image'] : '',
			'designUrl' => '' !== $page ? add_query_arg( 'design', rawurlencode( (string) $row->token ), $page ) : '',
			'choices'   => self::choices( $design ),
			'frame'     => isset( $payload['frame'] ) ? $payload['frame'] : null,
			'sideGlass' => isset( $payload['sideGlass'] ) ? (string) $payload['sideGlass'] : '',
		);
	}

	/**
	 * Queue one event for the manager. $details may carry name, phone, postcode and overwrite.
	 *
	 * A failed queue insert is logged here; the caller adds a line to the owner's email when there is one.
	 *
	 * @return int Queue row id (0 when it could not be stored, or the type is unknown).
	 */
	public static function send( $type, $row, array $details = array() ) {
		if ( ! in_array( $type, self::TYPES, true ) ) {
			return 0;
		}
		$details = $details + array( 'name' => '', 'phone' => '', 'postcode' => '', 'overwrite' => false );
		$id      = HD_DD_Manager_Queue::enqueue(
			array(
				'type'    => $type,
				'email'   => (string) $row->customer_email,
				'door'    => self::door( $row ),
				'details' => array(
					'name'      => (string) $details['name'],
					'phone'     => (string) $details['phone'],
					'postcode'  => (string) $details['postcode'],
					'overwrite' => (bool) $details['overwrite'],
				),
			)
		);
		if ( ! $id ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- the owner must be able to find a lost event.
			error_log( sprintf( 'HD Door Designer: the manager event %s for %s could not be queued. Add it to the manager by hand.', $type, (string) $row->reference ) );
		}
		return $id;
	}
}
