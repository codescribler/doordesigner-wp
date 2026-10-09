<?php
/**
 * Shared set-up for the experiment tests (not a test itself — run.php only picks up
 * *.test.php). A $wpdb stand-in that understands the handful of statements
 * HD_DD_Experiments issues against the visitors table, so the tests assert real
 * INSERT IGNORE / "converted once" semantics rather than just the SQL text.
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-stats.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-notifier.php';
require_once HD_DD_DIR . 'includes/class-hd-experiments.php';

class HD_Test_Exp_WPDB extends HD_Test_WPDB {
	/** @var array "experiment|visitor" => {experiment_id, visitor_id, arm, exposed_at, converted_at} */
	public $visitors = array();
	public $queries  = array();

	public function prepare( $q ) {
		$args = array_slice( func_get_args(), 1 );
		$i    = 0;
		return preg_replace_callback(
			'/%[sd]/',
			function ( $m ) use ( $args, &$i ) {
				$v = $args[ $i++ ];
				return '%d' === $m[0] ? (string) (int) $v : "'" . addslashes( (string) $v ) . "'";
			},
			$q
		);
	}

	public function query( $q ) {
		$this->queries[] = $q;
		if ( preg_match( "/^INSERT IGNORE INTO wp_hd_dd_experiment_visitors \(experiment_id, visitor_id, arm, exposed_at\) VALUES \('([^']*)', '([^']*)', '([^']*)', '([^']*)'\)$/", $q, $m ) ) {
			$key = $m[1] . '|' . $m[2];
			if ( isset( $this->visitors[ $key ] ) ) {
				return 0;
			}
			$this->visitors[ $key ] = array( 'experiment_id' => $m[1], 'visitor_id' => $m[2], 'arm' => $m[3], 'exposed_at' => $m[4], 'converted_at' => null );
			return 1;
		}
		if ( preg_match( "/^UPDATE wp_hd_dd_experiment_visitors SET converted_at = '([^']*)' WHERE experiment_id = '([^']*)' AND visitor_id = '([^']*)' AND arm = '([^']*)' AND converted_at IS NULL$/", $q, $m ) ) {
			$key = $m[2] . '|' . $m[3];
			if ( isset( $this->visitors[ $key ] ) && $m[4] === $this->visitors[ $key ]['arm'] && null === $this->visitors[ $key ]['converted_at'] ) {
				$this->visitors[ $key ]['converted_at'] = $m[1];
				return 1;
			}
			return 0;
		}
		return parent::query( $q );
	}

	public function get_results( $q ) {
		if ( preg_match( "/FROM wp_hd_dd_experiment_visitors WHERE experiment_id = '([^']*)' GROUP BY arm$/", $q, $m ) ) {
			$out = array();
			foreach ( $this->visitors as $v ) {
				if ( $v['experiment_id'] !== $m[1] ) {
					continue;
				}
				if ( ! isset( $out[ $v['arm'] ] ) ) {
					$out[ $v['arm'] ] = (object) array( 'arm' => $v['arm'], 'visitors' => 0, 'leads' => 0 );
				}
				$out[ $v['arm'] ]->visitors++;
				$out[ $v['arm'] ]->leads += null === $v['converted_at'] ? 0 : 1;
			}
			return array_values( $out );
		}
		return parent::get_results( $q );
	}

	public function get_var( $q ) {
		if ( preg_match( "/^SELECT COUNT\(\*\) FROM wp_hd_dd_experiment_visitors WHERE experiment_id = '([^']*)' AND visitor_id = '([^']*)'$/", $q, $m ) ) {
			return isset( $this->visitors[ $m[1] . '|' . $m[2] ] ) ? 1 : 0;
		}
		return parent::get_var( $q );
	}

	/** Test helper: add n visitors to an arm, the first $leads of them converted. */
	public function seed( $exp_id, $arm, $n, $leads ) {
		for ( $i = 0; $i < $n; $i++ ) {
			$vid = md5( $exp_id . $arm . $i );
			$this->visitors[ $exp_id . '|' . $vid ] = array( 'experiment_id' => $exp_id, 'visitor_id' => $vid, 'arm' => $arm, 'exposed_at' => '2026-09-01 00:00:00', 'converted_at' => $i < $leads ? '2026-09-02 00:00:00' : null );
		}
	}
}

/** Fresh WP state with the experiment-aware $wpdb. */
function hd_exp_reset() {
	hd_test_reset();
	$GLOBALS['wpdb'] = new HD_Test_Exp_WPDB();
}

/** Start an experiment, optionally back-dated by $days_ago. */
function hd_exp_start( $days_ago = 0, $control = 'classic', $challenger = 'swipe2', $percent = 50 ) {
	$exp = HD_DD_Experiments::start( $control, $challenger, $percent );
	if ( $days_ago && is_array( $exp ) ) {
		$exp['started_at'] = gmdate( 'Y-m-d H:i:s', time() - $days_ago * 86400 - 60 );
		HD_DD_Experiments::save( $exp );
	}
	return $exp;
}

/** POST /experiment/expose through the real handler. */
function hd_exp_expose( array $body ) {
	$e = new HD_DD_Experiments();
	return $e->rest_expose( hd_test_request( 'POST', '/hd-door-designer/v1/experiment/expose', $body ) );
}

hd_exp_reset();
