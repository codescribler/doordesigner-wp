<?php
/**
 * The experiment maths: posterior probability, expected loss, guards and the decision.
 * Run: php tests/php/experiment-stats.test.php
 */
require __DIR__ . '/wp-stubs.php';
require_once HD_DD_DIR . 'includes/class-hd-experiment-stats.php';

/**
 * Independent Monte Carlo reference for P(p_B > p_A): for integer shapes a Beta(a, b)
 * draw is G_a / (G_a + G_b) with G_k a sum of k unit exponentials — a different
 * method from the class's closed form, so agreement is a real cross-check.
 */
function hd_test_mc_prob( $a_conv, $a_n, $b_conv, $b_n, $draws = 6000 ) {
	mt_srand( 42 );
	$g = function ( $k ) {
		$s = 0.0;
		for ( $i = 0; $i < $k; $i++ ) {
			$s -= log( ( mt_rand() + 1 ) / ( mt_getrandmax() + 2 ) );
		}
		return $s;
	};
	$wins = 0;
	for ( $i = 0; $i < $draws; $i++ ) {
		$ga = $g( 1 + $a_conv );
		$pa = $ga / ( $ga + $g( 1 + $a_n - $a_conv ) );
		$gb = $g( 1 + $b_conv );
		$pb = $gb / ( $gb + $g( 1 + $b_n - $b_conv ) );
		$wins += $pb > $pa ? 1 : 0;
	}
	return $wins / $draws;
}

$S = 'HD_DD_Experiment_Stats';

// --- lgamma sanity: Γ(5) = 24, Γ(0.5) = √π --------------------------------------
check( abs( $S::lgamma( 5 ) - log( 24 ) ) < 1e-10, 'lgamma(5) = ln 24' );
check( abs( $S::lgamma( 0.5 ) - log( sqrt( M_PI ) ) ) < 1e-10, 'lgamma(0.5) = ln √π' );
check( abs( $S::norm_cdf( 1.96 ) - 0.9750021 ) < 1e-6, 'norm_cdf(1.96) ≈ 0.975' );

// --- P(B > A) --------------------------------------------------------------------
$p = $S::prob_b_beats_a( 10, 100, 10, 100 );
check( abs( $p - 0.5 ) < 0.01, "equal data gives 0.5 (got $p)" );
check( abs( $S::prob_b_beats_a( 0, 0, 0, 0 ) - 0.5 ) < 0.01, 'no data at all gives 0.5' );

$p  = $S::prob_b_beats_a( 10, 100, 20, 100 );
$mc = hd_test_mc_prob( 10, 100, 20, 100 );
check( $p > 0.95 && $p < 0.99, "10/100 vs 20/100 is ≈0.97–0.98 (got $p)" );
check( abs( $p - $mc ) < 0.015, "closed form agrees with an independent Monte Carlo ($p vs $mc)" );

$p  = $S::prob_b_beats_a( 30, 400, 38, 380 );
$mc = hd_test_mc_prob( 30, 400, 38, 380 );
check( abs( $p - $mc ) < 0.02, "closed form agrees with Monte Carlo on a close call ($p vs $mc)" );

$ab = $S::prob_b_beats_a( 12, 150, 21, 160 );
$ba = $S::prob_b_beats_a( 21, 160, 12, 150 );
check( abs( $ab + $ba - 1 ) < 1e-6, "symmetric: P(B>A) + P(A>B) = 1 (got " . ( $ab + $ba ) . ')' );

// Large-n path (normal approximation) stays consistent with the exact path.
$exact  = $S::prob_b_beats_a( 250, 5000, 280, 5000 );
$approx = $S::prob_b_beats_a( 251, 5001, 281, 5001 );
check( abs( $exact - $approx ) < 0.02, "normal approximation matches exact near the switch ($exact vs $approx)" );
$big = $S::prob_b_beats_a( 500, 10000, 500, 10000 );
check( abs( $big - 0.5 ) < 0.001, "large equal arms give 0.5 (got $big)" );

