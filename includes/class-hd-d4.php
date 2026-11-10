<?php
/**
 * Designer 4 REST routes and the helpers they share. In this flow an email address sent beside
 * the finished door IS the price request and the lead: POST d4/lead stores the door as an
 * enquiry, queues the manager event, emails the visitor their link and tells the business.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_D4 {

	const FLOW = 'designer4';

	/** Calls per IP per hour to d4/designs, d4/door/{token}, its /remove and d4/details (autosave is chatty). */
	const READ_LIMIT  = 240;
	const READ_WINDOW = 3600;

	/** @var HD_DD_Repository */
	private $repository;

	/** @var HD_DD_Enquiry Shared validation, payload and image helpers. */
	private $enquiry;

	/** @var HD_DD_D4_Doors The endpoints used after the lead (list, add, change, remove). */
	public $doors;

	/** @var HD_DD_D4_Details The details endpoint. */
	public $details;

	public function __construct( HD_DD_Repository $repository, HD_DD_Enquiry $enquiry ) {
		$this->repository = $repository;
		$this->enquiry    = $enquiry;
		$this->doors      = new HD_DD_D4_Doors( $this, $repository, $enquiry );
		$this->details    = new HD_DD_D4_Details( $this, $this->doors, $repository, $enquiry );
	}

	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes() {
		register_rest_route(
			HD_DD_REST_NS,
			'/d4/lead',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'rest_lead' ),
				'permission_callback' => array( $this->enquiry, 'check_nonce' ),
			)
		);
		$token = '(?P<token>[A-Za-z0-9]+)';
		$posts = array(
			'/d4/designs'                  => array( $this->doors, 'rest_designs' ),
			'/d4/door'                     => array( $this->doors, 'rest_add' ),
			'/d4/door/' . $token           => array( $this->doors, 'rest_change' ),
			'/d4/door/' . $token . '/remove' => array( $this->doors, 'rest_remove' ),
			'/d4/details'                  => array( $this->details, 'rest_details' ),
		);
		foreach ( $posts as $route => $callback ) {
			register_rest_route( HD_DD_REST_NS, $route, array( 'methods' => WP_REST_Server::CREATABLE, 'callback' => $callback, 'permission_callback' => array( $this->enquiry, 'check_nonce' ) ) );
		}
	}

	// -------------------------------------------------------------------
	// Shared helpers (the other Designer 4 endpoints build on these)
	// -------------------------------------------------------------------
	public function params( WP_REST_Request $request ) {
		$p = $request->get_json_params();
		return is_array( $p ) ? $p : (array) $request->get_params();
	}

	public function text( array $p, $key ) {
		return ( isset( $p[ $key ] ) && is_scalar( $p[ $key ] ) ) ? (string) $p[ $key ] : '';
	}

	public function invalid( array $fields ) {
		return new WP_Error( 'hd_dd_validation', __( 'Please check the highlighted fields.', 'hd-door-designer' ), array( 'status' => 422, 'fields' => $fields ) );
	}

	/**
	 * Null when a Designer 4 route may run. 503 while the database upgrade has not added the
	 * Designer 4 columns (saves and enquiries keep working meanwhile: they need only kind/flow).
	 */
	public function unavailable() {
		if ( HD_DD_Repository::schema_current() ) {
			return null;
		}
		return new WP_Error( 'hd_dd_unavailable', __( 'Sorry, this is not available just now. Please try again later.', 'hd-door-designer' ), array( 'status' => 503 ) );
	}

	public function write_failed() {
		return new WP_Error( 'hd_dd_save_failed', __( 'Sorry, we could not save that. Please try again.', 'hd-door-designer' ), array( 'status' => 500 ) );
	}

	/** At most HD_DD_Save::SAVE_LIMIT stored requests per IP per hour, sharing the save endpoints' count. */
	public function within_limit() {
		$key = 'hd_dd_save_' . md5( (string) $this->enquiry->client_ip() );
		$hit = get_transient( $key );
		$now = time();
		if ( ! is_array( $hit ) || ! isset( $hit['n'], $hit['until'] ) || $hit['until'] <= $now ) {
			$hit = array( 'n' => 0, 'until' => $now + HD_DD_Save::SAVE_WINDOW );
		}
		if ( $hit['n'] >= HD_DD_Save::SAVE_LIMIT ) {
			return false;
		}
		$hit['n']++;
		set_transient( $key, $hit, max( 1, $hit['until'] - $now ) );
		return true;
	}

	/**
	 * Null while this IP is within READ_LIMIT calls this hour to the read and door routes, else a
	 * 429. A transient keyed by IP, like the save limit; leads and added doors do not count.
	 */
	public function over_read_limit() {
		$key = 'hd_dd_d4_read_' . md5( (string) $this->enquiry->client_ip() );
		$hit = get_transient( $key );
		$now = time();
		if ( ! is_array( $hit ) || ! isset( $hit['n'], $hit['until'] ) || $hit['until'] <= $now ) {
			$hit = array( 'n' => 0, 'until' => $now + self::READ_WINDOW );
		}
		if ( $hit['n'] >= self::READ_LIMIT ) {
			return new WP_Error( 'hd_dd_rate_limited', __( 'Too many requests from this connection. Please try again later.', 'hd-door-designer' ), array( 'status' => 429 ) );
		}
		$hit['n']++;
		set_transient( $key, $hit, max( 1, $hit['until'] - $now ) );
		return null;
	}

	/** The stored preview PNG for a reference, as a mail attachment list. */
	public function attachments( $reference ) {
		$uploads = wp_upload_dir();
		if ( ! empty( $uploads['error'] ) ) {
			return array();
		}
		$file = trailingslashit( $uploads['basedir'] ) . 'hd-door-designer/enquiries/' . sanitize_file_name( $reference ) . '.png';
		return is_file( $file ) ? array( $file ) : array();
	}

	/** The visitor's own row for this token, or null: a live Designer 4 enquiry with the same email. */
	private function own_live_row( $token, $email ) {
		$row = '' !== $token ? $this->repository->get_by_token( $token ) : null;
		if ( ! $row || self::FLOW !== $row->flow || 'enquiry' !== $row->kind || ! empty( $row->removed_at ) ) {
			return null;
		}
		return 0 === strcasecmp( trim( (string) $row->customer_email ), $email ) ? $row : null;
	}

	// -------------------------------------------------------------------
	// POST d4/lead
	// -------------------------------------------------------------------
	public function rest_lead( WP_REST_Request $request ) {
		$down = $this->unavailable();
		if ( $down ) {
			return $down;
		}
		$p     = $this->params( $request );
		$email = sanitize_email( trim( wp_unslash( $this->text( $p, 'email' ) ) ) );
		if ( ! is_email( $email ) ) {
			return $this->invalid( array( 'email' => __( 'Please enter a valid email address.', 'hd-door-designer' ) ) );
		}
		$design = $this->enquiry->resolve_design( ( isset( $p['design'] ) && is_array( $p['design'] ) ) ? $p['design'] : array() );
		if ( empty( $design ) ) {
			return new WP_Error( 'hd_dd_no_design', __( 'No door design was received. Please start again.', 'hd-door-designer' ), array( 'status' => 422 ) );
		}
		if ( ! HD_DD_D4_Access::has_handle( $design ) ) {
			return $this->invalid( array( 'handle' => __( 'Oops, your door needs a handle to be saved.', 'hd-door-designer' ) ) );
		}
		if ( ! $this->within_limit() ) {
			return new WP_Error( 'hd_dd_rate_limited', __( 'Too many saves from this connection. Please try again later.', 'hd-door-designer' ), array( 'status' => 429 ) );
		}
		// A filled hidden field is usually autofill on a real customer: treat it as real, flag it. A
		// flagged request never edits an existing door.
		$flagged = ! empty( $p['hd_hp'] );
		$name    = $this->design_name( $design );
		$own     = $flagged ? null : $this->own_live_row( $this->text( $p, 'token' ), $email );
		return $own ? $this->change_door( $own, $design, $name, $p ) : $this->add_door( $email, $design, $name, $flagged, $p );
	}

	public function design_name( array $design ) {
		$name = HD_DD_Enquiry::default_design_name( $design );
		return function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 80 ) : substr( $name, 0, 80 );
	}

	/** Sent again in the same visit (back, change, send again): update the one row, queue door_changed. */
	private function change_door( $row, array $design, $name, array $p ) {
		$payload = json_decode( (string) $row->payload, true );
		$payload = is_array( $payload ) ? $payload : array();
		$payload['design']     = $design;
		$payload['designName'] = $name;
		$image = $this->enquiry->store_design_image( $row->reference, $this->text( $p, 'image' ) );
		if ( $image ) {
			$payload['image'] = $image['url'];
		}
		if ( false === $this->repository->update_row( $row->id, array( 'design' => $design, 'design_name' => $name, 'payload' => $payload ), 'enquiry' ) ) {
			return $this->write_failed();
		}
		HD_DD_D4_Events::send( 'door_changed', $this->repository->get( $row->id ) );
		return new WP_REST_Response( array( 'ok' => true, 'token' => $row->token, 'reference' => $row->reference ), 200 );
	}

	/** A new door: store it as an enquiry, queue door_added, email the visitor and the business. */
	private function add_door( $email, array $design, $name, $flagged, array $p ) {
		$saved = $this->repository->insert(
			array(
				'name'        => '',
				'email'       => $email,
				'telephone'   => '',
				'postcode'    => '',
				'design_name' => $name,
				'design'      => $design,
				'status'      => $flagged ? 'flagged' : 'new',
				'payload'     => array(),
				'source_ip'   => $this->enquiry->client_ip(),
				'kind'        => 'enquiry',
				'flow'        => self::FLOW,
			)
		);
		if ( is_wp_error( $saved ) ) {
			return new WP_Error( 'hd_dd_save_failed', __( 'Sorry, we could not save your design. Please try again.', 'hd-door-designer' ), array( 'status' => 500 ) );
		}

		$image   = $this->enquiry->store_design_image( $saved['reference'], $this->text( $p, 'image' ) );
		$payload = $this->enquiry->build_payload( $saved['reference'], array( 'name' => '', 'telephone' => '', 'email' => $email, 'postcode' => '' ), $design, $name );
		$payload['kind']    = 'enquiry';
		$payload['flow']    = self::FLOW;
		$payload['pageUrl'] = HD_DD_D4_Access::page_base( $this->text( $p, 'pageUrl' ) );
		if ( $image ) {
			$payload['image'] = $image['url'];
		}
		if ( $flagged ) {
			$payload['flags'] = array( 'honeypot' );
		}
		// Kept on the record: the A/B conversion below counts for the arm they were in today.
		$experiment = isset( $p['experiment'] ) ? HD_DD_Experiments::sanitize_ref( $p['experiment'] ) : null;
		if ( $experiment ) {
			$payload['experiment'] = $experiment;
		}
		$this->repository->update_payload( $saved['id'], $payload );

		$row = $this->repository->get( $saved['id'] );
		HD_DD_D4_Mailer::send_link( $payload, HD_DD_D4_Access::designs_url( $payload['pageUrl'], $row ) );
		$queued = HD_DD_D4_Events::send( 'door_added', $row ) > 0;
		HD_DD_D4_Mailer::send_owner_lead( $payload, HD_DD_Plugin::settings()['recipient_email'], $image ? array( $image['path'] ) : array(), $queued );

		/** The lead, and the A/B conversion (same hook an enquiry fires). Not hd_dd_design_saved: no follow-up sequence. */
		do_action( 'hd_dd_enquiry_submitted', $payload, (int) $saved['id'] );

		return new WP_REST_Response( array( 'ok' => true, 'token' => $saved['token'], 'reference' => $saved['reference'] ), 200 );
	}
}
