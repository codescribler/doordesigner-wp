<?php
/**
 * How far each A/B visitor got, on their row in the visitors table (HD_DD_Experiments::table()):
 *   started_at  first choice          shown_at  saw their finished door
 *   form_at     opened the quote form saved_at  saved the design by email
 *   doorway_at / frame_at / details_at  Designer 4's doorway question, frame choice, details step
 * The browser reports the first three through POST experiment/step; saves are marked here from
 * hd_dd_design_saved. Each time is written once (COALESCE) and a later milestone fills in the
 * earlier ones, so a lost beacon cannot make the funnel go backwards. Quote requests
 * (converted_at) and call backs (callback_at) stay with HD_DD_Experiments.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Experiment_Tracking {

	/** When the journey began being recorded ('Y-m-d H:i:s' UTC); set once on upgrade. */
	const SINCE = 'hd_dd_experiment_journey_since';

	const RATE_LIMIT  = 300;  // steps per IP …
	const RATE_WINDOW = 3600; // … per hour.

	/** Browser steps => the columns each one sets (itself plus the ones before it). */
	const STEPS = array(
		'started' => array( 'started_at' ),
		'shown'   => array( 'started_at', 'shown_at' ),
		'form'    => array( 'started_at', 'shown_at', 'form_at' ),
		// Designer 4: the doorway question, the frame picked from it, and the details step.
		'doorway'       => array( 'started_at', 'shown_at', 'doorway_at' ),
		'doorwaypicked' => array( 'started_at', 'shown_at', 'doorway_at', 'frame_at' ),
		'details'       => array( 'started_at', 'shown_at', 'doorway_at', 'frame_at', 'details_at' ),
	);

	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'hd_dd_design_saved', array( $this, 'on_saved' ), 10, 2 );
		add_action( 'hd_dd_enquiry_submitted', array( $this, 'on_enquiry' ), 20, 2 );
		add_action( 'hd_dd_callback_requested', array( $this, 'on_callback' ), 20, 2 );
	}

	public function register_routes() {
		register_rest_route(
			HD_DD_REST_NS,
			'/experiment/step',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'rest_step' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/** POST /experiment/step {experimentId, visitorId, arm, step}. Only updates a visitor already exposed. */
	public function rest_step( WP_REST_Request $request ) {
		if ( ! self::within_rate_limit() ) {
			return new WP_REST_Response( array( 'ok' => false ), 429 );
		}
		$p    = $request->get_params();
		$step = isset( $p['step'] ) ? (string) $p['step'] : '';
		$ref  = array(
			'experimentId' => isset( $p['experimentId'] ) ? (string) $p['experimentId'] : '',
			'visitorId'    => isset( $p['visitorId'] ) ? (string) $p['visitorId'] : '',
			'arm'          => isset( $p['arm'] ) ? (string) $p['arm'] : '',
		);
		if ( ! isset( self::STEPS[ $step ] ) || ! preg_match( '/^[a-f0-9]{32}$/', $ref['visitorId'] ) || ! in_array( $ref['arm'], HD_DD_Experiments::ARMS, true ) ) {
			return new WP_REST_Response( array( 'ok' => false ), 400 );
		}
		$exp = HD_DD_Experiments::current();
		if ( ! $exp || $exp['id'] !== $ref['experimentId'] ) {
			return new WP_REST_Response( array( 'ok' => false ), 200 ); // stale tab / old experiment.
		}
		self::mark( $ref, self::STEPS[ $step ] );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/** hd_dd_design_saved: the save is a lead of its own (not the A/B conversion). */
	public function on_saved( $payload, $id = 0 ) {
		$ref = self::ref( $payload );
		if ( $ref ) {
			self::mark( $ref, array( 'started_at', 'shown_at', 'saved_at' ) );
		}
	}

	/** hd_dd_enquiry_submitted: a quote request means they got through the form. */
	public function on_enquiry( $payload, $id = 0 ) {
		$ref = self::ref( $payload );
		if ( $ref ) {
			self::mark( $ref, array( 'started_at', 'shown_at', 'form_at' ) );
		}
	}

	/** hd_dd_callback_requested: a call back comes after the finished door. */
	public function on_callback( $payload, $id = 0 ) {
		$ref = self::ref( $payload );
		if ( $ref ) {
			self::mark( $ref, array( 'started_at', 'shown_at' ) );
		}
	}

	/**
	 * Set each column to $at unless it already has a time. Returns rows changed.
	 *
	 * @param array    $ref  {experimentId, visitorId, arm}.
	 * @param string[] $cols Columns from STEPS / the listeners (never user input).
	 * @param string   $at   'Y-m-d H:i:s' UTC; now when omitted.
	 */
	public static function mark( array $ref, array $cols, $at = '' ) {
		global $wpdb;
		$at    = '' === $at ? gmdate( 'Y-m-d H:i:s' ) : (string) $at;
		$table = HD_DD_Experiments::table();
		$set   = array();
		$args  = array();
		foreach ( $cols as $col ) {
			$set[]  = "{$col} = COALESCE({$col}, %s)";
			$args[] = $at;
		}
		$args = array_merge( $args, array( $ref['experimentId'], $ref['visitorId'], $ref['arm'] ) );
		$sql  = "UPDATE {$table} SET " . implode( ', ', $set ) . ' WHERE experiment_id = %s AND visitor_id = %s AND arm = %s';
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- table and column names are internal.
		return (int) $wpdb->query( call_user_func_array( array( $wpdb, 'prepare' ), array_merge( array( $sql ), $args ) ) );
	}

	/**
	 * Once, on upgrade: saves made before saved_at existed. Every row of a save-first flow
	 * (Swipe 2, Designer 3) began as a save, whatever it became later; Classic never saves.
	 */
	public static function backfill_saves() {
		global $wpdb;
		$et = HD_DD_Repository::table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal; no user input.
		$rows = (array) $wpdb->get_results( "SELECT flow, created_at, payload FROM {$et} WHERE payload LIKE '%\"experiment\"%'" );
		$n    = 0;
		foreach ( $rows as $r ) {
			if ( ! in_array( (string) $r->flow, array( 'swipe2', 'designer3' ), true ) ) {
				continue;
			}
			$ref = self::ref( json_decode( (string) $r->payload, true ) );
			if ( $ref && in_array( $ref['arm'], HD_DD_Experiments::ARMS, true ) ) {
				$n += self::mark( $ref, array( 'saved_at' ), (string) $r->created_at );
			}
		}
		return $n;
	}

	/** Journey start for an experiment: the later of its start and when recording began. */
	public static function since( array $exp ) {
		$started = isset( $exp['started_at'] ) ? (string) $exp['started_at'] : '';
		$since   = (string) get_option( self::SINCE, '' );
		return strcmp( $since, $started ) > 0 ? $since : $started;
	}

	/** The {experimentId, visitorId, arm} on a payload, or null. */
	private static function ref( $payload ) {
		if ( ! is_array( $payload ) || empty( $payload['experiment'] ) || ! is_array( $payload['experiment'] ) ) {
			return null;
		}
		$e = $payload['experiment'];
		if ( ! isset( $e['experimentId'], $e['visitorId'], $e['arm'] ) ) {
			return null;
		}
		return array( 'experimentId' => (string) $e['experimentId'], 'visitorId' => (string) $e['visitorId'], 'arm' => (string) $e['arm'] );
	}

	/** Max RATE_LIMIT steps per IP per fixed hour window. */
	private static function within_rate_limit() {
		$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) wp_unslash( $_SERVER['REMOTE_ADDR'] ) : '';
		$key = 'hd_dd_step_' . md5( $ip );
		$hit = get_transient( $key );
		$now = time();
		if ( ! is_array( $hit ) || $hit['until'] <= $now ) {
			$hit = array( 'n' => 0, 'until' => $now + self::RATE_WINDOW );
		}
		if ( $hit['n'] >= self::RATE_LIMIT ) {
			return false;
		}
		$hit['n']++;
		set_transient( $key, $hit, max( 1, $hit['until'] - $now ) );
		return true;
	}
}
