<?php
/**
 * Sorts the saver follow-ups into the groups the Follow-up emails page shows: who is in the
 * sequence now (by the email they are waiting for), who finished it, who dropped out and why,
 * and recent saves that never started one (with the reason). Pure: no WordPress or database
 * calls, so it is tested under plain PHP. HD_DD_Follow_Up_Page does the queries and the HTML.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Follow_Up_Board {

	/** Why a save has no follow-up (keys of why_not_started()). */
	const NOT_STARTED = array(
		'test'    => 'Our own test (our email address, or "test" in the name)',
		'flagged' => 'Possible bot',
		'lead'    => 'Already asked for a price or a call back',
		'newer'   => 'They saved a newer design, which is followed up instead',
		'no_email' => 'No valid email address',
		'pending' => 'Not started: use "Start follow-ups for these saves" in Settings',
	);

	/**
	 * @param object[] $follows Follow-up rows joined with the save (customer_email, customer_name,
	 *                          design_name, reference) and its event counts (clicks).
	 * @param object[] $saves   Every save row (id, created_at, customer_email, customer_name,
	 *                          design_name, reference, status, kind).
	 * @param string[] $leads   Email addresses that have asked for a price or call back.
	 * @param string   $since   Only list not-started saves created on or after this (local mysql time).
	 * @return array {running: [1=>[],2=>[],3=>[]], finished: [], stopped: [], not_started: []}
	 */
	public static function build( array $follows, array $saves, array $leads, $since ) {
		$out = array(
			'running'     => array( 1 => array(), 2 => array(), 3 => array() ),
			'finished'    => array(),
			'stopped'     => array(),
			'not_started' => array(),
		);
		$have = array();
		foreach ( $follows as $f ) {
			$have[ (int) $f->enquiry_id ] = true;
			if ( ! $f->stopped_at ) {
				$next = min( HD_DD_Follow_Up_Plan::STEPS, (int) $f->sent_steps + 1 );
				$out['running'][ $next ][] = $f;
			} elseif ( 'finished' === (string) $f->stop_reason ) {
				$out['finished'][] = $f;
			} else {
				$out['stopped'][] = $f;
			}
		}
		foreach ( $saves as $s ) {
			if ( isset( $have[ (int) $s->id ] ) || (string) $s->created_at < (string) $since ) {
				continue;
			}
			$s->why             = self::why_not_started( $s, $saves, $leads );
			$out['not_started'][] = $s;
		}
		usort(
			$out['not_started'],
			function ( $a, $b ) {
				return strcmp( (string) $b->created_at, (string) $a->created_at );
			}
		);
		return $out;
	}

	/** The NOT_STARTED key for a save that has no follow-up row. */
	public static function why_not_started( $save, array $saves, array $leads ) {
		if ( HD_DD_Follow_Up_Plan::is_test( $save ) ) {
			return 'test';
		}
		if ( 'flagged' === (string) $save->status ) {
			return 'flagged';
		}
		$email = strtolower( trim( (string) $save->customer_email ) );
		if ( ! filter_var( $email, FILTER_VALIDATE_EMAIL ) ) {
			return 'no_email';
		}
		if ( in_array( $email, array_map( 'strtolower', $leads ), true ) ) {
			return 'lead';
		}
		foreach ( $saves as $other ) {
			if ( (int) $other->id !== (int) $save->id && strtolower( trim( (string) $other->customer_email ) ) === $email && (string) $other->created_at > (string) $save->created_at ) {
				return 'newer';
			}
		}
		return 'pending';
	}

	/** Counts for the summary line: running (total and per next email), finished, stopped by reason. */
	public static function counts( array $board ) {
		$reasons = array();
		foreach ( $board['stopped'] as $f ) {
			$k             = (string) $f->stop_reason;
			$reasons[ $k ] = ( isset( $reasons[ $k ] ) ? $reasons[ $k ] : 0 ) + 1;
		}
		arsort( $reasons );
		return array(
			'running'     => count( $board['running'][1] ) + count( $board['running'][2] ) + count( $board['running'][3] ),
			'waiting'     => array_map( 'count', $board['running'] ),
			'finished'    => count( $board['finished'] ),
			'stopped'     => count( $board['stopped'] ),
			'reasons'     => $reasons,
			'not_started' => count( $board['not_started'] ),
		);
	}
}
