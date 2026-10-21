<?php
/**
 * The experiment data for outside readers: snapshot() is the contract the manager app
 * consumes (see the Run shape below); export_data() is the full raw dump behind the
 * wp-admin "Download test data" button. Neither carries customer names, emails or phones.
 *
 * Run = { id, control, challenger ({flow,label,visitors,leads,callbacks}), percent,
 *         startedAt, endedAt|null, outcome|null, splitChanges [{at,from,to}],
 *         decision {status, winner, probChallengerBetter, lossControl, lossChallenger, guards[]} }
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Experiment_Export {

	/** @return array {generatedAt, current: Run|null, history: Run[]} */
	public static function snapshot() {
		$exp     = HD_DD_Experiments::current();
		$history = array();
		foreach ( HD_DD_Experiments::history() as $h ) {
			if ( is_array( $h ) ) {
				$history[] = self::run( $h, isset( $h['stats'] ) ? (array) $h['stats'] : array(), isset( $h['decision'] ) ? (array) $h['decision'] : array() );
			}
		}
		return array(
			'generatedAt' => self::iso( gmdate( 'Y-m-d H:i:s' ) ),
			'current'     => $exp ? self::run( $exp, HD_DD_Experiments::arms( $exp ), HD_DD_Experiments::evaluate( $exp ) ) : null,
			'history'     => $history,
		);
	}

	/** @return array Everything stored about experiments, raw, plus experiment-tagged enquiries (no customer details). */
	public static function export_data() {
		global $wpdb;
		$vt = HD_DD_Experiments::table();
		$et = HD_DD_Repository::table();
		// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared -- table names are internal; no user input.
		$visitors = (array) $wpdb->get_results( "SELECT * FROM {$vt} ORDER BY exposed_at ASC" );
		$rows     = (array) $wpdb->get_results( "SELECT reference, kind, flow, created_at, payload FROM {$et} WHERE payload LIKE '%\"experiment\"%' ORDER BY created_at ASC" );
		// phpcs:enable
		$enquiries = array();
		foreach ( $rows as $r ) {
			$payload = json_decode( (string) $r->payload, true );
			if ( ! is_array( $payload ) || empty( $payload['experiment'] ) || ! is_array( $payload['experiment'] ) ) {
				continue;
			}
			$ref         = $payload['experiment'];
			$enquiries[] = array(
				'reference'    => (string) $r->reference,
				'kind'         => (string) $r->kind,
				'flow'         => (string) $r->flow,
				'created_at'   => (string) $r->created_at,
				'experimentId' => isset( $ref['experimentId'] ) ? (string) $ref['experimentId'] : '',
				'arm'          => isset( $ref['arm'] ) ? (string) $ref['arm'] : '',
			);
		}
		return array(
			'exportedAt' => self::iso( gmdate( 'Y-m-d H:i:s' ) ),
			'current'    => get_option( HD_DD_Experiments::OPTION, null ),
			'history'    => HD_DD_Experiments::history(),
			'visitors'   => array_map( array( __CLASS__, 'visitor_row' ), $visitors ),
			'enquiries'  => $enquiries,
		);
	}

	private static function visitor_row( $v ) {
		return is_object( $v ) ? get_object_vars( $v ) : (array) $v;
	}

	private static function run( array $exp, array $stats, array $decision ) {
		$ended = isset( $exp['ended_at'] ) ? $exp['ended_at'] : null;
		return array(
			'id'           => (string) $exp['id'],
			'control'      => self::arm( $exp, $stats, 'control' ),
			'challenger'   => self::arm( $exp, $stats, 'challenger' ),
			'percent'      => (int) $exp['percent'],
			'startedAt'    => self::iso( isset( $exp['started_at'] ) ? $exp['started_at'] : '' ),
			'endedAt'      => $ended ? self::iso( $ended ) : null,
			'outcome'      => isset( $exp['outcome'] ) ? (string) $exp['outcome'] : null,
			'splitChanges' => self::split_changes( $exp ),
			'decision'     => self::decision( $decision ),
		);
	}

	private static function arm( array $exp, array $stats, $key ) {
		$s    = isset( $stats[ $key ] ) && is_array( $stats[ $key ] ) ? $stats[ $key ] : array();
		$flow = isset( $s['flow'] ) ? (string) $s['flow'] : (string) $exp[ $key ];
		return array(
			'flow'      => $flow,
			'label'     => isset( $s['label'] ) ? (string) $s['label'] : HD_DD_Experiments::flow_label( $flow ),
			'visitors'  => isset( $s['visitors'] ) ? (int) $s['visitors'] : 0,
			'leads'     => isset( $s['leads'] ) ? (int) $s['leads'] : 0,
			'callbacks' => isset( $s['callbacks'] ) ? (int) $s['callbacks'] : 0,
		);
	}

	private static function split_changes( array $exp ) {
		$out = array();
		foreach ( ( isset( $exp['split_changes'] ) && is_array( $exp['split_changes'] ) ) ? $exp['split_changes'] : array() as $c ) {
			$out[] = array( 'at' => self::iso( isset( $c['at'] ) ? $c['at'] : '' ), 'from' => (int) $c['from'], 'to' => (int) $c['to'] );
		}
		return $out;
	}

	private static function decision( array $d ) {
		$loss = isset( $d['loss'] ) && is_array( $d['loss'] ) ? $d['loss'] : array();
		return array(
			'status'               => isset( $d['status'] ) ? (string) $d['status'] : 'running',
			'winner'               => isset( $d['winner'] ) && $d['winner'] ? (string) $d['winner'] : null,
			'probChallengerBetter' => isset( $d['prob_challenger_better'] ) ? (float) $d['prob_challenger_better'] : 0.0,
			'lossControl'          => isset( $loss['control'] ) ? (float) $loss['control'] : 0.0,
			'lossChallenger'       => isset( $loss['challenger'] ) ? (float) $loss['challenger'] : 0.0,
			'guards'               => array_values( array_map( 'strval', isset( $d['guards'] ) ? (array) $d['guards'] : array() ) ),
		);
	}

	/** 'Y-m-d H:i:s' (UTC) → ISO 8601 with a Z. */
	private static function iso( $mysql ) {
		$t = strtotime( (string) $mysql . ' UTC' );
		return $t ? gmdate( 'Y-m-d\TH:i:s\Z', $t ) : (string) $mysql;
	}
}
