<?php
/**
 * Pure maths for the A/B experiments: Bayesian posterior comparison of two
 * conversion rates, expected loss, and the guard checks that turn them into a
 * decision. No WordPress calls, so it runs (and is tested) under plain PHP.
 *
 * Each arm's conversion rate has a Beta(α, β) posterior with α = 1 + leads and
 * β = 1 + visitors − leads (a flat prior). α and β are always integers, so every
 * log-gamma is an exact log-factorial: lnΓ(n) = Σ_{k=1}^{n−1} ln k.
 *
 * The win rule's thresholds live in default_rule() ONLY; the WP layer passes them
 * through the `hd_dd_experiment_rule` filter.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Experiment_Stats {

	/** @var float[] Cumulative log-factorials: $log_fact[n] = ln(n!). Grown on demand. */
	private static $log_fact = array( 0.0 );

	/**
	 * The win rule. Set from simulations of this site's traffic (≈18 designer starters
	 * and 4 leads a week): about an 8% false-winner rate per direction when there is no
	 * real difference, and about a 1% chance of promoting the worse version when there is.
	 *
	 * @return array{prob_threshold:float,min_days:int,min_leads_per_arm:int,min_visitors_per_arm:int,max_days:int}
	 */
	public static function default_rule() {
		return array(
			'prob_threshold'       => 0.975, // P(an arm beats the other) needed to call it, either direction.
			'min_days'             => 14,    // two full weekly cycles.
			'min_leads_per_arm'    => 15,    // converting unique visitors.
			'min_visitors_per_arm' => 0,     // 0 = no visitor guard.
			'max_days'             => 182,   // 26 weeks; no winner by then = no meaningful difference.
		);
	}

	/**
	 * Decide the state of an experiment. Expected loss is reported, never used to decide.
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
			if ( $p >= $rule['prob_threshold'] ) {
				$winner = $x['flow'];
			} elseif ( 1 - $p >= $rule['prob_threshold'] ) {
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
			'loss'                   => array(
				'control'    => $loss['a'],
				'challenger' => $loss['b'],
			),
			'guards'                 => $guards,
			'rates'                  => array(
				'control'    => self::rate( $c ),
				'challenger' => self::rate( $x ),
			),
		);
	}

	/** P(p_B > p_A) from lead / visitor counts — exact, Evan Miller's closed form. */
	public static function prob_b_beats_a( $a_conv, $a_n, $b_conv, $b_n ) {
		list( $aa, $ba ) = self::posterior( $a_conv, $a_n );
		list( $ab, $bb ) = self::posterior( $b_conv, $b_n );
		return self::prob_beta( $aa, $ba, $ab, $bb );
	}

	/**
	 * Expected loss, in conversion-rate points, of choosing each arm — exact, from the
	 * posterior means and the same closed form with one α bumped (X⁺ = α + 1):
	 *   EL_B = mA·P(A⁺ > B) − mB·P(A > B⁺),   EL_A = mB·P(B⁺ > A) − mA·P(B > A⁺).
	 *
	 * @return array{a:float,b:float} a = E[max(p_B − p_A, 0)] (loss if you pick A); b the reverse.
	 */
	public static function expected_loss( $a_conv, $a_n, $b_conv, $b_n ) {
		list( $aa, $ba ) = self::posterior( $a_conv, $a_n );
		list( $ab, $bb ) = self::posterior( $b_conv, $b_n );
		$ma = $aa / ( $aa + $ba );
		$mb = $ab / ( $ab + $bb );

		// prob_beta( A…, B… ) is P(B > A).
		$el_b = $ma * self::prob_beta( $ab, $bb, $aa + 1, $ba ) - $mb * self::prob_beta( $ab + 1, $bb, $aa, $ba );
		$el_a = $mb * self::prob_beta( $aa, $ba, $ab + 1, $bb ) - $ma * self::prob_beta( $aa + 1, $ba, $ab, $bb );
		return array(
			'a' => max( 0.0, $el_a ),
			'b' => max( 0.0, $el_b ),
		);
	}

	/** lnΓ(n) for a positive integer n: ln((n−1)!). */
	public static function lgamma( $n ) {
		$n = (int) $n - 1;
		for ( $k = count( self::$log_fact ); $k <= $n; $k++ ) {
			self::$log_fact[ $k ] = self::$log_fact[ $k - 1 ] + log( $k );
		}
		return self::$log_fact[ $n ];
	}

	/** ln B(a, b) for positive integers. */
	public static function lbeta( $a, $b ) {
		return self::lgamma( $a ) + self::lgamma( $b ) - self::lgamma( $a + $b );
	}

	/**
	 * P(X_B > X_A) for X_A ~ Beta(aa, ba), X_B ~ Beta(ab, bb), integer parameters:
	 *   Σ_{i=0}^{ab−1} exp( lnB(aa+i, ba+bb) − ln(bb+i) − lnB(1+i, bb) − lnB(aa, ba) ).
	 */
	private static function prob_beta( $aa, $ba, $ab, $bb ) {
		$total = 0.0;
		$fixed = self::lbeta( $aa, $ba );
		for ( $i = 0; $i < $ab; $i++ ) {
			$total += exp( self::lbeta( $aa + $i, $ba + $bb ) - log( $bb + $i ) - self::lbeta( 1 + $i, $bb ) - $fixed );
		}
		return max( 0.0, min( 1.0, $total ) );
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
}
