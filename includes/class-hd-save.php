<?php
/**
 * The new designer's Review step: save a design with just an email address, then turn that
 * same record into an enquiry when the customer asks for an exact price. A save is stored
 * and emailed but is not a lead; the quote request is, and fires hd_dd_enquiry_submitted.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Save {

	const TOKEN = '(?P<token>[A-Za-z0-9]{10,64})';

	const SAVE_LIMIT  = 20;   // saves per IP …
	const SAVE_WINDOW = 3600; // … per hour. Each one sends two emails and stores a picture.

	/** @var HD_DD_Repository */
	private $repository;

	/** @var HD_DD_Enquiry Shared validation, payload and image helpers. */
	private $enquiry;

	public function __construct( HD_DD_Repository $repository, HD_DD_Enquiry $enquiry ) {
		$this->repository = $repository;
		$this->enquiry    = $enquiry;
	}

	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes() {
		$routes = array(
			'/save'                           => 'rest_save',
			'/save/' . self::TOKEN            => 'rest_update',
			'/save/' . self::TOKEN . '/quote' => 'rest_quote',
		);
		foreach ( $routes as $route => $method ) {
			register_rest_route(
				HD_DD_REST_NS,
				$route,
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, $method ),
					'permission_callback' => array( $this->enquiry, 'check_nonce' ),
				)
			);
		}
	}

	private function params( WP_REST_Request $request ) {
		$p = $request->get_json_params();
		return is_array( $p ) ? $p : (array) $request->get_params();
	}

	private function text( array $p, $key ) {
		return ( isset( $p[ $key ] ) && is_scalar( $p[ $key ] ) ) ? (string) $p[ $key ] : '';
	}

	private static function cut( $s, $n ) {
		return function_exists( 'mb_substr' ) ? mb_substr( $s, 0, $n ) : substr( $s, 0, $n );
	}

	private function not_found() {
		return new WP_Error( 'hd_dd_design_not_found', __( 'That saved design could not be found.', 'hd-door-designer' ), array( 'status' => 404 ) );
	}

	private function no_design() {
		return new WP_Error( 'hd_dd_no_design', __( 'No door design was received. Please start again.', 'hd-door-designer' ), array( 'status' => 422 ) );
	}

	private function write_failed() {
		return new WP_Error( 'hd_dd_save_failed', __( 'Sorry, we could not save that. Please try again.', 'hd-door-designer' ), array( 'status' => 500 ) );
	}

	private function already_enquiry() {
		return new WP_Error( 'hd_dd_already_enquiry', __( 'That design has already been sent to us.', 'hd-door-designer' ), array( 'status' => 409 ) );
	}

	/** Max SAVE_LIMIT saves per IP per fixed hour window (as HD_DD_Experiments limits exposes). */
	private function within_save_limit() {
		$key = 'hd_dd_save_' . md5( (string) $this->enquiry->client_ip() );
		$hit = get_transient( $key );
		$now = time();
		if ( ! is_array( $hit ) || ! isset( $hit['n'], $hit['until'] ) || $hit['until'] <= $now ) {
			$hit = array( 'n' => 0, 'until' => $now + self::SAVE_WINDOW );
		}
		if ( $hit['n'] >= self::SAVE_LIMIT ) {
			return false;
		}
		$hit['n']++;
		set_transient( $key, $hit, max( 1, $hit['until'] - $now ) );
		return true;
	}

	private function invalid( array $fields ) {
		return new WP_Error( 'hd_dd_validation', __( 'Please check the highlighted fields.', 'hd-door-designer' ), array( 'status' => 422, 'fields' => $fields ) );
	}

	private function design_name( array $design ) {
		$name = HD_DD_Enquiry::default_design_name( $design );
		return function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 80 ) : substr( $name, 0, 80 );
	}

	/** The stored preview PNG for a reference, as a mail attachment list. */
	private function attachments( $reference ) {
		$uploads = wp_upload_dir();
		if ( ! empty( $uploads['error'] ) ) {
			return array();
		}
		$file = trailingslashit( $uploads['basedir'] ) . 'hd-door-designer/enquiries/' . sanitize_file_name( $reference ) . '.png';
		return is_file( $file ) ? array( $file ) : array();
	}

	/** POST /save — store a design against an email address. */
	public function rest_save( WP_REST_Request $request ) {
		$p     = $this->params( $request );
		$email = sanitize_email( trim( wp_unslash( $this->text( $p, 'email' ) ) ) );
		if ( ! is_email( $email ) ) {
			return $this->invalid( array( 'email' => __( 'Please enter a valid email address.', 'hd-door-designer' ) ) );
		}
		$design = $this->enquiry->resolve_design( ( isset( $p['design'] ) && is_array( $p['design'] ) ) ? $p['design'] : array() );
		if ( empty( $design ) ) {
			return $this->no_design();
		}
		// The kind column is what makes a row a save. Until the database upgrade has added it, a
		// save would be stored as an enquiry and its price request quietly ignored, so refuse
		// instead: the failure log emails the business and the customer is asked to try again.
		if ( ! HD_DD_Repository::schema_current() ) {
			return new WP_Error( 'hd_dd_save_unavailable', __( 'Sorry, we could not save your design. Please try again.', 'hd-door-designer' ), array( 'status' => 500 ) );
		}
		// Only requests that would be stored count towards the limit; over it, nothing is stored or sent.
		if ( ! $this->within_save_limit() ) {
			return new WP_Error( 'hd_dd_rate_limited', __( 'Too many saves from this connection. Please try again later.', 'hd-door-designer' ), array( 'status' => 429 ) );
		}
		// A filled hidden field is usually autofill on a real customer: keep it, flag it.
		$flagged = ! empty( $p['hd_hp'] );
		$name    = $this->design_name( $design );

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
				'kind'        => 'save',
				'flow'        => HD_DD_Experiments::canonical_flow( $this->text( $p, 'flow' ) ),
			)
		);
		if ( is_wp_error( $saved ) ) {
			return new WP_Error( 'hd_dd_save_failed', __( 'Sorry, we could not save your design. Please try again.', 'hd-door-designer' ), array( 'status' => 500 ) );
		}

		$image   = $this->enquiry->store_design_image( $saved['reference'], $this->text( $p, 'image' ) );
		$payload = $this->enquiry->build_payload( $saved['reference'], array( 'name' => '', 'telephone' => '', 'email' => $email, 'postcode' => '' ), $design, $name );
		$payload['kind'] = 'save';
		if ( $image ) {
			$payload['image'] = $image['url'];
		}
		if ( $flagged ) {
			$payload['flags'] = array( 'honeypot' );
		}
		// Kept on the record: a later quote request converts for the arm they were in today.
		$experiment = isset( $p['experiment'] ) ? HD_DD_Experiments::sanitize_ref( $p['experiment'] ) : null;
		if ( $experiment ) {
			$payload['experiment'] = $experiment;
		}
		$this->repository->update_payload( $saved['id'], $payload );

		$reload_url = $this->enquiry->build_reload_url( $this->text( $p, 'pageUrl' ), $saved['token'] );
		HD_DD_Save_Mailer::send_owner_saved( $payload, HD_DD_Plugin::settings()['recipient_email'], $image ? array( $image['path'] ) : array(), $reload_url );
		HD_DD_Save_Mailer::send_saver( $payload, $reload_url );

		/** Fires after a design is saved by email (not an enquiry yet). */
		do_action( 'hd_dd_design_saved', $payload, $saved['id'] );

		return new WP_REST_Response( array( 'ok' => true, 'reference' => $saved['reference'], 'token' => $saved['token'] ), 201 );
	}

	/** POST /save/{token} — the saved design was changed. */
	public function rest_update( WP_REST_Request $request ) {
		$row = $this->repository->get_by_token( (string) $request['token'] );
		if ( ! $row ) {
			return $this->not_found();
		}
		if ( 'save' !== ( isset( $row->kind ) ? $row->kind : 'enquiry' ) ) {
			return $this->already_enquiry();
		}
		$p      = $this->params( $request );
		$design = $this->enquiry->resolve_design( ( isset( $p['design'] ) && is_array( $p['design'] ) ) ? $p['design'] : array() );
		if ( empty( $design ) ) {
			return $this->no_design();
		}
		$name    = $this->design_name( $design );
		$payload = json_decode( (string) $row->payload, true );
		$payload = is_array( $payload ) ? $payload : array();
		$payload['design']     = $design;
		$payload['designName'] = $name;
		// The design first, and only while the row is still a save (the write is guarded).
		if ( false === $this->repository->update_row( $row->id, array( 'design' => $design, 'design_name' => $name, 'payload' => $payload ), 'save' ) ) {
			return $this->write_failed();
		}
		// 0 rows can mean "nothing changed" as well as "no longer a save", so look again: a row
		// that became an enquiry meanwhile was not written, and its picture must not be replaced.
		$fresh = $this->repository->get_by_token( (string) $row->token );
		if ( ! $fresh || 'save' !== ( isset( $fresh->kind ) ? $fresh->kind : 'enquiry' ) ) {
			return $this->already_enquiry();
		}
		$image = $this->enquiry->store_design_image( $row->reference, $this->text( $p, 'image' ) );
		if ( $image ) {
			$payload['image'] = $image['url'];
			if ( false === $this->repository->update_row( $row->id, array( 'payload' => $payload ), 'save' ) ) {
				return $this->write_failed();
			}
		}
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/** POST /save/{token}/quote — the saver asks for an exact price: this is the enquiry. */
	public function rest_quote( WP_REST_Request $request ) {
		$row = $this->repository->get_by_token( (string) $request['token'] );
		if ( ! $row ) {
			return $this->not_found();
		}
		$done = array( 'ok' => true, 'reference' => $row->reference, 'token' => $row->token, 'message' => __( 'Thank you. Your price is on its way.', 'hd-door-designer' ) );
		if ( 'save' !== ( isset( $row->kind ) ? $row->kind : 'enquiry' ) ) {
			return new WP_REST_Response( $done, 200 ); // a second tap: already an enquiry.
		}

		$p         = $this->params( $request );
		$name      = self::cut( sanitize_text_field( wp_unslash( $this->text( $p, 'name' ) ) ), 190 );
		$postcode  = $this->enquiry->sanitize_postcode( $this->text( $p, 'postcode' ) );
		$telephone = $this->enquiry->sanitize_phone( $this->text( $p, 'telephone' ) );
		$errors    = array();
		if ( '' === $name ) {
			$errors['name'] = __( 'Please enter your name.', 'hd-door-designer' );
		}
		if ( ! $this->enquiry->is_valid_uk_postcode( $postcode ) ) {
			$errors['postcode'] = __( 'Please enter a valid UK postcode.', 'hd-door-designer' );
		}
		if ( $errors ) {
			return $this->invalid( $errors );
		}

		$postcode = self::cut( trim( preg_replace( '/\s+/', ' ', $postcode ) ), 16 );

		$payload = json_decode( (string) $row->payload, true );
		$payload = is_array( $payload ) ? $payload : array();
		$payload['kind']        = 'enquiry';
		$payload['submittedAt'] = gmdate( 'c' );
		$payload['customer']    = array( 'name' => $name, 'telephone' => $telephone, 'email' => (string) $row->customer_email, 'postcode' => $postcode );

		// Atomic: only one request can turn this save into an enquiry.
		$claimed = $this->repository->claim_as_enquiry(
			$row->id,
			array( 'customer_name' => $name, 'customer_phone' => $telephone, 'customer_postcode' => $postcode, 'payload' => $payload )
		);
		if ( false === $claimed ) {
			return $this->write_failed();
		}
		if ( 1 !== (int) $claimed ) {
			return new WP_REST_Response( $done, 200 ); // someone else got there first.
		}

		HD_DD_Mailer::send( $payload, HD_DD_Plugin::settings()['recipient_email'], $this->attachments( $row->reference ) );
		HD_DD_Mailer::send_customer_ack( $payload, $this->enquiry->build_reload_url( $this->text( $p, 'pageUrl' ), $row->token ), false );

		/** The same hook an enquiry fires: this is the lead, and the A/B conversion. */
		do_action( 'hd_dd_enquiry_submitted', $payload, (int) $row->id );

		return new WP_REST_Response( $done, 200 );
	}
}