// --- Expected loss ----------------------------------------------------------------
$l1 = $S::expected_loss( 10, 100, 20, 100 );
$l2 = $S::expected_loss( 10, 100, 20, 100 );
check( $l1 === $l2, 'expected loss is deterministic' );
check( $l1['b'] < $l1['a'], 'choosing the better arm (B) has the smaller loss' );
check( $l1['a'] > 0.08 && $l1['a'] < 0.12, 'loss of choosing A ≈ the 0.1 gap (got ' . $l1['a'] . ')' );
$eq = $S::expected_loss( 10, 100, 10, 100 );
check( abs( $eq['a'] - $eq['b'] ) < 0.003, 'equal arms have ≈ equal loss' );

// --- Guards -------------------------------------------------------------------------
$arms = array(
	'control'    => array( 'flow' => 'classic', 'visitors' => 120, 'leads' => 7 ),
	'challenger' => array( 'flow' => 'swipe', 'visitors' => 90, 'leads' => 12 ),
);
$d = $S::evaluate( $arms, 9 );
check( 'running' === $d['status'] && null === $d['winner'], 'guards unmet → running' );
check( in_array( '5 more days', $d['guards'], true ), '"5 more days" guard (got ' . implode( ' | ', $d['guards'] ) . ')' );
check( in_array( '3 more leads in Classic', $d['guards'], true ), '"3 more leads in Classic" guard' );
check( in_array( '10 more visitors in Swipe', $d['guards'], true ), '"10 more visitors in Swipe" guard' );
check( 3 === count( $d['guards'] ), 'no guard for the satisfied minimums' );
$arms['control']['leads'] = 9;
$d = $S::evaluate( $arms, 13, array( 'min_visitors_per_arm' => 0 ) );
check( array( '1 more day', '1 more lead in Classic' ) === $d['guards'], 'singular wording + rule overrides (got ' . implode( ' | ', $d['guards'] ) . ')' );
$arms['control']['label'] = 'The Classic';
$d = $S::evaluate( $arms, 20 );
check( in_array( '1 more lead in The Classic', $d['guards'], true ), 'an arm label is used when given' );

// --- Outcomes -------------------------------------------------------------------------
$win = array(
	'control'    => array( 'flow' => 'classic', 'visitors' => 1000, 'leads' => 30 ),
	'challenger' => array( 'flow' => 'swipe', 'visitors' => 1000, 'leads' => 60 ),
);
$d = $S::evaluate( $win, 21 );
check( 'winner' === $d['status'] && 'swipe' === $d['winner'], 'a clearly better challenger wins' );
check( $d['prob_challenger_better'] > 0.99, 'with P > 0.99' );
check( abs( $d['rates']['control'] - 0.03 ) < 1e-9 && abs( $d['rates']['challenger'] - 0.06 ) < 1e-9, 'rates reported' );

$flip = array( 'control' => $win['challenger'], 'challenger' => $win['control'] );
$d    = $S::evaluate( $flip, 21 );
check( 'winner' === $d['status'] && 'swipe' === $d['winner'], 'a clearly better control wins too' );

$d = $S::evaluate( $win, 10 );
check( 'running' === $d['status'], 'no winner before min_days however strong the data' );

$tie = array(
	'control'    => array( 'flow' => 'classic', 'visitors' => 1000, 'leads' => 40 ),
	'challenger' => array( 'flow' => 'swipe', 'visitors' => 1000, 'leads' => 42 ),
);
check( 'running' === $S::evaluate( $tie, 30 )['status'], 'a close call keeps running before max_days' );
$d = $S::evaluate( $tie, 84 );
check( 'no_difference' === $d['status'] && null === $d['winner'], 'a close call at max_days is no_difference' );

// P high but loss above threshold → not yet a winner.
$d = $S::evaluate( $win, 21, array( 'loss_threshold' => 0.0 ) );
check( 'running' === $d['status'], 'the loss threshold must also be met' );

hd_test_done( 'experiment-stats.test.php' );
