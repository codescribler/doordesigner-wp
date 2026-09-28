<?php
/**
 * A/B experiments between designer flows: the current experiment (an option), the
 * exposure table, the public expose route, the enquiry → conversion listener and the
 * daily evaluation cron. The maths lives in HD_DD_Experiment_Stats; the emails in
 * HD_DD_Experiment_Notifier; the wp-admin page in HD_DD_Experiments_Admin.
 *
 * One experiment at a time. Its `arm` values are always 'control' / 'challenger'; the
 * experiment maps each to a flow key. An experiment stays live (and counting) through
 * winner_found / no_difference until Daniel makes a flow the default or stops it.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Experiments {

	const OPTION      = 'hd_dd_experiment';
	const HISTORY     = 'hd_dd_experiment_history';
	const DB_OPTION   = 'hd_dd_experiments_db_version';
	const DB_VERSION  = '1';
	const CRON        = 'hd_dd_experiment_evaluate';
	const RATE_LIMIT  = 30;   // exposes per IP …
	const RATE_WINDOW = 3600; // … per hour.
	const ARMS        = array( 'control', 'challenger' );

	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'hd_dd_enquiry_submitted', array( $this, 'on_enquiry' ), 10, 2 );
		add_action( self::CRON, array( $this, 'evaluate_current' ) );
		add_action( 'init', array( __CLASS__, 'schedule' ) );
	}

	// -------------------------------------------------------------------
	// Flows + state
	// -------------------------------------------------------------------
	/** @return array flow key => label. */
	public static function flows() {
		return (array) apply_filters( 'hd_dd_flows', array( 'classic' => 'Classic', 'swipe' => 'Swipe' ) );
	}

	public static function is_flow( $flow ) {
		return is_string( $flow ) && '' !== $flow && array_key_exists( $flow, self::flows() );
	}

	public static function flow_label( $flow ) {
		$flows = self::flows();
		return isset( $flows[ $flow ] ) ? (string) $flows[ $flow ] : ucfirst( (string) $flow );
	}

	/** The default flow setting, forced to a registered flow. */
	public static function default_flow() {
		$settings = HD_DD_Plugin::settings();
		$flow     = isset( $settings['default_flow'] ) ? $settings['default_flow'] : 'classic';
		return self::is_flow( $flow ) ? $flow : 'classic';
	}

	/** @return array|null The live experiment, or null. */
	public static function current() {
		$exp = get_option( self::OPTION, null );
		return ( is_array( $exp ) && ! empty( $exp['id'] ) ) ? $exp : null;
	}

	public static function save( array $exp ) {
		update_option( self::OPTION, $exp, true );
	}

	/** @return array Finished experiments, oldest first. */
	public static function history() {
		$h = get_option( self::HISTORY, array() );
		return is_array( $h ) ? $h : array();
	}

	/** What HD_DD_CONFIG.flow carries to the browser. */
	public static function front_config() {
		$exp = self::current();
		return array(
			'default'    => self::default_flow(),
			'experiment' => $exp ? array(
				'id'         => $exp['id'],
				'control'    => $exp['control'],
				'challenger' => $exp['challenger'],
				'percent'    => (int) $exp['percent'],
			) : null,
		);
	}

	// -------------------------------------------------------------------
	// Lifecycle: start / end
	// -------------------------------------------------------------------
	/** @return array|WP_Error The new experiment. */
	public static function start( $control, $challenger, $percent = 50 ) {
		if ( self::current() ) {
			return new WP_Error( 'hd_dd_exp_running', __( 'A test is already running. Stop it first.', 'hd-door-designer' ) );
		}
		if ( ! self::is_flow( $control ) || ! self::is_flow( $challenger ) || $control === $challenger ) {
			return new WP_Error( 'hd_dd_exp_flows', __( 'Pick two different flows.', 'hd-door-designer' ) );
		}
		$percent = (int) $percent;
		if ( $percent < 1 || $percent > 99 ) {
			return new WP_Error( 'hd_dd_exp_percent', __( 'The split must be between 1 and 99%.', 'hd-door-designer' ) );
		}
		$exp = array(
			'id'           => 'exp_' . gmdate( 'Ymd' ) . '_' . bin2hex( random_bytes( 3 ) ),
			'control'      => $control,
			'challenger'   => $challenger,
			'percent'      => $percent,
			'started_at'   => gmdate( 'Y-m-d H:i:s' ),
			'status'       => 'running',
			'decided_at'   => null,
			'decision'     => null,
			'emailed'      => array( 'winner' => false, 'no_difference' => false ),
			'unattributed' => 0,
		);
		self::save( $exp );
		return $exp;
	}

	/**
	 * End the live experiment: snapshot its final numbers into history, then remove it.
	 *
	 * @param string $outcome 'stopped' or 'made_default:<flow>'.
	 * @return array|null The history entry.
	 */
	public static function end( $outcome ) {
		$exp = self::current();
		if ( ! $exp ) {
			return null;
		}
		$entry             = $exp;
		$entry['stats']    = self::arms( $exp );
		$entry['decision'] = self::evaluate( $exp );
		$entry['outcome']  = (string) $outcome;
		$entry['ended_at'] = gmdate( 'Y-m-d H:i:s' );

		$history   = self::history();
		$history[] = $entry;
		update_option( self::HISTORY, $history, false );
		delete_option( self::OPTION );
		return $entry;
	}

	/** End the experiment and make one of its two flows the default. */
	public static function make_default( $flow ) {
		$exp = self::current();
		if ( ! $exp || ! in_array( $flow, array( $exp['control'], $exp['challenger'] ), true ) ) {
			return new WP_Error( 'hd_dd_exp_flow', __( 'That flow is not part of the current test.', 'hd-door-designer' ) );
		}
		$settings                 = HD_DD_Plugin::settings();
		$settings['default_flow'] = $flow;
		update_option( 'hd_dd_settings', $settings );
		return self::end( 'made_default:' . $flow );
	}

	// -------------------------------------------------------------------
	// Numbers
	// -------------------------------------------------------------------
	/** Whole days since the experiment started. */
	public static function days_run( array $exp, $now = null ) {
		$start = strtotime( $exp['started_at'] . ' UTC' );
		$now   = null === $now ? time() : (int) $now;
		return $start ? max( 0, (int) floor( ( $now - $start ) / 86400 ) ) : 0;
	}

	/** @return array Per arm: {flow, label, visitors, leads} — the shape evaluate() takes. */
	public static function arms( array $exp ) {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT arm, COUNT(*) AS visitors, COUNT(converted_at) AS leads FROM {$table} WHERE experiment_id = %s GROUP BY arm", $exp['id'] ) );
		$out  = array();
		foreach ( self::ARMS as $arm ) {
			$out[ $arm ] = array( 'flow' => $exp[ $arm ], 'label' => self::flow_label( $exp[ $arm ] ), 'visitors' => 0, 'leads' => 0 );
		}
		foreach ( (array) $rows as $r ) {
			if ( isset( $out[ $r->arm ] ) ) {
				$out[ $r->arm ]['visitors'] = (int) $r->visitors;
				$out[ $r->arm ]['leads']    = (int) $r->leads;
			}
		}
		return $out;
	}

	/** Live decision for an experiment under the (filterable) win rule. */
	public static function evaluate( array $exp ) {
		return HD_DD_Experiment_Stats::evaluate( self::arms( $exp ), self::days_run( $exp ), self::rule() );
	}

	/** The win rule: HD_DD_Experiment_Stats::default_rule() through `hd_dd_experiment_rule`. */
	public static function rule() {
		return array_merge( HD_DD_Experiment_Stats::default_rule(), (array) apply_filters( 'hd_dd_experiment_rule', HD_DD_Experiment_Stats::default_rule() ) );
	}

	/** Daily cron: store the decision; flag + email the first winner / no-difference once. */
	public function evaluate_current() {
		$exp = self::current();
		if ( ! $exp ) {
			return;
		}
		$decision        = self::evaluate( $exp );
		$exp['decision'] = $decision;
		$kind            = 'winner' === $decision['status'] ? 'winner' : ( 'no_difference' === $decision['status'] ? 'no_difference' : '' );

		// Only the first call is acted on: the status never flips back, and each email goes once.
		if ( $kind && 'running' === $exp['status'] ) {
			$exp['status']     = 'winner' === $kind ? 'winner_found' : 'no_difference';
			$exp['decided_at'] = gmdate( 'Y-m-d H:i:s' );
			if ( empty( $exp['emailed'][ $kind ] ) ) {
				HD_DD_Experiment_Notifier::send( $exp, $decision, self::arms( $exp ), self::days_run( $exp ) );
				$exp['emailed'][ $kind ] = true;
			}
		}
		self::save( $exp );
	}

	public static function schedule() {
		if ( ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + 3600, 'daily', self::CRON );
		}
	}

	// -------------------------------------------------------------------
	// REST: exposure beacon
	// -------------------------------------------------------------------
	public function register_routes() {
		register_rest_route(
			HD_DD_REST_NS,
			'/experiment/expose',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'rest_expose' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/** Record that a visitor opened the designer in an arm. First exposure wins. */
	public function rest_expose( WP_REST_Request $request ) {
		if ( ! $this->within_rate_limit() ) {
			return new WP_REST_Response( array( 'ok' => false ), 429 );
		}
		$p       = $request->get_params();
		$id      = isset( $p['experimentId'] ) ? (string) $p['experimentId'] : '';
		$visitor = isset( $p['visitorId'] ) ? (string) $p['visitorId'] : '';
		$arm     = isset( $p['arm'] ) ? (string) $p['arm'] : '';

		if ( ! preg_match( '/^[a-f0-9]{32}$/', $visitor ) || ! in_array( $arm, self::ARMS, true ) ) {
			return new WP_REST_Response( array( 'ok' => false ), 400 );
		}
		$exp = self::current();
		if ( ! $exp || $exp['id'] !== $id ) {
			return new WP_REST_Response( array( 'ok' => false ), 200 ); // stale tab / old experiment.
		}

		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		$wpdb->query( $wpdb->prepare( "INSERT IGNORE INTO {$table} (experiment_id, visitor_id, arm, exposed_at) VALUES (%s, %s, %s, %s)", $id, $visitor, $arm, gmdate( 'Y-m-d H:i:s' ) ) );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/** Max RATE_LIMIT exposes per IP per fixed hour window. */
	private function within_rate_limit() {
		$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) wp_unslash( $_SERVER['REMOTE_ADDR'] ) : '';
		$key = 'hd_dd_expose_' . md5( $ip );
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

	// -------------------------------------------------------------------
	// Conversion
	// -------------------------------------------------------------------
	/**
	 * Sanitise the `experiment` object an enquiry POST carries. Null when malformed.
	 *
	 * @param mixed $raw { experimentId, visitorId, arm }.
	 * @return array|null
	 */
	public static function sanitize_ref( $raw ) {
		if ( ! is_array( $raw ) || ! isset( $raw['experimentId'], $raw['visitorId'], $raw['arm'] ) ) {
			return null;
		}
		$id      = (string) $raw['experimentId'];
		$visitor = (string) $raw['visitorId'];
		$arm     = (string) $raw['arm'];
		if ( ! preg_match( '/^exp_[0-9]{8}_[a-f0-9]{6}$/', $id ) || ! preg_match( '/^[a-f0-9]{32}$/', $visitor ) ) {
			return null;
		}
		if ( ! in_array( $arm, self::ARMS, true ) && ! self::is_flow( $arm ) ) {
			return null;
		}
		$ref = array( 'experimentId' => $id, 'visitorId' => $visitor, 'arm' => $arm );
		$exp = self::current();
		if ( $exp && $exp['id'] === $id && in_array( $arm, self::ARMS, true ) ) {
			$ref['flow'] = $exp[ $arm ]; // readable in wp-admin.
		}
		return $ref;
	}

	/** hd_dd_enquiry_submitted listener: mark the visitor converted, once. */
	public function on_enquiry( $payload, $id = 0 ) {
		if ( empty( $payload['experiment'] ) || ! is_array( $payload['experiment'] ) ) {
			return;
		}
		$ref = $payload['experiment'];
		global $wpdb;
		$table = self::table();
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		$updated = $wpdb->query( $wpdb->prepare( "UPDATE {$table} SET converted_at = %s WHERE experiment_id = %s AND visitor_id = %s AND arm = %s AND converted_at IS NULL", gmdate( 'Y-m-d H:i:s' ), $ref['experimentId'], $ref['visitorId'], $ref['arm'] ) );
		if ( $updated ) {
			return;
		}
		$known = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE experiment_id = %s AND visitor_id = %s", $ref['experimentId'], $ref['visitorId'] ) );
		// phpcs:enable
		$exp = self::current();
		if ( ! $known && $exp && $exp['id'] === $ref['experimentId'] ) {
			$exp['unattributed'] = ( isset( $exp['unattributed'] ) ? (int) $exp['unattributed'] : 0 ) + 1;
			self::save( $exp );
		}
	}

	// -------------------------------------------------------------------
	// Schema
	// -------------------------------------------------------------------
	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'hd_dd_experiment_visitors';
	}

	/** Create the table on update as well as activation. Cheap no-op once current. */
	public static function maybe_upgrade() {
		if ( get_option( self::DB_OPTION ) !== self::DB_VERSION ) {
			self::create_table();
			update_option( self::DB_OPTION, self::DB_VERSION, false );
		}
	}

	public static function create_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$table   = self::table();
		$charset = $wpdb->get_charset_collate();
		dbDelta(
			"CREATE TABLE {$table} (
			experiment_id VARCHAR(40) NOT NULL,
			visitor_id CHAR(32) NOT NULL,
			arm VARCHAR(20) NOT NULL,
			exposed_at DATETIME NOT NULL,
			converted_at DATETIME NULL DEFAULT NULL,
			PRIMARY KEY  (experiment_id, visitor_id),
			KEY experiment_arm (experiment_id, arm)
		) {$charset};"
		);
	}
}
