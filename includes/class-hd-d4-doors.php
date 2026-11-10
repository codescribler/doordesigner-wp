<?php
/**
 * Designer 4 doors after the lead: who the caller is, the My designs list, adding a door,
 * changing one (and the doorway answer) and removing one. Every route takes an `auth` object:
 * { token, k } is the emailed link (the owner) and { tokens: [...] } is the doors made in this
 * browser (a session). Responses never carry the owner key, name, phone or postcode.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4_Doors {

	const MAX_TOKENS = 50;

	/** @var HD_DD_D4 */
	private $d4;

	/** @var HD_DD_Repository */
	private $repository;

	/** @var HD_DD_Enquiry */
	private $enquiry;

	public function __construct( HD_DD_D4 $d4, HD_DD_Repository $repository, HD_DD_Enquiry $enquiry ) {
		$this->d4         = $d4;
		$this->repository = $repository;
		$this->enquiry    = $enquiry;
	}

	public function forbidden() {
		return new WP_Error( 'hd_dd_forbidden', __( 'Sorry, we could not open those designs.', 'hd-door-designer' ), array( 'status' => 403 ) );
	}

	private function conflict( $code ) {
		$message = 'closed' === $code ? __( 'This door has moved on, so it can no longer be changed here.', 'hd-door-designer' ) : __( 'That door has been removed.', 'hd-door-designer' );
		return new WP_Error( $code, $message, array( 'status' => 409 ) );
	}

	/** A live-or-removed Designer 4 enquiry row for a token, or null. */
	private function d4_row( $token ) {
		$row = ( is_string( $token ) && '' !== $token ) ? $this->repository->get_by_token( $token ) : null;
		return ( $row && HD_DD_D4::FLOW === $row->flow && 'enquiry' === $row->kind ) ? $row : null;
	}

	/**
	 * Who is asking, and which doors they may see.
	 *
	 * @return array{email:string,owner:bool,rows:array,all:array}|WP_Error rows are live doors, all adds removed ones.
	 */
	public function resolve( array $auth ) {
		if ( isset( $auth['tokens'] ) && is_array( $auth['tokens'] ) ) {
			return $this->resolve_session( array_slice( array_values( $auth['tokens'] ), 0, self::MAX_TOKENS ) );
		}
		$row = $this->d4_row( isset( $auth['token'] ) ? $auth['token'] : '' );
		if ( ! $row || ! HD_DD_D4_Access::is_owner( $row, isset( $auth['k'] ) ? $auth['k'] : '' ) ) {
			return $this->forbidden();
		}
		$email = (string) $row->customer_email;
		return array(
			'email' => $email,
			'owner' => true,
			'rows'  => $this->repository->list_by_email( $email ),
			'all'   => $this->repository->list_by_email( $email, HD_DD_D4::FLOW, true ),
		);
	}

	private function resolve_session( array $tokens ) {
		$all    = array();
		$emails = array();
		foreach ( array_unique( array_filter( $tokens, 'is_string' ) ) as $token ) {
			$row = $this->d4_row( $token );
			if ( $row ) {
				$all[ $row->token ]                                     = $row;
				$emails[ strtolower( trim( (string) $row->customer_email ) ) ] = true;
			}
		}
		if ( 1 !== count( $emails ) ) {
			return $this->forbidden();
		}
		$all  = array_values( $all );
		$live = array_values( array_filter( $all, function ( $r ) { return empty( $r->removed_at ); } ) );
		return array( 'email' => (string) $all[0]->customer_email, 'owner' => false, 'rows' => $live, 'all' => $all );
	}

	private function auth_of( WP_REST_Request $request ) {
		$p = $this->d4->params( $request );
		return $this->resolve( ( isset( $p['auth'] ) && is_array( $p['auth'] ) ) ? $p['auth'] : array() );
	}

	private function status_of( array $rows ) {
		return HD_DD_Manager_Client::status( array_map( function ( $r ) { return $r->reference; }, $rows ) );
	}

	// -------------------------------------------------------------------
	// POST d4/designs
	// -------------------------------------------------------------------
	public function rest_designs( WP_REST_Request $request ) {
		$who = $this->auth_of( $request );
		if ( is_wp_error( $who ) ) {
			return $who;
		}
		$rows     = $who['rows'];
		$statuses = $this->status_of( $rows );
		$doors    = array();
		$missing  = array( 'name' => true, 'postcode' => true, 'phone' => true );
		foreach ( $rows as $row ) {
			$doors[] = HD_DD_D4_View::item( $row, isset( $statuses[ $row->reference ] ) ? $statuses[ $row->reference ] : 'pending' );
			foreach ( array( 'name' => 'customer_name', 'postcode' => 'customer_postcode', 'phone' => 'customer_phone' ) as $key => $col ) {
				if ( '' !== trim( (string) $row->$col ) ) {
					$missing[ $key ] = false;
				}
			}
		}
		$older = ! $who['owner'] && count( $this->repository->list_by_email( $who['email'] ) ) > count( $rows );
		return new WP_REST_Response( array( 'email' => $who['email'], 'owner' => $who['owner'], 'doors' => $doors, 'missing' => $missing, 'older' => $older ), 200 );
	}

	// -------------------------------------------------------------------
	// POST d4/door (add)
	// -------------------------------------------------------------------
	public function rest_add( WP_REST_Request $request ) {
		$who = $this->auth_of( $request );
		if ( is_wp_error( $who ) ) {
			return $who;
		}
		$p      = $this->d4->params( $request );
		$design = $this->clean_design( $p );
		if ( is_wp_error( $design ) ) {
			return $design;
		}
		if ( ! HD_DD_Repository::schema_current() ) {
			return $this->d4->write_failed();
		}
		if ( ! $this->d4->within_limit() ) {
			return new WP_Error( 'hd_dd_rate_limited', __( 'Too many saves from this connection. Please try again later.', 'hd-door-designer' ), array( 'status' => 429 ) );
		}
		$flagged = ! empty( $p['hd_hp'] );
		$name    = $this->d4->design_name( $design );
		$saved   = $this->repository->insert(
			array(
				'name' => '', 'email' => $who['email'], 'telephone' => '', 'postcode' => '', 'design_name' => $name, 'design' => $design,
				'status' => $flagged ? 'flagged' : 'new', 'payload' => array(), 'source_ip' => $this->enquiry->client_ip(),
				'kind' => 'enquiry', 'flow' => HD_DD_D4::FLOW,
			)
		);
		if ( is_wp_error( $saved ) ) {
			return $this->d4->write_failed();
		}
		$image   = $this->enquiry->store_design_image( $saved['reference'], $this->d4->text( $p, 'image' ) );
		$payload = $this->enquiry->build_payload( $saved['reference'], array( 'name' => '', 'telephone' => '', 'email' => $who['email'], 'postcode' => '' ), $design, $name );
		$payload['kind']    = 'enquiry';
		$payload['flow']    = HD_DD_D4::FLOW;
		$payload['pageUrl'] = HD_DD_D4_Access::page_base( $this->d4->text( $p, 'pageUrl' ) );
		$payload['image']   = $image ? $image['url'] : '';
		if ( $flagged ) {
			$payload['flags'] = array( 'honeypot' );
		}
		$experiment = isset( $p['experiment'] ) ? HD_DD_Experiments::sanitize_ref( $p['experiment'] ) : null;
		if ( $experiment ) {
			$payload['experiment'] = $experiment;
		}
		$this->repository->update_payload( $saved['id'], $payload );
		$queued = HD_DD_D4_Events::send( 'door_added', $this->repository->get( $saved['id'] ) ) > 0;
		HD_DD_D4_Mailer::send_owner_door_added( $payload, HD_DD_Plugin::settings()['recipient_email'], $image ? array( $image['path'] ) : array(), $queued );
		return new WP_REST_Response( array( 'ok' => true, 'token' => $saved['token'], 'reference' => $saved['reference'] ), 200 );
	}

	/** The submitted design, resolved and checked for a handle; or a WP_Error. */
	private function clean_design( array $p ) {
		$design = $this->enquiry->resolve_design( ( isset( $p['design'] ) && is_array( $p['design'] ) ) ? $p['design'] : array() );
		if ( empty( $design ) ) {
			return new WP_Error( 'hd_dd_no_design', __( 'No door design was received. Please start again.', 'hd-door-designer' ), array( 'status' => 422 ) );
		}
		if ( ! HD_DD_D4_Access::has_handle( $design ) ) {
			return $this->d4->invalid( array( 'handle' => __( 'Oops, your door needs a handle to be saved.', 'hd-door-designer' ) ) );
		}
		return $design;
	}

	// -------------------------------------------------------------------
	// POST d4/door/{token} and d4/door/{token}/remove
	// -------------------------------------------------------------------
	/** The caller's door for the path token, or the error (403 not theirs, 409 removed or closed). */
	private function own_door( WP_REST_Request $request ) {
		$who = $this->auth_of( $request );
		if ( is_wp_error( $who ) ) {
			return $who;
		}
		$url   = $request->get_url_params();
		$token = isset( $url['token'] ) ? (string) $url['token'] : '';
		foreach ( $who['all'] as $row ) {
			if ( hash_equals( (string) $row->token, $token ) ) {
				if ( ! empty( $row->removed_at ) ) {
					return $this->conflict( 'removed' );
				}
				$status = $this->status_of( array( $row ) );
				return ( isset( $status[ $row->reference ] ) && 'closed' === $status[ $row->reference ] ) ? $this->conflict( 'closed' ) : $row;
			}
		}
		return $this->forbidden();
	}

	public function rest_change( WP_REST_Request $request ) {
		$row = $this->own_door( $request );
		if ( is_wp_error( $row ) ) {
			return $row;
		}
		$p      = $this->d4->params( $request );
		$stored = HD_DD_D4_View::decode( $row->design );
		$design = $stored;
		if ( isset( $p['design'] ) ) {
			$design = $this->clean_design( $p );
			if ( is_wp_error( $design ) ) {
				return $design;
			}
		}
		$changed = $design != $stored; // phpcs:ignore -- loose on purpose: ids may arrive as strings.
		$first   = 'picked' === $this->d4->text( $p, 'doorway' ) && empty( $row->doorway_at );
		if ( $first && ! $this->repository->mark_step( $row->id, 'doorway_at' ) ) {
			return $this->d4->write_failed();
		}
		$payload = HD_DD_D4_View::decode( $row->payload );
		$image   = $this->enquiry->store_design_image( $row->reference, $this->d4->text( $p, 'image' ) );
		if ( $image ) {
			$payload['image'] = $image['url'];
		}
		$payload['design']    = $design;
		$payload['frame']     = HD_DD_D4_View::frame_of( $design, $first || ! empty( $row->doorway_at ) );
		$payload['sideGlass'] = HD_DD_D4_View::side_glass_of( $design );
		$name                 = $changed ? $this->d4->design_name( $design ) : (string) $row->design_name;
		$payload['designName'] = $name;
		if ( false === $this->repository->update_row( $row->id, array( 'design' => $design, 'design_name' => $name, 'payload' => $payload ), 'enquiry' ) ) {
			return $this->d4->write_failed();
		}
		if ( $first || $changed ) {
			HD_DD_D4_Events::send( $first ? 'doorway_set' : 'door_changed', $this->repository->get( $row->id ) );
		}
		return new WP_REST_Response( array( 'ok' => true, 'token' => $row->token, 'reference' => $row->reference ), 200 );
	}

	public function rest_remove( WP_REST_Request $request ) {
		$row = $this->own_door( $request );
		if ( is_wp_error( $row ) ) {
			return $row;
		}
		if ( ! $this->repository->mark_removed( $row->id ) ) {
			return $this->d4->write_failed();
		}
		HD_DD_D4_Events::send( 'door_removed', $this->repository->get( $row->id ) );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}
}
