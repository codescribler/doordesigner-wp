<?php
/**
 * Pure maths for the A/B experiments: Bayesian posterior comparison of two
 * conversion rates, expected loss, and the guard checks that turn them into a
 * decision. No WordPress calls, so it runs (and is tested) under plain PHP.
 *
 * Each arm's conversion rate has a Beta(1 + leads, 1 + visitors - leads) posterior
 * (a flat prior). The win rule's thresholds live in default_rule() ONLY; the WP layer
 * passes them through the `hd_dd_experiment_rule` filter.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Experiment_Stats {

	/** Above this many visitors in an arm, P(B > A) uses the normal approximation. */
	const EXACT_LIMIT = 5000;

	/** Monte Carlo draws for expected loss, and the fixed seed that makes it repeatable. */
	const DRAWS = 20000;
	const SEED  = 20260928;

	/** @var int xorshift32 state. */
	private static $state = 1;

	/** @var float|null Spare Box-Muller normal. */
	private static $spare = null;

	/**
	 * The win rule. PROVISIONAL values — the single place to change them.
	 *
	 * @return array{prob_threshold:float,min_days:int,min_leads_per_arm:int,min_visitors_per_arm:int,loss_threshold:float,max_days:int}
	 */
	public static function default_rule() {
		return array(
			'prob_threshold'       => 0.95,  // P(an arm is best) needed to call it.
			'min_days'             => 14,    // two full weekly cycles.
			'min_leads_per_arm'    => 10,
			'min_visitors_per_arm' => 100,
			'loss_threshold'       => 0.005, // expected loss, absolute conversion-rate points (0.5pp).
			'max_days'             => 84,    // after this with no winner: no meaningful difference.
		);
	}

	/**
	 * Decide the state of an experiment.
	 *
	 * @param array $arms     { control: {flow, visitors, leads, label?}, challenger: {...} }.
	 * @param int   $days_run Whole days since the experiment started.
	 * @param array $rule     Overrides for default_rule() keys.
	 * @return array{status:string,winner:?string,prob_challenger_better:float,loss:array,guards:string[],rates:array}
	 */
	public static function evaluate( array $arms, $days_run, array $rule = array() ) {
		$rule = array_merge( self::default_rule(), $rule );
		$c    = self::arm( $arms, 'control' );
		$x    = self::arm( $arms, 'challenger' );

		$p    = self::prob_b_beats_a( $c['leads'], $c['visitors'], $x['leads'], $x['visitors'] );
		$loss = self::expected_loss( $c['leads'], $c['visitors'], $x['leads'], $x['visitors'] );
		$loss = array(
			'control'    => $loss['a'],
			'challenger' => $loss['b'],
		);

		$guards = array();
		$days   = (int) $days_run;
		if ( $days < (int) $rule['min_days'] ) {
			$guards[] = self::plural( (int) $rule['min_days'] - $days, 'more day', 'more days' );
		}
		foreach ( array( $c, $x ) as $a ) {
			if ( $a['leads'] < (int) $rule['min_leads_per_arm'] ) {
				$guards[] = self::plural( (int) $rule['min_leads_per_arm'] - $a['leads'], 'more lead', 'more leads' ) . ' in ' . $a['label'];
			}
			if ( $a['visitors'] < (int) $rule['min_visitors_per_arm'] ) {
				$guards[] = self::plural( (int) $rule['min_visitors_per_arm'] - $a['visitors'], 'more visitor', 'more visitors' ) . ' in ' . $a['label'];
			}
		}

		$winner = null;
		if ( ! $guards ) {
			if ( $p >= $rule['prob_threshold'] && $loss['challenger'] <= $rule['loss_threshold'] ) {
				$winner = $x['flow'];
			} elseif ( ( 1 - $p ) >= $rule['prob_threshold'] && $loss['control'] <= $rule['loss_threshold'] ) {
				$winner = $c['flow'];
			}
		}

		if ( null !== $winner ) {
			$status = 'winner';
		} elseif ( $days >= (int) $rule['max_days'] ) {
			$status = 'no_difference';
		} else {
			$status = 'running';
		}

		return array(
			'status'                 => $status,
			'winner'                 => $winner,
			'prob_challenger_better' => $p,
			'loss'                   => $loss,
			'guards'                 => $guards,
			'rates'                  => array(
				'control'    => self::rate( $c ),
				'challenger' => self::rate( $x ),
			),
		);
	}

	/**
	 * P(p_B > p_A) for Beta(1+conv, 1+n-conv) posteriors. Exact (Evan Miller's closed
	 * form) for normal traffic; a normal approximation once an arm passes EXACT_LIMIT.
	 */
	public static function prob_b_beats_a( $a_conv, $a_n, $b_conv, $b_n ) {
		list( $aa, $ba ) = self::posterior( $a_conv, $a_n );
		list( $ab, $bb ) = self::posterior( $b_conv, $b_n );

		if ( max( $a_n, $b_n ) > self::EXACT_LIMIT ) {
			$ma = $aa / ( $aa + $ba );
			$mb = $ab / ( $ab + $bb );
			$va = ( $aa * $ba ) / ( pow( $aa + $ba, 2 ) * ( $aa + $ba + 1 ) );
			$vb = ( $ab * $bb ) / ( pow( $ab + $bb, 2 ) * ( $ab + $bb + 1 ) );
			return self::clamp( self::norm_cdf( ( $mb - $ma ) / sqrt( $va + $vb ) ) );
		}

		$total = 0.0;
		$fixed = self::lbeta( $aa, $ba );
		for ( $i = 0; $i < $ab; $i++ ) {
			$total += exp( self::lbeta( $aa + $i, $ba + $bb ) - log( $bb + $i ) - self::lbeta( 1 + $i, $bb ) - $fixed );
		}
		return self::clamp( $total );
	}

	/**
	 * Expected loss (in conversion-rate points) of choosing each arm, by seeded Monte
	 * Carlo — deterministic for the same inputs.
	 *
	 * @return array{a:float,b:float} a = E[max(p_B - p_A, 0)] (loss of choosing A); b the reverse.
	 */
	public static function expected_loss( $a_conv, $a_n, $b_conv, $b_n, $draws = self::DRAWS, $seed = self::SEED ) {
		list( $aa, $ba ) = self::posterior( $a_conv, $a_n );
		list( $ab, $bb ) = self::posterior( $b_conv, $b_n );
		self::seed( $seed );

		$loss_a = 0.0;
		$loss_b = 0.0;
		for ( $i = 0; $i < $draws; $i++ ) {
			$pa = self::beta_sample( $aa, $ba );
			$pb = self::beta_sample( $ab, $bb );
			if ( $pb > $pa ) {
				$loss_a += $pb - $pa;
			} else {
				$loss_b += $pa - $pb;
			}
		}
		return array(
			'a' => $loss_a / $draws,
			'b' => $loss_b / $draws,
		);
	}

	/** log Γ(x) — Lanczos approximation (g = 7, n = 9), reflection below 0.5. */
	public static function lgamma( $x ) {
		static $c = array( 0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7 );
		if ( $x < 0.5 ) {
			return log( M_PI / abs( sin( M_PI * $x ) ) ) - self::lgamma( 1 - $x );
		}
		$x -= 1;
		$a  = $c[0];
		$t  = $x + 7.5;
		for ( $i = 1; $i < 9; $i++ ) {
			$a += $c[ $i ] / ( $x + $i );
		}
		return 0.5 * log( 2 * M_PI ) + ( $x + 0.5 ) * log( $t ) - $t + log( $a );
	}

	/** log B(a, b). */
	public static function lbeta( $a, $b ) {
		return self::lgamma( $a ) + self::lgamma( $b ) - self::lgamma( $a + $b );
	}

	/** Standard normal CDF via a Chebyshev erfc (|error| < 1.2e-7). */
	public static function norm_cdf( $x ) {
		$z = abs( $x ) / M_SQRT2;
		$t = 1 / ( 1 + 0.5 * $z );
		$r = $t * exp( -$z * $z - 1.26551223 + $t * ( 1.00002368 + $t * ( 0.37409196 + $t * ( 0.09678418 + $t * ( -0.18628806 + $t * ( 0.27886807 + $t * ( -1.13520398 + $t * ( 1.48851587 + $t * ( -0.82215223 + $t * 0.17087277 ) ) ) ) ) ) ) ) );
		return $x >= 0 ? 1 - 0.5 * $r : 0.5 * $r;
	}

	// -------------------------------------------------------------------
	// Sampling (seeded xorshift32 → Box-Muller → Marsaglia-Tsang gamma)
	// -------------------------------------------------------------------
	private static function seed( $seed ) {
		self::$state = ( (int) $seed & 0xFFFFFFFF ) ?: 1;
		self::$spare = null;
	}

	/** Uniform on (0, 1). xorshift32 never yields 0, so log() is always safe. */
	private static function uniform() {
		$x  = self::$state;
		$x ^= ( $x << 13 ) & 0xFFFFFFFF;
		$x ^= $x >> 17;
		$x ^= ( $x << 5 ) & 0xFFFFFFFF;
		self::$state = $x;
		return $x / 4294967296.0;
	}

	private static function normal() {
		if ( null !== self::$spare ) {
			$n           = self::$spare;
			self::$spare = null;
			return $n;
		}
		$r           = sqrt( -2 * log( self::uniform() ) );
		$theta       = 2 * M_PI * self::uniform();
		self::$spare = $r * sin( $theta );
		return $r * cos( $theta );
	}

	/** Gamma(shape, 1) for shape >= 1 (always true here: shape = 1 + count). */
	private static function gamma_sample( $shape ) {
		$d = $shape - 1 / 3;
		$c = 1 / sqrt( 9 * $d );
		while ( true ) {
			$x = self::normal();
			$v = 1 + $c * $x;
			if ( $v <= 0 ) {
				continue;
			}
			$v = $v * $v * $v;
			if ( log( self::uniform() ) < 0.5 * $x * $x + $d - $d * $v + $d * log( $v ) ) {
				return $d * $v;
			}
		}
	}

	private static function beta_sample( $a, $b ) {
		$x = self::gamma_sample( $a );
		$y = self::gamma_sample( $b );
		return $x / ( $x + $y );
	}

	// -------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------
	/** Beta posterior parameters, with counts clamped to sane integers. */
	private static function posterior( $conv, $n ) {
		$n    = max( 0, (int) $n );
		$conv = min( $n, max( 0, (int) $conv ) );
		return array( 1 + $conv, 1 + $n - $conv );
	}

	private static function arm( array $arms, $key ) {
		$a        = isset( $arms[ $key ] ) && is_array( $arms[ $key ] ) ? $arms[ $key ] : array();
		$flow     = isset( $a['flow'] ) ? (string) $a['flow'] : $key;
		$visitors = isset( $a['visitors'] ) ? max( 0, (int) $a['visitors'] ) : 0;
		return array(
			'flow'     => $flow,
			'label'    => isset( $a['label'] ) ? (string) $a['label'] : ucfirst( $flow ),
			'visitors' => $visitors,
			'leads'    => isset( $a['leads'] ) ? min( $visitors, max( 0, (int) $a['leads'] ) ) : 0,
		);
	}

	private static function rate( array $a ) {
		return $a['visitors'] ? $a['leads'] / $a['visitors'] : 0.0;
	}

	private static function plural( $n, $one, $many ) {
		return $n . ' ' . ( 1 === $n ? $one : $many );
	}

	private static function clamp( $p ) {
		return max( 0.0, min( 1.0, (float) $p ) );
	}
}
