<?php
/**
 * The two A/B test emails to Daniel: "X is the clear winner" and "no clear difference".
 * Plain text, sent to the enquiry recipient list with the same (default) sender as the
 * enquiry notifications. Each is sent once per experiment (see HD_DD_Experiments).
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Experiment_Notifier {

	/**
	 * @param array $exp      The experiment option.
	 * @param array $decision HD_DD_Experiment_Stats::evaluate() result (winner / no_difference).
	 * @param array $arms     Per arm {flow, label, visitors, leads}.
	 * @param int   $days_run Whole days the test has run.
	 * @return bool wp_mail result.
	 */
	public static function send( array $exp, array $decision, array $arms, $days_run ) {
		$mail = self::build( $exp, $decision, $arms, $days_run );
		$to   = HD_DD_Plugin::settings()['recipient_email']; // comma list — wp_mail accepts it as-is.
		return wp_mail( $to, $mail['subject'], $mail['body'], array( 'Content-Type: text/plain; charset=UTF-8' ) );
	}

	/** @return array{subject:string,body:string} */
	public static function build( array $exp, array $decision, array $arms, $days_run ) {
		$winner  = isset( $decision['winner'] ) ? $decision['winner'] : null;
		$p_chal  = isset( $decision['prob_challenger_better'] ) ? (float) $decision['prob_challenger_better'] : 0.5;
		$control = $arms['control'];
		$chal    = $arms['challenger'];
		$lines   = array();

		if ( $winner ) {
			$w_label = HD_DD_Experiments::flow_label( $winner );
			$l_arm   = $winner === $chal['flow'] ? $control : $chal;
			$p_win   = $winner === $chal['flow'] ? $p_chal : 1 - $p_chal;
			/* translators: %s: flow name */
			$subject = sprintf( __( 'Door designer A/B test: %s is the clear winner', 'hd-door-designer' ), $w_label );
			$lines[] = sprintf(
				/* translators: 1: winning flow, 2: other flow, 3: probability */
				__( 'The %1$s designer is getting more enquiries than %2$s. There is a %3$s chance it is genuinely better, not luck.', 'hd-door-designer' ),
				$w_label,
				$l_arm['label'],
				self::pct( $p_win )
			);
		} else {
			$subject = __( 'Door designer A/B test: no clear difference', 'hd-door-designer' );
			$lines[] = sprintf(
				/* translators: %d: days */
				__( 'After %d days neither designer is clearly better at turning visitors into enquiries. Keep whichever you prefer.', 'hd-door-designer' ),
				(int) $days_run
			);
			$lines[] = sprintf(
				/* translators: 1: challenger, 2: control, 3: probability */
				__( 'Chance %1$s beats %2$s: %3$s.', 'hd-door-designer' ),
				$chal['label'],
				$control['label'],
				self::pct( $p_chal )
			);
		}

		$lines[] = '';
		foreach ( array( $control, $chal ) as $arm ) {
			$rate    = $arm['visitors'] ? $arm['leads'] / $arm['visitors'] : 0;
			$lines[] = sprintf(
				/* translators: 1: flow, 2: visitors, 3: leads, 4: conversion rate */
				__( '%1$s: %2$d visitors opened the designer, %3$d enquiries (%4$s conversion)', 'hd-door-designer' ),
				$arm['label'],
				$arm['visitors'],
				$arm['leads'],
				self::pct( $rate, 1 )
			);
		}
		foreach ( array( 'control' => $control, 'challenger' => $chal ) as $key => $arm ) {
			if ( isset( $decision['loss'][ $key ] ) ) {
				$lines[] = self::loss_line( $arm['label'], $decision['loss'][ $key ] );
			}
		}
		$lines[] = '';
		$lines[] = self::context_note();
		$lines[] = '';
		/* translators: 1: days, 2: start date */
		$lines[] = sprintf( __( 'The test has run for %1$d days (started %2$s UTC).', 'hd-door-designer' ), (int) $days_run, $exp['started_at'] );
		$lines[] = '';
		$lines[] = __( 'The test keeps running until you act. Review it and choose here:', 'hd-door-designer' );
		$lines[] = admin_url( 'admin.php?page=hd-dd-experiments' );
		$lines[] = '';
		$lines[] = __( '"Make X the default" ends the test and shows that designer to every visitor from then on. You can start a new test at any time.', 'hd-door-designer' );

		return array(
			'subject' => $subject,
			'body'    => implode( "\n", $lines ),
		);
	}

	/**
	 * Honest context for the numbers, shown in the emails and on the Experiments page.
	 * Figures are from simulations of this site's traffic (about 4 leads a week).
	 */
	public static function context_note() {
		return __( 'For context: with about 4 leads a week, a doubling in enquiries usually shows within about 2 months and a 50% lift in about 3 months; smaller lifts often never become clear, so "no clear difference" after 6 months is a normal outcome.', 'hd-door-designer' );
	}

	/** "Expected loss if you pick Swipe: 0.12 conversion-rate points". */
	public static function loss_line( $label, $loss ) {
		/* translators: 1: flow, 2: expected loss in conversion-rate points */
		return sprintf( __( 'Expected loss if you pick %1$s: %2$s conversion-rate points', 'hd-door-designer' ), $label, number_format( 100 * (float) $loss, 2 ) );
	}

	/** 0.9731 → "97%" (or "97.3%" with one decimal). */
	public static function pct( $p, $decimals = 0 ) {
		return number_format( 100 * (float) $p, $decimals ) . '%';
	}
}
