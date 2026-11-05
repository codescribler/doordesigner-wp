<?php
/**
 * wp-admin views for the saver follow-ups: a status line with a "Stop follow-ups" button on a
 * saved design's screen, and the Settings section that starts follow-ups for earlier saves.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Follow_Up_Admin {

	/** One plain sentence about a save's follow-ups. */
	public static function status_text( $f ) {
		if ( ! $f ) {
			return __( 'No follow-up emails for this design.', 'hd-door-designer' );
		}
		$sent = (int) $f->sent_steps;
		/* translators: 1: emails sent, 2: total emails */
		$text = sprintf( __( '%1$d of %2$d follow-up emails sent.', 'hd-door-designer' ), $sent, HD_DD_Follow_Up_Plan::STEPS );
		if ( $f->stopped_at ) {
			$why   = isset( HD_DD_Follow_Up::REASONS[ $f->stop_reason ] ) ? HD_DD_Follow_Up::REASONS[ $f->stop_reason ] : (string) $f->stop_reason;
			$text .= ' ' . sprintf( /* translators: %s: reason */ __( 'Stopped: %s.', 'hd-door-designer' ), $why );
			return $text;
		}
		$due = HD_DD_Follow_Up_Plan::next_due( strtotime( $f->started_at . ' UTC' ), $sent, $f->last_sent_at ? strtotime( $f->last_sent_at . ' UTC' ) : null );
		if ( $due ) {
			$text .= ' ' . sprintf( /* translators: %s: date */ __( 'Next one from %s (sent between 8am and 8pm).', 'hd-door-designer' ), wp_date( 'j M H:i', $due ) );
		}
		return $text;
	}

	/** The block on a saved design's screen. */
	public static function render_detail_box( $row ) {
		if ( ! $row || 'save' !== ( isset( $row->kind ) ? $row->kind : '' ) ) {
			return;
		}
		$f = HD_DD_Follow_Up::get( (int) $row->id );
		?>
		<div class="notice notice-info inline" style="margin:12px 0;">
			<p>
				<strong><?php esc_html_e( 'Follow-up emails:', 'hd-door-designer' ); ?></strong>
				<?php echo esc_html( self::status_text( $f ) ); ?>
			</p>
			<?php if ( $f && ! $f->stopped_at ) : ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin:0 0 10px;">
					<input type="hidden" name="action" value="<?php echo esc_attr( HD_DD_Follow_Up::ADMIN_STOP ); ?>" />
					<input type="hidden" name="enquiry_id" value="<?php echo (int) $row->id; ?>" />
					<?php wp_nonce_field( HD_DD_Follow_Up::ADMIN_STOP . '_' . (int) $row->id ); ?>
					<button type="submit" class="button"><?php esc_html_e( 'Stop follow-ups (they replied)', 'hd-door-designer' ); ?></button>
				</form>
			<?php endif; ?>
		</div>
		<?php
	}

	/** The Settings section: what the follow-ups are and the button for earlier saves. */
	public static function render_settings_section() {
		$candidates = HD_DD_Follow_Up::backfill_candidates();
		?>
		<hr>
		<h2><?php esc_html_e( 'Follow-up emails to savers', 'hd-door-designer' ); ?></h2>
		<p class="description">
			<?php esc_html_e( 'Someone who saves a design and does not ask for a price gets three short emails from Daniel, about 1, 2 and 4 days later (8am to 8pm only). They stop as soon as that person asks for a price or a call back, or clicks "No more emails". Replies go to the first enquiry email address above; if someone replies, open their saved design and press "Stop follow-ups".', 'hd-door-designer' ); ?>
		</p>
		<?php if ( isset( $_GET['followups_started'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only flag. ?>
			<div class="notice notice-success inline"><p>
				<?php echo esc_html( sprintf( /* translators: %d: count */ __( 'Follow-ups started for %d earlier saves. The first emails go out within the hour (8am to 8pm).', 'hd-door-designer' ), (int) $_GET['followups_started'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
			</p></div>
		<?php endif; ?>
		<?php if ( $candidates ) : ?>
			<p><?php echo esc_html( sprintf( /* translators: %d: count */ _n( '%d earlier save has not been followed up:', '%d earlier saves have not been followed up:', count( $candidates ), 'hd-door-designer' ), count( $candidates ) ) ); ?></p>
			<ul style="list-style:disc;padding-left:20px;">
				<?php foreach ( $candidates as $c ) : ?>
					<li><?php echo esc_html( mysql2date( 'j M Y', $c->created_at ) . ' — ' . $c->customer_email . ( '' !== (string) $c->design_name ? ' — ' . $c->design_name : '' ) ); ?></li>
				<?php endforeach; ?>
			</ul>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( HD_DD_Follow_Up::BACKFILL ); ?>" />
				<?php wp_nonce_field( HD_DD_Follow_Up::BACKFILL ); ?>
				<?php submit_button( __( 'Start follow-ups for these saves', 'hd-door-designer' ), 'secondary', 'submit', false ); ?>
			</form>
		<?php else : ?>
			<p><?php esc_html_e( 'Every earlier save is either followed up already or has gone on to ask for a price.', 'hd-door-designer' ); ?></p>
		<?php endif; ?>
		<?php
	}
}
