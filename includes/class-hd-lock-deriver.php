<?php
/**
 * Derives a suggested lock from the chosen handle. The lock is NOT a customer
 * field — it follows mechanically from the handle + door type and is authoritatively
 * decided at the quoting step. We attach a non-binding `suggestedLock` to the
 * enquiry payload as a convenience for the downstream quote-creator.
 *
 * Rule (from the handoff):
 *   - Lever handles                         -> Guardian 5
 *   - Non-operating (pull bars, knobs,
 *     slam-shut, finger pulls)              -> automatic lock (AV2; AV4 where a
 *                                              night latch is needed)
 *   - Stainless flat pull                   -> forces AV4
 *   - Rim pull / Heritage finger pull       -> Heritage
 *
 * This is heuristic and intentionally conservative. Leave the final decision to
 * the trade portal, which enforces handle->lock compatibility itself.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Lock_Deriver {

	/**
	 * @param string $handle_label Exact handle label from the catalogue.
	 * @return string|null Suggested lock label, or null if undetermined.
	 */
	public static function suggest( $handle_label ) {
		$h = strtolower( trim( (string) $handle_label ) );

		if ( '' === $h || 'no handle' === $h ) {
			return null;
		}

		// Stainless flat pull forces AV4.
		if ( false !== strpos( $h, 'stainless flat pull' ) ) {
			return 'AV4 Lock';
		}

		// Heritage finger / rim pulls -> Heritage lock family.
		if ( false !== strpos( $h, 'heritage finger pull' ) || false !== strpos( $h, 'rim pull' ) ) {
			return 'AV2 Heritage Lock';
		}

		// Lever handles -> Guardian 5.
		if ( false !== strpos( $h, 'lever' ) ) {
			return 'Guardian5 Lock';
		}

		// Touch key handle -> touch key lock.
		if ( false !== strpos( $h, 'touch key' ) ) {
			return 'Touch Key Lock';
		}

		// Remaining non-operating handles (pull bars, knobs, finger pull) -> automatic lock.
		return 'AV2 Lock';
	}
}
