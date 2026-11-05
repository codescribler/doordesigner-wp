<?php
/**
 * The rules of the saver follow-up emails, with no WordPress or database calls (tested under
 * plain PHP). HD_DD_Follow_Up does the storing and sending.
 *
 * Someone who saves a design and does not ask for a price gets up to three emails after the
 * save email itself: about 1, 2 and 4 days later, only between 8am and 8pm UK time, never two
 * within 20 hours. Any quote request or call back from that email address ends it.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Follow_Up_Plan {

	/** Email number => hours after the save. */
	const OFFSETS = array(
		1 => 24,
		2 => 48,
		3 => 96,
	);

	const STEPS       = 3;
	const MIN_GAP     = 72000; // 20 hours between two follow-ups, in seconds.
	const WINDOW_FROM = 8;     // UK hour the first send may go …
	const WINDOW_TO   = 20;    // … and the hour sending stops.

	/** Addresses that are ours (test saves), never followed up. */
	const OWN_DOMAINS = array( 'dreamfree.co.uk', 'hertfordshiredoors.co.uk' );

	/**
	 * When the next email is due, or null when all have gone.
	 *
	 * @param int      $started Save time (unix).
	 * @param int      $sent    Emails already sent (0–3).
	 * @param int|null $last    When the last one went (unix), or null.
	 */
	public static function next_due( $started, $sent, $last = null ) {
		$next = (int) $sent + 1;
		if ( ! isset( self::OFFSETS[ $next ] ) ) {
			return null;
		}
		$due = (int) $started + self::OFFSETS[ $next ] * 3600;
		if ( $last ) {
			$due = max( $due, (int) $last + self::MIN_GAP );
		}
		return $due;
	}

	/** Is $ts within the UK daytime sending window? */
	public static function in_window( $ts ) {
		$d    = new DateTime( '@' . (int) $ts );
		$d->setTimezone( new DateTimeZone( 'Europe/London' ) );
		$hour = (int) $d->format( 'G' );
		return $hour >= self::WINDOW_FROM && $hour < self::WINDOW_TO;
	}

	/** Should an email go now? */
	public static function should_send( $started, $sent, $last, $now ) {
		$due = self::next_due( $started, $sent, $last );
		return null !== $due && $due <= (int) $now && self::in_window( $now );
	}

	/**
	 * Why a follow-up must stop before sending, or '' to carry on.
	 *
	 * @param object|null $row      The enquiries-table row (null = deleted).
	 * @param bool        $has_lead The same email has asked for a quote or a call back.
	 */
	public static function stop_reason( $row, $has_lead ) {
		if ( ! $row ) {
			return 'deleted';
		}
		if ( 'save' !== ( isset( $row->kind ) ? (string) $row->kind : '' ) || $has_lead ) {
			return 'converted';
		}
		if ( 'flagged' === ( isset( $row->status ) ? (string) $row->status : '' ) ) {
			return 'flagged';
		}
		if ( ! filter_var( isset( $row->customer_email ) ? (string) $row->customer_email : '', FILTER_VALIDATE_EMAIL ) ) {
			return 'no_email';
		}
		return '';
	}

	/** A save of our own: our email domains, or "test" in the name or design name. */
	public static function is_test( $row ) {
		$email  = strtolower( isset( $row->customer_email ) ? (string) $row->customer_email : '' );
		$domain = substr( strrchr( $email, '@' ), 1 );
		if ( in_array( $domain, self::OWN_DOMAINS, true ) ) {
			return true;
		}
		$text = strtolower( ( isset( $row->customer_name ) ? $row->customer_name : '' ) . ' ' . ( isset( $row->design_name ) ? $row->design_name : '' ) );
		return (bool) preg_match( '/\btest\b/', $text );
	}

	/**
	 * Earlier saves to start following up: the newest save per email address, not flagged,
	 * not ours, from no address that has asked for a quote or call back, not already started.
	 *
	 * @param object[] $saves       Save rows (id, created_at, customer_email, customer_name, design_name, status, kind).
	 * @param string[] $lead_emails Addresses with a quote request or call back.
	 * @param int[]    $started     Enquiry ids that already have a follow-up.
	 * @return object[] Newest first.
	 */
	public static function backfill_candidates( array $saves, array $lead_emails, array $started ) {
		$leads = array_flip( array_map( 'strtolower', $lead_emails ) );
		$done  = array_flip( array_map( 'intval', $started ) );
		usort(
			$saves,
			function ( $a, $b ) {
				return strcmp( (string) $b->created_at, (string) $a->created_at );
			}
		);
		$seen = array();
		$out  = array();
		foreach ( $saves as $s ) {
			$email = strtolower( trim( (string) $s->customer_email ) );
			if ( isset( $seen[ $email ] ) ) {
				continue; // an older save from the same person.
			}
			$seen[ $email ] = true;
			if ( isset( $leads[ $email ] ) || isset( $done[ (int) $s->id ] ) || self::is_test( $s ) || '' !== self::stop_reason( $s, false ) ) {
				continue;
			}
			$out[] = $s;
		}
		return $out;
	}
}
