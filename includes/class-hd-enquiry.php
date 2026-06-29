<?php
/**
 * Enquiry submission endpoint. Validates + sanitises the customer fields, rebuilds
 * the design in Endurance's exact vocabulary from the SERVER-side catalogue (so the
 * stored labels are authoritative, not client-supplied), persists it, and emails it.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Enquiry {

	/** @var HD_DD_Repository */
	private $repository;

	/** @var HD_DD_Catalogue */
	private $catalogue;

	public function __construct( HD_DD_Repository $repository, HD_DD_Catalogue $catalogue ) {
		$this->repository = $repository;
		$this->catalogue  = $catalogue;
	}

	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes() {
		register_rest_route(
			HD_DD_REST_NS,
			'/enquiry',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'rest_submit' ),
				'permission_callback' => array( $this, 'check_nonce' ),
			)
		);

		// Reload a saved design by its unguessable token (for the "revisit your design"
		// email link). Public read — it returns ONLY the design choices, never the
		// customer's personal details.
		register_rest_route(
			HD_DD_REST_NS,
			'/design/(?P<token>[A-Za-z0-9]{10,64})',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'rest_get_design' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'token' => array( 'sanitize_callback' => 'sanitize_text_field' ),
				),
			)
		);
	}

	/**
	 * Return the saved design choices for a reload token. Design only — no name, email,
	 * phone or postcode — so a forwarded link can never leak personal data.
	 */
	public function rest_get_design( WP_REST_Request $request ) {
		$row = $this->repository->get_by_token( (string) $request['token'] );
		if ( ! $row ) {
			return new WP_Error( 'hd_dd_design_not_found', __( 'That saved design could not be found.', 'hd-door-designer' ), array( 'status' => 404 ) );
		}
		$design = json_decode( (string) $row->design, true );
		if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $design ) ) {
			return new WP_Error( 'hd_dd_design_unreadable', __( 'That saved design could not be read.', 'hd-door-designer' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response( array( 'design' => $design ), 200 );
	}

	/** Nonce gate. The front-end is given a 'wp_rest' nonce at enqueue time. */
	public function check_nonce( WP_REST_Request $request ) {
		$nonce = $request->get_header( 'X-WP-Nonce' );
		if ( ! $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new WP_Error( 'hd_dd_bad_nonce', __( 'Security check failed. Please reload and try again.', 'hd-door-designer' ), array( 'status' => 403 ) );
		}
		return true;
	}

	public function rest_submit( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		if ( ! is_array( $params ) ) {
			$params = $request->get_params();
		}

		// Honeypot: bots fill hidden fields. Pretend success, store nothing.
		if ( ! empty( $params['hd_hp'] ) ) {
			return new WP_REST_Response( array( 'ok' => true, 'reference' => 'HD-IGNORED' ), 200 );
		}

		// --- Consent (GDPR) -------------------------------------------------
		if ( empty( $params['consent'] ) ) {
			return new WP_Error( 'hd_dd_no_consent', __( 'Please agree to be contacted about your enquiry.', 'hd-door-designer' ), array( 'status' => 422 ) );
		}

		// --- Customer fields ------------------------------------------------
		$name      = isset( $params['name'] ) ? sanitize_text_field( wp_unslash( $params['name'] ) ) : '';
		$email     = isset( $params['email'] ) ? sanitize_email( wp_unslash( $params['email'] ) ) : '';
		$telephone = isset( $params['telephone'] ) ? $this->sanitize_phone( $params['telephone'] ) : '';
		$postcode  = isset( $params['postcode'] ) ? $this->sanitize_postcode( $params['postcode'] ) : '';

		$errors = array();
		if ( '' === $name ) {
			$errors['name'] = __( 'Please enter your name.', 'hd-door-designer' );
		}
		if ( ! is_email( $email ) ) {
			$errors['email'] = __( 'Please enter a valid email address.', 'hd-door-designer' );
		}
		if ( '' === $telephone ) {
			$errors['telephone'] = __( 'Please enter a contact number.', 'hd-door-designer' );
		}
		if ( ! $this->is_valid_uk_postcode( $postcode ) ) {
			$errors['postcode'] = __( 'Please enter a valid UK postcode.', 'hd-door-designer' );
		}
		if ( $errors ) {
			return new WP_Error( 'hd_dd_validation', __( 'Please check the highlighted fields.', 'hd-door-designer' ), array( 'status' => 422, 'fields' => $errors ) );
		}

		// --- Design (resolved to authoritative labels) ----------------------
		$submitted_design = isset( $params['design'] ) && is_array( $params['design'] ) ? $params['design'] : array();
		$design = $this->resolve_design( $submitted_design );

		if ( empty( $design ) ) {
			return new WP_Error( 'hd_dd_no_design', __( 'No door design was received. Please start again.', 'hd-door-designer' ), array( 'status' => 422 ) );
		}

		// --- Persist + notify ----------------------------------------------
		$saved = $this->repository->insert(
			array(
				'name'      => $name,
				'email'     => $email,
				'telephone' => $telephone,
				'postcode'  => $postcode,
				'design'    => $design,
				'payload'   => array(), // filled below once we have the reference.
				'source_ip' => $this->client_ip(),
			)
		);

		if ( is_wp_error( $saved ) ) {
			return new WP_Error( 'hd_dd_save_failed', __( 'Sorry, we could not save your enquiry. Please try again.', 'hd-door-designer' ), array( 'status' => 500 ) );
		}

		// Store what the door actually looks like (the customer-captured preview) alongside the
		// spec, so the request for quote carries the image too.
		$image = $this->store_design_image( $saved['reference'], isset( $params['image'] ) ? (string) $params['image'] : '' );

		$payload = $this->build_payload( $saved['reference'], compact( 'name', 'email', 'telephone', 'postcode' ), $design );
		if ( $image ) {
			$payload['image'] = $image['url'];
		}
		$this->repository->update_payload( $saved['id'], $payload );

		$recipient = HD_DD_Plugin::settings()['recipient_email'];
		HD_DD_Mailer::send( $payload, $recipient, $image ? array( $image['path'] ) : array() );

		/** Fires after an enquiry is stored + emailed — hook point for CRM/sheet integrations. */
		do_action( 'hd_dd_enquiry_submitted', $payload, $saved['id'] );

		return new WP_REST_Response(
			array(
				'ok'        => true,
				'reference' => $saved['reference'],
				'token'     => $saved['token'], // lets the thank-you screen offer an instant "revisit your design" link.
				'message'   => __( 'Thank you — your design has been sent. We will be in touch shortly.', 'hd-door-designer' ),
			),
			201
		);
	}

	/**
	 * Rebuild the design map using the server catalogue so labels/ids are authoritative
	 * and exact (trailing spaces, odd casing preserved). Falls back to the client-sent
	 * label only when the catalogue can't resolve it.
	 *
	 * @param array $submitted heading => { id, label, style? }
	 * @return array heading => { label, id }
	 */
	private function resolve_design( array $submitted ) {
		$catalogue = $this->catalogue->get();
		$door_type = isset( $submitted['Door Type']['label'] ) ? $submitted['Door Type']['label'] : '';
		$type_node = ( $catalogue && isset( $catalogue[ $door_type ]['fields'] ) ) ? $catalogue[ $door_type ] : null;

		$selected_style = '';
		foreach ( array( 'Door Design', 'Door Style' ) as $style_heading ) {
			if ( isset( $submitted[ $style_heading ]['label'] ) ) {
				$selected_style = $submitted[ $style_heading ]['label'];
				break;
			}
		}

		$out = array();
		foreach ( $submitted as $heading => $choice ) {
			$heading = sanitize_text_field( $heading );
			$id      = isset( $choice['id'] ) ? (int) $choice['id'] : null;
			$label   = isset( $choice['label'] ) ? (string) $choice['label'] : '';

			$authoritative = $type_node ? $this->lookup_label( $type_node, $heading, $id, $selected_style ) : null;
			if ( null !== $authoritative ) {
				$label = $authoritative; // exact string from the catalogue.
			} else {
				// Fallback: keep the client label but strip any markup (no trim, to preserve spacing).
				$label = wp_kses( $label, array() );
			}

			$out[ $heading ] = array(
				'label' => $label,
				'id'    => $id,
			);
		}

		return $out;
	}

	/** Find the exact label for heading+id within a door-type node (incl. per-style glazing). */
	private function lookup_label( array $type_node, $heading, $id, $selected_style ) {
		if ( null === $id ) {
			return null;
		}

		// Glazing lives in glazingByStyle keyed by the selected style.
		if ( in_array( $heading, array( 'Door Glass', 'Glazing' ), true ) && $selected_style && isset( $type_node['glazingByStyle'][ $selected_style ] ) ) {
			foreach ( $type_node['glazingByStyle'][ $selected_style ] as $g ) {
				if ( isset( $g['id'] ) && (int) $g['id'] === $id ) {
					return (string) $g['label'];
				}
			}
		}

		// Sidelight fields live in the type's sidelights node, not in fields.
		$sidelight_map = array(
			'Sidelight Type'  => 'sidelightType',
			'Sidelight Glass' => 'sidelightGlass',
		);
		if ( isset( $sidelight_map[ $heading ], $type_node['sidelights'][ $sidelight_map[ $heading ] ]['choices'] ) ) {
			foreach ( $type_node['sidelights'][ $sidelight_map[ $heading ] ]['choices'] as $c ) {
				if ( isset( $c['id'] ) && (int) $c['id'] === $id ) {
					return (string) $c['label'];
				}
			}
		}

		if ( isset( $type_node['fields'][ $heading ]['choices'] ) ) {
			foreach ( $type_node['fields'][ $heading ]['choices'] as $c ) {
				if ( isset( $c['id'] ) && (int) $c['id'] === $id ) {
					return (string) $c['label'];
				}
			}
		}

		return null;
	}

	/** Assemble the canonical enquiry payload (the shape the quote-creator consumes). */
	private function build_payload( $reference, array $customer, array $design ) {
		$handle_label = '';
		if ( isset( $design['Handle']['label'] ) ) {
			$handle_label = $design['Handle']['label'];
		}

		return array(
			'reference'   => $reference,
			'submittedAt' => gmdate( 'c' ),
			'customer'    => array(
				'name'      => $customer['name'],
				'telephone' => $customer['telephone'],
				'email'     => $customer['email'],
				'postcode'  => $customer['postcode'],
			),
			'design'      => $design,
			'derived'     => array(
				'suggestedLock' => HD_DD_Lock_Deriver::suggest( $handle_label ),
			),
		);
	}

	/**
	 * Decode the PNG data-URL the configurator captured of the composited door and save it to
	 * uploads, so the enquiry record + email carry what the door actually looks like.
	 *
	 * @param string $reference Server-generated, filesystem-safe (HD-YYYY-NNNNNN).
	 * @param string $data_url  data:image/png;base64,... from the front end.
	 * @return array{path:string,url:string}|null
	 */
	private function store_design_image( $reference, $data_url ) {
		if ( '' === $data_url || ! preg_match( '#^data:image/png;base64,#', $data_url ) ) {
			return null;
		}
		$b64 = substr( $data_url, strpos( $data_url, ',' ) + 1 );
		if ( strlen( $b64 ) > 3500000 ) { // ~2.6MB binary cap — guards storage + mail size.
			return null;
		}
		$binary = base64_decode( $b64, true );
		if ( false === $binary || strlen( $binary ) < 8 || "\x89PNG\r\n\x1a\n" !== substr( $binary, 0, 8 ) ) {
			return null; // not a real PNG
		}

		$uploads = wp_upload_dir();
		if ( ! empty( $uploads['error'] ) ) {
			return null;
		}
		$dir = trailingslashit( $uploads['basedir'] ) . 'hd-door-designer/enquiries';
		if ( ! wp_mkdir_p( $dir ) ) {
			return null;
		}
		$name = sanitize_file_name( $reference ) . '.png';
		$file = trailingslashit( $dir ) . $name;

		// Atomic write (temp + rename), matching the image proxy's storage pattern.
		$tmp = $file . '.tmp.' . wp_generate_password( 8, false );
		if ( false === file_put_contents( $tmp, $binary ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return null;
		}
		if ( ! @rename( $tmp, $file ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			return null;
		}

		return array(
			'path' => $file,
			'url'  => trailingslashit( $uploads['baseurl'] ) . 'hd-door-designer/enquiries/' . $name,
		);
	}

	// -------------------------------------------------------------------
	// Sanitisers / validators
	// -------------------------------------------------------------------
	private function sanitize_phone( $raw ) {
		$raw = wp_unslash( (string) $raw );
		return trim( preg_replace( '/[^0-9\+\(\)\s\-]/', '', $raw ) );
	}

	private function sanitize_postcode( $raw ) {
		$raw = strtoupper( trim( wp_unslash( (string) $raw ) ) );
		return preg_replace( '/[^A-Z0-9 ]/', '', $raw );
	}

	private function is_valid_uk_postcode( $postcode ) {
		// Loose UK postcode pattern (validation is tightened at survey, not here).
		$normalised = strtoupper( preg_replace( '/\s+/', '', (string) $postcode ) );
		return (bool) preg_match( '/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/', $normalised );
	}

	private function client_ip() {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		return ( $ip && filter_var( $ip, FILTER_VALIDATE_IP ) ) ? $ip : '';
	}
}
