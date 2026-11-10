<?php
/**
 * How a stored Designer 4 door is described to its owner: the My designs list item, the frame
 * they chose and the side glass. Never includes the owner key, name, phone or postcode.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4_View {

	public static function decode( $json ) {
		$data = json_decode( (string) $json, true );
		return is_array( $data ) ? $data : array();
	}

	/** The frame the visitor chose, only once they have answered the doorway question. */
	public static function frame_of( array $design, $doorway_set ) {
		if ( ! $doorway_set || empty( $design['Frame Design']['label'] ) ) {
			return null;
		}
		return array( 'id' => isset( $design['Frame Design']['id'] ) ? $design['Frame Design']['id'] : null, 'label' => (string) $design['Frame Design']['label'] );
	}

	/** "Left · Obscure" when a side-lit frame has both a sidelight type and glass, else "". */
	public static function side_glass_of( array $design ) {
		$type  = isset( $design['Sidelight Type']['label'] ) ? trim( (string) $design['Sidelight Type']['label'] ) : '';
		$glass = isset( $design['Sidelight Glass']['label'] ) ? trim( (string) $design['Sidelight Glass']['label'] ) : '';
		return ( '' !== $type && '' !== $glass ) ? $type . ' · ' . $glass : '';
	}

	/** One door in the My designs list. */
	public static function item( $row, $status ) {
		$design  = self::decode( $row->design );
		$payload = self::decode( $row->payload );
		return array(
			'token'     => (string) $row->token,
			'reference' => (string) $row->reference,
			'name'      => (string) $row->design_name,
			'image'     => isset( $payload['image'] ) ? (string) $payload['image'] : '',
			'savedAt'   => (string) $row->created_at,
			'frame'     => self::frame_of( $design, ! empty( $row->doorway_at ) ),
			'sideGlass' => self::side_glass_of( $design ),
			'status'    => (string) $status,
		);
	}
}
