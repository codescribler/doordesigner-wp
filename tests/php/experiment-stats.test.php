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

// --- log-factorial lgamma: Γ(5) = 24, Γ(1) = 1, B(2, 3) = 1/12 ------------------
check( abs( $S::lgamma( 5 ) - log( 24 ) ) < 1e-12, 'lgamma(5) = ln 24' );
check( 0.0 === $S::lgamma( 1 ), 'lgamma(1) = 0' );
check( abs( $S::lbeta( 2, 3 ) - log( 1 / 12 ) ) < 1e-12, 'lbeta(2, 3) = ln 1/12' );

// --- P(B > A) --------------------------------------------------------------------
$p = $S::prob_b_beats_a( 10, 100, 10, 100 );
check( abs( $p - 0.5 ) < 0.01, "equal data gives 0.5 (got $p)" );
check( abs( $S::prob_b_beats_a( 0, 0, 0, 0 ) - 0.5 ) < 0.01, 'no data at all gives 0.5' );

$p  = $S::prob_b_beats_a( 10, 100, 20, 100 );
$mc = hd_test_mc_prob( 10, 100, 20, 100 );
check( abs( $p - 0.9752 ) < 0.001, "10/100 vs 20/100 is 0.9752 (published reference; got $p)" );
check( abs( $p - $mc ) < 0.015, "closed form agrees with an independent Monte Carlo ($p vs $mc)" );

$p  = $S::prob_b_beats_a( 30, 400, 38, 380 );
$mc = hd_test_mc_prob( 30, 400, 38, 380 );
check( abs( $p - $mc ) < 0.02, "closed form agrees with Monte Carlo on a close call ($p vs $mc)" );

$ab = $S::prob_b_beats_a( 12, 150, 21, 160 );
$ba = $S::prob_b_beats_a( 21, 160, 12, 150 );
check( abs( $ab + $ba - 1 ) < 1e-6, "symmetric: P(B>A) + P(A>B) = 1 (got " . ( $ab + $ba ) . ')' );

// Big arms stay exact and stable.
$big = $S::prob_b_beats_a( 500, 10000, 500, 10000 );
check( abs( $big - 0.5 ) < 0.001, "large equal arms give 0.5 (got $big)" );
$big = $S::prob_b_beats_a( 500, 10000, 600, 10000 );
check( $big > 0.99 && $big <= 1.0, "large clearly-better arm is > 0.99 (got $big)" );

// --- Expected loss (closed form) vs an independent Monte Carlo ----------------------
function hd_test_mc_loss( $a_conv, $a_n, $b_conv, $b_n, $draws = 6000 ) {
	mt_srand( 7 );
	$g = function ( $k ) {
		$s = 0.0;
		for ( $i = 0; $i < $k; $i++ ) {
			$s -= log( ( mt_rand() + 1 ) / ( mt_getrandmax() + 2 ) );
		}
		return $s;
	};
	$la = 0.0;
	$lb = 0.0;
	for ( $i = 0; $i < $draws; $i++ ) {
		$ga = $g( 1 + $a_conv );
		$pa = $ga / ( $ga + $g( 1 + $a_n - $a_conv ) );
		$gb = $g( 1 + $b_conv );
		$pb = $gb / ( $gb + $g( 1 + $b_n - $b_conv ) );
		$la += max( $pb - $pa, 0 );
		$lb += max( $pa - $pb, 0 );
	}
	return array( 'a' => $la / $draws, 'b' => $lb / $draws );
}
$l1 = $S::expected_loss( 10, 100, 20, 100 );
$mc = hd_test_mc_loss( 10, 100, 20, 100 );
check( $l1 === $S::expected_loss( 10, 100, 20, 100 ), 'expected loss is deterministic' );
check( $l1['b'] < $l1['a'], 'choosing the better arm (B) has the smaller loss' );
check( abs( $l1['a'] - $mc['a'] ) < 0.003 && abs( $l1['b'] - $mc['b'] ) < 0.001, 'closed-form loss matches Monte Carlo (' . json_encode( $l1 ) . ' vs ' . json_encode( $mc ) . ')' );
// E[p_B - p_A] = EL_A - EL_B exactly (mB - mA).
check( abs( ( $l1['a'] - $l1['b'] ) - ( 21 / 102 - 11 / 102 ) ) < 1e-9, 'EL_A - EL_B equals the difference of posterior means' );
$eq = $S::expected_loss( 10, 100, 10, 100 );
check( abs( $eq['a'] - $eq['b'] ) < 1e-9, 'equal arms have equal loss' );

// --- Guards -------------------------------------------------------------------------
$arms = array(
	'control'    => array( 'flow' => 'classic', 'visitors' => 120, 'leads' => 7 ),
	'challenger' => array( 'flow' => 'swipe', 'visitors' => 90, 'leads' => 12 ),
);
$d = $S::evaluate( $arms, 9 );
check( 'running' === $d['status'] && null === $d['winner'], 'guards unmet → running' );
check( array( '5 more days', '8 more leads in Classic', '3 more leads in Swipe' ) === $d['guards'], 'day + per-arm lead guards, no visitor guard by default (got ' . implode( ' | ', $d['guards'] ) . ')' );
$d = $S::evaluate( $arms, 9, array( 'min_visitors_per_arm' => 100 ) );
check( in_array( '10 more visitors in Swipe', $d['guards'], true ), 'a visitor guard appears when the rule sets one' );
$arms['control']['leads']    = 14;
$arms['challenger']['leads'] = 15;
$d = $S::evaluate( $arms, 13 );
check( array( '1 more day', '1 more lead in Classic' ) === $d['guards'], 'singular wording (got ' . implode( ' | ', $d['guards'] ) . ')' );
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

// A winner either direction needs P >= 0.975: about 0.96 is not enough.
$near = array(
	'control'    => array( 'flow' => 'classic', 'visitors' => 300, 'leads' => 20 ),
	'challenger' => array( 'flow' => 'swipe', 'visitors' => 300, 'leads' => 32 ),
);
$d = $S::evaluate( $near, 30 );
check( $d['prob_challenger_better'] > 0.94 && $d['prob_challenger_better'] < 0.975 && 'running' === $d['status'], 'P between 0.94 and 0.975 is not a winner (P=' . $d['prob_challenger_better'] . ')' );

$tie = array(
	'control'    => array( 'flow' => 'classic', 'visitors' => 1000, 'leads' => 40 ),
	'challenger' => array( 'flow' => 'swipe', 'visitors' => 1000, 'leads' => 42 ),
);
check( 'running' === $S::evaluate( $tie, 181 )['status'], 'a close call keeps running before max_days (182)' );
$d = $S::evaluate( $tie, 182 );
check( 'no_difference' === $d['status'] && null === $d['winner'], 'a close call at 182 days is no_difference' );
check( isset( $d['loss']['control'], $d['loss']['challenger'] ), 'expected loss is still reported per arm' );

// Expected loss never gates the decision.
$d = $S::evaluate( $win, 21, array( 'loss_threshold' => 0.0 ) );
check( 'winner' === $d['status'], 'a loss threshold in the rule has no effect' );
$rule = $S::default_rule();
check( 0.975 === $rule['prob_threshold'] && 15 === $rule['min_leads_per_arm'] && 14 === $rule['min_days'] && 182 === $rule['max_days'] && 0 === $rule['min_visitors_per_arm'], 'default rule matches the research' );

hd_test_done( 'experiment-stats.test.php' );
